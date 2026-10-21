import type { RunFindings } from '@devdigest/shared';
import { ApiError } from './api/client.js';

export type WaitOutcome =
  | { kind: 'finished'; data: RunFindings }
  | { kind: 'timeout'; last: RunFindings | undefined }
  | { kind: 'aborted'; last: RunFindings | undefined };

export interface WaitOptions {
  fetchRun: () => Promise<RunFindings>;
  intervalMs: number;
  maxWaitMs: number;
  signal?: AbortSignal;
  onProgress?: (elapsedS: number, last: RunFindings) => void | Promise<void>;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
}

const DEFAULT_BACKOFF_MS = 10_000;

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Poll one run until it leaves `running`, the max wait passes, or the caller aborts. */
export async function waitForRun(opts: WaitOptions): Promise<WaitOutcome> {
  const start = opts.now();
  let last: RunFindings | undefined;
  for (;;) {
    if (opts.signal?.aborted) return { kind: 'aborted', last };
    let pause = opts.intervalMs;
    try {
      const data = await opts.fetchRun();
      last = data;
      if (data.run.status !== 'running') return { kind: 'finished', data };
      const elapsed = opts.now() - start;
      if (elapsed >= opts.maxWaitMs) return { kind: 'timeout', last };
      await opts.onProgress?.(Math.round(elapsed / 1000), data);
    } catch (err) {
      if (opts.signal?.aborted) return { kind: 'aborted', last };
      if (err instanceof ApiError && err.status === 429) {
        pause = err.retryAfterS ? err.retryAfterS * 1000 : DEFAULT_BACKOFF_MS;
      } else {
        throw err;
      }
    }
    // Never sleep past the deadline: a Retry-After near the end of the budget
    // would otherwise overshoot maxWaitMs and the caller's own timeout.
    const remaining = opts.maxWaitMs - (opts.now() - start);
    if (remaining <= 0) return { kind: 'timeout', last };
    await opts.sleep(Math.min(pause, remaining), opts.signal);
  }
}
