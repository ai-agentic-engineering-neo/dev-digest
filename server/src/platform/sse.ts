import { EventEmitter } from 'node:events';
import type { RunEvent, RunEventKind } from '@devdigest/shared';

/**
 * SSE / run-log bus.
 *
 * During a run, events are pushed to an in-memory buffer and emitted live to
 * any SSE subscriber on `/runs/:id/events`. On completion the full log is
 * persisted as ONE document in `run_traces` (done by the service layer, not here).
 *
 * Event shape on the wire (SSE `data`): RunEvent (see @devdigest/shared).
 */

/** Wall-clock time-of-day (HH:MM:SS, local) stamped on each log line. */
function clockTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** How long a completed run's buffer stays replayable before it is freed. */
export const RUN_BUFFER_TTL_MS = 5 * 60_000;
/** Interval of the SSE comment frame that keeps an idle stream open. */
export const SSE_HEARTBEAT_MS = 15_000;

export class RunBus {
  private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, RunEvent[]>();
  private seq = new Map<string, number>();
  private completed = new Set<string>();
  private cancelled = new Set<string>();
  private expiry = new Map<string, NodeJS.Timeout>();

  constructor(private readonly bufferTtlMs = RUN_BUFFER_TTL_MS) {}

  /** Request cancellation of an in-flight run. The runner checks `isCancelled`
   *  at its next checkpoint (between map-reduce files) and stops. */
  cancel(runId: string): void {
    this.cancelled.add(runId);
  }

  /** Whether cancellation has been requested for a run. */
  isCancelled(runId: string): boolean {
    return this.cancelled.has(runId);
  }

  /** Forget a run's cancellation request. Called by the run executor when the
   *  run exits — not by `complete()`, which a cancel request itself calls to end
   *  the stream while the runner may still be working. */
  clearCancelled(runId: string): void {
    this.cancelled.delete(runId);
  }

  private emitterFor(runId: string): EventEmitter {
    let e = this.emitters.get(runId);
    if (!e) {
      e = new EventEmitter();
      e.setMaxListeners(50);
      this.emitters.set(runId, e);
      // Preserve any existing buffer/seq (e.g. a late subscriber after the run
      // completed must still be able to replay the buffered events).
      if (!this.buffers.has(runId)) this.buffers.set(runId, []);
      if (!this.seq.has(runId)) this.seq.set(runId, 0);
    }
    return e;
  }

  /** Publish a live event for a run. Returns the constructed RunEvent. */
  publish(runId: string, kind: RunEventKind, msg: string, data?: unknown): RunEvent {
    const e = this.emitterFor(runId);
    const next = (this.seq.get(runId) ?? 0) + 1;
    this.seq.set(runId, next);
    const event: RunEvent = { runId, seq: next, kind, msg, t: clockTime(), data };
    this.buffers.get(runId)!.push(event);
    e.emit('event', event);
    return event;
  }

  /** Subscribe to live events. Replays any buffered events first. */
  subscribe(runId: string, listener: (e: RunEvent) => void): () => void {
    const e = this.emitterFor(runId);
    for (const buffered of this.buffers.get(runId) ?? []) listener(buffered);
    e.on('event', listener);
    return () => e.off('event', listener);
  }

  /** The full buffered log for a run (used to persist the trace on completion). */
  buffer(runId: string): RunEvent[] {
    return this.buffers.get(runId) ?? [];
  }

  /** Whether the bus holds a buffer for a run (live, or completed and not yet expired). */
  has(runId: string): boolean {
    return this.buffers.has(runId);
  }

  /** Signal completion, drop the emitter, and free the buffer `bufferTtlMs`
   *  later. Leaves a cancellation request in place: the runner clears it with
   *  `clearCancelled` on exit. */
  complete(runId: string): void {
    const e = this.emitters.get(runId);
    this.completed.add(runId);
    e?.emit('done');
    this.emitters.delete(runId);
    // Keep the buffer briefly for late subscribers, then forget the run. A
    // second `complete` (cancel, then the runner's own) restarts the clock.
    clearTimeout(this.expiry.get(runId));
    const timer = setTimeout(() => this.forget(runId), this.bufferTtlMs);
    timer.unref();
    this.expiry.set(runId, timer);
  }

  private forget(runId: string): void {
    this.expiry.delete(runId);
    this.emitters.delete(runId);
    this.buffers.delete(runId);
    this.seq.delete(runId);
    this.completed.delete(runId);
  }

  /** Whether a run has already completed (for replay-then-end late subscribers). */
  isComplete(runId: string): boolean {
    return this.completed.has(runId);
  }

  onDone(runId: string, listener: () => void): () => void {
    // A run that already completed fires immediately so late SSE subscribers,
    // after replaying the buffer, end the stream instead of hanging forever.
    if (this.completed.has(runId)) {
      queueMicrotask(listener);
      return () => undefined;
    }
    const e = this.emitterFor(runId);
    e.once('done', listener);
    return () => e.off('done', listener);
  }
}

export const runBus = new RunBus();

/** One SSE frame as fastify-sse-v2 serializes it. */
export interface SseFrame {
  id?: string;
  event?: string;
  data?: string;
  comment?: string;
}

/** A run event on the wire: `id` = seq, `event` = kind, `data` = the JSON event. */
export function toSseFrame(e: RunEvent): SseFrame {
  return { id: String(e.seq), event: e.kind, data: JSON.stringify(e) };
}

/**
 * A live run as SSE frames: the buffered events first, then live ones, ending
 * when the run completes. A comment frame goes out every `heartbeatMs` so idle
 * proxies and clients keep the connection. When `signal` aborts (the client
 * went away) the subscription is dropped at once, whatever the generator is
 * waiting on, and the stream ends.
 */
export async function* liveRunFrames(
  bus: Pick<RunBus, 'subscribe' | 'onDone'>,
  runId: string,
  signal: AbortSignal,
  heartbeatMs = SSE_HEARTBEAT_MS,
): AsyncGenerator<SseFrame> {
  const queue: RunEvent[] = [];
  let done = false;
  let beat = false;
  let wake: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  const unsubscribe = bus.subscribe(runId, (e) => {
    queue.push(e);
    notify();
  });
  const offDone = bus.onDone(runId, () => {
    done = true;
    notify();
  });
  const heartbeat = setInterval(() => {
    beat = true;
    notify();
  }, heartbeatMs);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearInterval(heartbeat);
    unsubscribe();
    offDone();
    signal.removeEventListener('abort', onAbort);
  };
  const onAbort = () => {
    release();
    notify();
  };
  signal.addEventListener('abort', onAbort);

  try {
    while (!signal.aborted) {
      const e = queue.shift();
      if (e) {
        yield toSseFrame(e);
        continue;
      }
      if (done) return;
      if (beat) {
        beat = false;
        yield { comment: 'heartbeat' };
        continue;
      }
      await new Promise<void>((r) => (wake = r));
    }
  } finally {
    release();
  }
}
