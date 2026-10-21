/** Runtime config from env. Throws on invalid values so startup fails loudly (stderr). */
export interface McpConfig {
  apiUrl: string;
  maxWaitMs: number;
  pollMs: number;
}

const DEFAULT_API_URL = 'http://localhost:3001';
const DEFAULT_MAX_WAIT_MS = 300_000;
const MIN_MAX_WAIT_MS = 10_000;
const MAX_MAX_WAIT_MS = 600_000;
const DEFAULT_POLL_MS = 3_000;
const MIN_POLL_MS = 1_000;

function intEnv(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer (milliseconds), got "${raw}"`);
  }
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): McpConfig {
  const rawUrl = env.DEVDIGEST_API_URL?.trim() || DEFAULT_API_URL;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`DEVDIGEST_API_URL is not a valid URL: "${rawUrl}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`DEVDIGEST_API_URL must be http or https, got "${url.protocol}"`);
  }
  const apiUrl = rawUrl.replace(/\/+$/, '');
  const maxWaitMs = Math.min(
    MAX_MAX_WAIT_MS,
    Math.max(MIN_MAX_WAIT_MS, intEnv(env.DEVDIGEST_MCP_MAX_WAIT_MS, 'DEVDIGEST_MCP_MAX_WAIT_MS', DEFAULT_MAX_WAIT_MS)),
  );
  const pollMs = Math.max(MIN_POLL_MS, intEnv(env.DEVDIGEST_MCP_POLL_MS, 'DEVDIGEST_MCP_POLL_MS', DEFAULT_POLL_MS));
  return { apiUrl, maxWaitMs, pollMs };
}
