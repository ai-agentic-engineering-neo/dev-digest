/**
 * Run lifecycle rules (pure): cancellation, how a run ends, and the final SSE
 * event of a run whose live buffer is gone.
 */
import type { RunEvent } from '@devdigest/shared';
import { CANCELLED_NOTE } from './constants.js';

/** Thrown by a run when the user cancels it mid-flight. */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/**
 * Terminal status + stored note for a run that threw. An error raised while
 * the run was cancelled (e.g. the aborted LLM call's AbortError) is a cancel,
 * not a failure.
 */
export function runEnding(err: unknown, cancelled: boolean): { status: 'failed' | 'cancelled'; note: string } {
  if (cancelled || err instanceof RunCancelledError) return { status: 'cancelled', note: CANCELLED_NOTE };
  return { status: 'failed', note: err instanceof Error ? err.message : String(err) };
}

/**
 * The single SSE event sent for a run that already finished but whose live
 * buffer is gone (server restart / TTL eviction): carries the persisted status
 * so the client can settle without the replay. `result` for done, `info`
 * otherwise (an `error` kind would re-toast an old failure on reconnect).
 */
export function finalStatusEvent(
  runId: string,
  status: string | null,
  error: string | null,
  now: Date = new Date(),
): RunEvent {
  const note = status === 'done' ? 'Run finished' : `Run ${status ?? 'ended'}${error ? `: ${error}` : ''}`;
  return {
    runId,
    seq: 1,
    kind: status === 'done' ? 'result' : 'info',
    msg: note,
    t: now.toTimeString().slice(0, 8),
    data: { status, error },
  };
}
