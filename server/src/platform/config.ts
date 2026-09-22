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
});

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
  /** DEV/E2E ONLY — 'mock' routes every LLM provider to the deterministic mock. */
  llmProviderOverride?: 'mock';
  /** Latency of each mock LLM call (ms); only used with llmProviderOverride. */
  llmMockDelayMs?: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  if (parsed.LLM_PROVIDER_OVERRIDE && parsed.NODE_ENV === 'production') {
    throw new Error('LLM_PROVIDER_OVERRIDE is a dev/e2e switch and is refused when NODE_ENV=production');
  }
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
    ...(parsed.REVIEW_MAP_CONCURRENCY !== undefined ? { reviewMapConcurrency: parsed.REVIEW_MAP_CONCURRENCY } : {}),
    ...(parsed.LLM_PROVIDER_OVERRIDE ? { llmProviderOverride: parsed.LLM_PROVIDER_OVERRIDE } : {}),
    ...(parsed.LLM_MOCK_DELAY_MS !== undefined ? { llmMockDelayMs: parsed.LLM_MOCK_DELAY_MS } : {}),
  };
}
