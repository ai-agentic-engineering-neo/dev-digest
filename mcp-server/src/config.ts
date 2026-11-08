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
/** Smallest common client limit on a tool call: MCP Inspector's default "Maximum Total Timeout" (60 s). */
export const TYPICAL_CLIENT_TIMEOUT_MS = 60_000;
/**
 * How long run_agent_on_pr waits, counted from the start of the call (resolution included). Kept below
 * TYPICAL_CLIENT_TIMEOUT_MS so the server answers `status: "running"` + run_id before a client aborts the
 * call (`MCP error -32001`); the model then follows up with get_findings. Raise it via
 * DEVDIGEST_RUN_TIMEOUT_MS only for clients with a larger limit (Claude Code: `timeout` in .mcp.json).
 */
export const DEFAULT_RUN_TIMEOUT_MS = 50_000;
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
