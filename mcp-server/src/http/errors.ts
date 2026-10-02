/**
 * Error taxonomy for `DevDigestHttpClient` + shared forward-leading message
 * builders used by every tool's catch-all branch (the "any" rows in the
 * spec's Error handling table). Tool-specific rows (repo/PR/agent not found,
 * 429, run failed/cancelled, ...) are mapped in each tool module, which has
 * the context (input strings, resolved names) those messages need.
 */

/** A non-2xx JSON response from the Dev Digest API. */
export class DevDigestApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DevDigestApiError';
  }
}

/** `fetch()` itself threw (connection refused, DNS failure, offline, ...). */
export class DevDigestNetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DevDigestNetworkError';
  }
}

/** A request was aborted by a client-side timeout (not a server response). */
export class DevDigestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevDigestTimeoutError';
  }
}

/**
 * Detect rate-limiting by HTTP status ONLY — never by `error.code`.
 *
 * Confirmed by reading `server/src/app.ts`'s `setErrorHandler`: a 429 from
 * `@fastify/rate-limit` falls through the generic catch-all branch, which
 * sets `error.code = "internal_error"` even though the HTTP status is 429.
 * `AppError` subclasses (e.g. `NotFoundError` -> 404) set `error.code`
 * correctly; only the rate-limit path is mislabeled. See mcp-server/LEARNINGS.md.
 */
export function isRateLimited(err: unknown): err is DevDigestApiError {
  return err instanceof DevDigestApiError && err.status === 429;
}

/** "any / backend unreachable" row of the Error handling table. */
export function unreachableMessage(baseUrl: string): string {
  return `Cannot reach the Dev Digest API at ${baseUrl}. Is the server running? Start it with \`cd server && pnpm dev\` (or \`./scripts/dev.sh\`), then retry.`;
}

/** "any / unexpected 5xx" row of the Error handling table. */
export function unexpectedServerErrorMessage(status: number, message: string): string {
  return `Dev Digest API returned an unexpected error (${status}): ${message}. This is likely a server bug — check the server logs.`;
}

/**
 * Last-resort mapping shared by every tool's catch-all branch: network
 * failure / client-side timeout -> "unreachable"; unexpected 5xx -> the 5xx
 * message; anything else -> a generic but still forward-leading fallback.
 * Tool-specific errors (404/429/etc.) must be handled BEFORE falling back
 * to this — it has no knowledge of which tool or input triggered them.
 */
export function commonErrorMessage(err: unknown, baseUrl: string): string {
  if (err instanceof DevDigestNetworkError || err instanceof DevDigestTimeoutError) {
    return unreachableMessage(baseUrl);
  }
  if (err instanceof DevDigestApiError && err.status >= 500) {
    return unexpectedServerErrorMessage(err.status, err.message);
  }
  if (err instanceof Error) {
    return `Unexpected error: ${err.message}. Retry, or check the server logs if this keeps happening.`;
  }
  return 'Unexpected error. Retry, or check the server logs if this keeps happening.';
}
