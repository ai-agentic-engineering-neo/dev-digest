/**
 * resilience primitives: timeouts on every external call + retry with
 * exponential backoff on transient failures (rate-limit / 5xx).
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Bound an async operation by `ms`.
 *
 * - `withTimeout(promise, ms)` only RACES: on timeout the caller gets a
 *   TimeoutError but the underlying work keeps running. Use it for SDK calls
 *   that take no signal.
 * - `withTimeout((signal) => work(signal), ms, parent?)` also ABORTS: the work
 *   receives an AbortSignal that fires (reason = TimeoutError) when the timeout
 *   hits, or when `parent` aborts (e.g. shutdown). Prefer this form whenever the
 *   work can forward a signal (fetch, SDK `{ signal }`, simple-git `abort`).
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T>;
export function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  parent?: AbortSignal,
): Promise<T>;
export async function withTimeout<T>(
  work: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  ms: number,
  parent?: AbortSignal,
): Promise<T> {
  let controller: AbortController | undefined;
  let offParent: (() => void) | undefined;
  let p: Promise<T>;
  if (typeof work === 'function') {
    controller = new AbortController();
    const c = controller;
    if (parent?.aborted) c.abort(parent.reason);
    else if (parent) {
      const onAbort = () => c.abort(parent.reason);
      parent.addEventListener('abort', onAbort, { once: true });
      offParent = () => parent.removeEventListener('abort', onAbort);
    }
    p = work(c.signal);
  } else {
    p = work;
  }
  if (!ms || ms <= 0) {
    try {
      return await p;
    } finally {
      offParent?.();
    }
  }
  let handle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      const err = new TimeoutError(ms);
      controller?.abort(err);
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(handle!);
    offParent?.();
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide whether an error is retryable (rate-limit / 5xx by default). */
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown) => void;
}

/** Default retry predicate: rate limit, 5xx and network resets. Timeouts/aborts are not retried. */
export function isTransient(err: unknown): boolean {
  const status =
    (err as { status?: number })?.status ??
    (err as { statusCode?: number })?.statusCode ??
    (err as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  // network-ish errors
  const code = (err as { code?: string })?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 8000;
  const isRetryable = opts.isRetryable ?? isTransient;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) break;
      opts.onRetry?.(attempt + 1, err);
      const delay = Math.min(max, base * 2 ** attempt) + Math.random() * base;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
