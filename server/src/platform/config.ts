import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5432/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  // Max map-reduce chunks (files) a review sends to the LLM in parallel. Unset
  // → reviewer-core's DEFAULT_MAP_CONCURRENCY. A cancel aborts every in-flight
  // chunk; chunks not started yet never start.
  REVIEW_MAP_CONCURRENCY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(16).optional(),
  ),
  // Kill switch for the intent layer (server/specs/05-intent-layer.md).
  // Default ON; 'false' → the executor's shared pre-work skips intent
  // derivation entirely (no call, no pr_intent row, prompt byte-identical to
  // before this feature). String compare (like REPO_INTEL_ENABLED below), NOT
  // z.coerce.boolean() — Boolean('false') is true, which would silently invert
  // every test/env that sets it to the string 'false'.
  REVIEW_INTENT_ENABLED: z.string().optional(),
  // DEV/E2E ONLY: `mock` resolves EVERY LLM provider to the deterministic
  // MockReviewLLMProvider (adapters/llm/mock.ts) — no network, no keys, no
  // spend. Refused in production; the server logs a loud warning at boot.
  LLM_PROVIDER_OVERRIDE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['mock']).optional()),
  // Artificial latency of each mock LLM call (ms), so the UI's live-run state
  // is observable. Abortable (run cancel). Default 0.
  LLM_MOCK_DELAY_MS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(60_000).optional(),
  ),
  API_PORT: z.coerce.number().int().default(3001),
  // Interface the API binds to. Loopback by default: the API has no auth and
  // holds provider keys, so it must not be reachable from the LAN unless the
  // operator opts in (e.g. API_HOST=0.0.0.0 inside a container).
  API_HOST: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).default('127.0.0.1')),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
  // DEV ONLY: adds identifiers (never prompt CONTENT) to the structured
  // `prompt_assembled` log line — e.g. which file a review chunk covers, which
  // ticket/doc an intent derivation used. String compare (like
  // REVIEW_INTENT_ENABLED above), NOT z.coerce.boolean(). Refused in
  // production (loadConfig throws, mirrors LLM_PROVIDER_OVERRIDE); silently
  // OFF outside development or off loopback (loadConfig warns via
  // `promptLogVerboseDisabledReason`, server.ts logs it once at boot).
  PROMPT_LOG_VERBOSE: z.string().optional(),
});

/** 127.0.0.0/8, `::1`, or `localhost` — the interfaces the API may safely bind
 *  to without authentication (see API_HOST above). */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return true;
  const octets = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!octets) return false;
  const nums = octets.slice(1).map(Number);
  return nums[0] === 127 && nums.every((n) => n >= 0 && n <= 255);
}

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  /** Interface the API listens on (default 127.0.0.1 — loopback only). */
  apiHost: string;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /** Max map-reduce chunks in flight per review; undefined = reviewer-core default. */
  reviewMapConcurrency?: number;
  /** Kill switch for the intent layer (server/specs/05-intent-layer.md). Default true. */
  reviewIntentEnabled: boolean;
  /** DEV/E2E ONLY — 'mock' routes every LLM provider to the deterministic mock. */
  llmProviderOverride?: 'mock';
  /** Latency of each mock LLM call (ms); only used with llmProviderOverride. */
  llmMockDelayMs?: number;
  /** Raw PROMPT_LOG_VERBOSE=true request, before the dev+loopback gate below. */
  promptLogVerboseRequested: boolean;
  /** Effective verbose gate: requested AND development AND API_HOST is loopback. */
  promptLogVerbose: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  if (parsed.LLM_PROVIDER_OVERRIDE && parsed.NODE_ENV === 'production') {
    throw new Error('LLM_PROVIDER_OVERRIDE is a dev/e2e switch and is refused when NODE_ENV=production');
  }
  const promptLogVerboseRequested = parsed.PROMPT_LOG_VERBOSE === 'true';
  if (promptLogVerboseRequested && parsed.NODE_ENV === 'production') {
    throw new Error('PROMPT_LOG_VERBOSE is a dev-only switch and is refused when NODE_ENV=production');
  }
  const promptLogVerbose =
    promptLogVerboseRequested && parsed.NODE_ENV === 'development' && isLoopbackHost(parsed.API_HOST);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    apiHost: parsed.API_HOST,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    reviewIntentEnabled: parsed.REVIEW_INTENT_ENABLED !== 'false',
    promptLogVerboseRequested,
    promptLogVerbose,
    ...(parsed.REVIEW_MAP_CONCURRENCY !== undefined ? { reviewMapConcurrency: parsed.REVIEW_MAP_CONCURRENCY } : {}),
    ...(parsed.LLM_PROVIDER_OVERRIDE ? { llmProviderOverride: parsed.LLM_PROVIDER_OVERRIDE } : {}),
    ...(parsed.LLM_MOCK_DELAY_MS !== undefined ? { llmMockDelayMs: parsed.LLM_MOCK_DELAY_MS } : {}),
  };
}

/**
 * `PROMPT_LOG_VERBOSE=true` was requested but the dev+loopback gate turned it
 * off (production is refused outright by `loadConfig`, above) — null when
 * there's nothing to warn about. server.ts logs this once at boot (mirrors the
 * LLM_PROVIDER_OVERRIDE=mock warning). No secrets: only nodeEnv/apiHost.
 */
export function promptLogVerboseDisabledReason(config: AppConfig): string | null {
  if (!config.promptLogVerboseRequested || config.promptLogVerbose) return null;
  return (
    `PROMPT_LOG_VERBOSE=true was requested but is disabled: it requires NODE_ENV=development ` +
    `and API_HOST on loopback (current nodeEnv=${config.nodeEnv}, apiHost=${config.apiHost}).`
  );
}

/**
 * `PROMPT_LOG_VERBOSE` ended up effectively ON (dev + loopback) — null when
 * it didn't. server.ts logs this once at boot, distinct from
 * `promptLogVerboseDisabledReason` above (the two are mutually exclusive: a
 * request is either gated off or on). No secrets: says only that
 * `prompt_assembled` log lines now also carry IDENTIFIERS (e.g. a review
 * chunk's file path, an intent source's kind/ref/status) — never prompt
 * content.
 */
export function promptLogVerboseEnabledReason(config: AppConfig): string | null {
  if (!config.promptLogVerbose) return null;
  return (
    `PROMPT_LOG_VERBOSE=true is ON: prompt_assembled log lines now also include IDENTIFIERS ` +
    `(e.g. a review chunk's file path, an intent source's kind/ref/status) — never prompt content or secrets. Local dev only.`
  );
}
