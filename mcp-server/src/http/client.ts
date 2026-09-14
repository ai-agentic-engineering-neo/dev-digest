import { DevDigestApiError, DevDigestNetworkError, DevDigestTimeoutError } from './errors.js';

/** Matches the global `fetch` signature — injectable so every layer above
 *  can be tested against a hand-written fake (this repo's DI-based
 *  test-double convention; see `server/src/adapters/mocks.ts`), never
 *  module-level mocking. */
export type FetchImpl = typeof fetch;

/** Per-call timeout for every read-only GET/POST. A code constant, not an
 *  env var — see specs/06-mcp-server.md "Config / bootstrapping". The SSE
 *  wait inside run_agent_on_pr manages its own (much longer) budget via an
 *  externally-supplied AbortSignal passed to `openEventStream`. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface DevDigestHttpClientOptions {
  baseUrl: string;
  fetchImpl?: FetchImpl;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

/**
 * The ONLY module in this package that calls `fetch()`. Owns the base URL,
 * per-call `AbortController` timeout, and JSON-envelope parsing. SSE frame
 * parsing itself lives in `src/http/sse.ts`, fed by the raw stream this
 * client returns from `openEventStream`.
 */
export class DevDigestHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(options: DevDigestHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    return this.request<T>('GET', path, undefined, timeoutMs);
  }

  async post<T>(path: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    return this.request<T>('POST', path, body, timeoutMs);
  }

  /**
   * Opens an SSE connection and returns the raw response body stream for
   * `src/http/sse.ts` to parse. No internal timeout here — the caller (only
   * `run_agent_on_pr`) owns the `AbortController` and its ~118s budget,
   * since the connection must stay open for as long as the review run
   * takes. If `signal` fires, the underlying fetch rejects with an
   * `AbortError`, which is rethrown as-is so the caller can distinguish
   * "I aborted this on purpose (timeout budget)" from a real network error
   * via `signal.aborted`.
   */
  async openEventStream(path: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { Accept: 'text/event-stream' },
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new DevDigestNetworkError(networkErrorMessage(err), err);
    }
    if (!res.ok || !res.body) {
      const details = await safeReadError(res);
      throw new DevDigestApiError(res.status, details.code, details.message, details.details);
    }
    return res.body;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });
      } catch (err) {
        if (isAbortError(err)) {
          throw new DevDigestTimeoutError(`Request to ${path} timed out after ${timeoutMs}ms.`);
        }
        throw new DevDigestNetworkError(networkErrorMessage(err), err);
      }
      if (!res.ok) {
        const details = await safeReadError(res);
        throw new DevDigestApiError(res.status, details.code, details.message, details.details);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function networkErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'fetch failed';
}

/** Parses `{ error: { code, message, details } }` (server/src/app.ts's
 *  error envelope), falling back gracefully if the body isn't JSON. */
async function safeReadError(res: Response): Promise<{ code?: string; message: string; details?: unknown }> {
  try {
    const body = (await res.json()) as ErrorEnvelope;
    return {
      ...(body.error?.code !== undefined ? { code: body.error.code } : {}),
      message: body.error?.message ?? res.statusText,
      details: body.error?.details,
    };
  } catch {
    return { message: res.statusText || `HTTP ${res.status}` };
  }
}
