import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Local-only debug: logs prompt-assembly section metadata (section name,
  // source, length in characters) for every review run — NEVER section
  // content (no diff, no spec/issue text, no secrets). Default OFF; don't
  // enable in a shared/hosted environment, only for local prompt debugging.
  PROMPT_ASSEMBLY_DEBUG: z.string().optional(),
  // specs/14-export-to-ci.md (AC-14/AC-52/P-2) — absolute path to the
  // pulled-in agent-runner's committed bundle DIRECTORY (every file ncc
  // emits there, not one enumerated file). Defaults to the sibling
  // package's `dist/`; overridable for tests/deployments that lay out
  // packages differently.
  CI_RUNNER_BUNDLE_DIR: z.string().optional(),
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
   * Local-only: emit one pino `debug` line per agent run with prompt-assembly
   * section metadata (name, source, char length) — never section content.
   * Default false. See PROMPT_ASSEMBLY_DEBUG above.
   */
  promptAssemblyDebugEnabled: boolean;
  /**
   * Absolute path to the agent-runner's committed bundle DIRECTORY
   * (`agent-runner/dist/`, P-2 — copied wholesale: `index.js`, the
   * lazily-loaded `310.index.js` chunk, `package.json`), placed into every
   * generated CI bundle under `.devdigest/runner/` (AC-14). A missing/empty
   * directory is an unmet PRECONDITION (AC-52), not a runtime crash —
   * `modules/ci/bundle.ts` checks this before generating.
   */
  ciRunnerBundleDir: string;
};

// `server/src/platform/config.ts` -> up to the server package root -> the
// sibling `agent-runner` package (both live at the worktree root).
const DEFAULT_CI_RUNNER_BUNDLE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../agent-runner/dist',
);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  const ciRunnerBundleDir = parsed.CI_RUNNER_BUNDLE_DIR
    ? isAbsolute(parsed.CI_RUNNER_BUNDLE_DIR)
      ? parsed.CI_RUNNER_BUNDLE_DIR
      : resolve(process.cwd(), parsed.CI_RUNNER_BUNDLE_DIR)
    : DEFAULT_CI_RUNNER_BUNDLE_DIR;
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
    promptAssemblyDebugEnabled: parsed.PROMPT_ASSEMBLY_DEBUG === 'true',
    ciRunnerBundleDir,
  };
}
