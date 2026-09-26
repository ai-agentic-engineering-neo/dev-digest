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
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
  // L03 — prompt logging (see docs/agent-prompts/README.md § How a prompt is
  // assembled). Same '' → undefined pattern as LOG_LEVEL. 'verbose' is gated
  // to non-production in loadConfig, not here: the schema only validates the
  // literal value, not the NODE_ENV interaction.
  PROMPT_LOG: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['summary', 'verbose']).optional(),
  ),
});

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
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
  /**
   * L03 — prompt-log detail level. 'summary' logs one text-free record per
   * assembled prompt (section name/source/role/untrusted/chars/tokens_est).
   * 'verbose' (local only — see promptLogVerboseIgnored) adds per-section
   * fingerprints, diff file paths, skill names and intent source refs.
   */
  promptLog: 'summary' | 'verbose';
  /** True when PROMPT_LOG=verbose was set but ignored because NODE_ENV=production. */
  promptLogVerboseIgnored: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  const promptLogVerboseIgnored =
    parsed.PROMPT_LOG === 'verbose' && parsed.NODE_ENV === 'production';
  const promptLog: 'summary' | 'verbose' =
    parsed.PROMPT_LOG === 'verbose' && parsed.NODE_ENV !== 'production' ? 'verbose' : 'summary';
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    promptLog,
    promptLogVerboseIgnored,
  };
}

/**
 * Pure post-load warnings to surface once at boot. `loadConfig` has no
 * logger (it may run in scripts/tests too) — `app.ts` calls this after
 * Fastify is constructed and logs each entry via `app.log.warn`.
 */
export function startupWarnings(config: AppConfig): { obj: Record<string, unknown>; msg: string }[] {
  const warnings: { obj: Record<string, unknown>; msg: string }[] = [];
  if (config.promptLogVerboseIgnored) {
    warnings.push({
      obj: { promptLog: 'verbose', nodeEnv: 'production' },
      msg: 'PROMPT_LOG=verbose ignored in production; using summary',
    });
  }
  return warnings;
}
