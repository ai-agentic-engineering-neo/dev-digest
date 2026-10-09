/**
 * Env var -> runtime config. Kept intentionally tiny: this package has no
 * secrets/auth of its own (see `LocalNoAuthProvider` in the backend
 * investigation, specs/06-mcp-server.md) — only the API base URL varies.
 */
export interface Config {
  apiBaseUrl: string;
}

const DEFAULT_API_BASE_URL = 'http://localhost:3001';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env.DEVDIGEST_API_BASE_URL?.trim();
  return {
    apiBaseUrl: raw && raw.length > 0 ? raw.replace(/\/$/, '') : DEFAULT_API_BASE_URL,
  };
}
