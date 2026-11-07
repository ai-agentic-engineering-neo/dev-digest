/** Runtime configuration — environment only (no files, no secrets needed for the local API). */
export interface Config {
  /** DevDigest HTTP API base URL, no trailing slash. */
  apiUrl: string;
  /** How long run_agent_on_pr waits for a run before returning `status: "running"`. */
  runTimeoutMs: number;
  /** Poll interval for the run status. */
  pollMs: number;
}

/** Same default as server `config.apiPort` (API_PORT=3001). */
export const DEFAULT_API_URL = 'http://localhost:3001';
/** Claude Code's tool timeout defaults to ~28 h (stdio idle 30 min), so 3 min is our own cap. */
export const DEFAULT_RUN_TIMEOUT_MS = 180_000;
export const DEFAULT_POLL_MS = 2_000;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiUrl: (env.DEVDIGEST_API_URL || DEFAULT_API_URL).replace(/\/+$/, ''),
    runTimeoutMs: positiveInt(env.DEVDIGEST_RUN_TIMEOUT_MS, DEFAULT_RUN_TIMEOUT_MS),
    pollMs: positiveInt(env.DEVDIGEST_POLL_MS, DEFAULT_POLL_MS),
  };
}
