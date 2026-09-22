import { EventEmitter } from 'node:events';
import type { RunEvent, RunEventKind } from '@devdigest/shared';

/**
 * SSE / run-log bus.
 *
 * During a run, events are pushed to an in-memory buffer and emitted live to
 * any SSE subscriber on `/runs/:id/events`. On completion the full log is
 * persisted as ONE document in `run_traces` (done by the service layer, not here).
 *
 * Lifecycle of one run's state: created on first publish/subscribe → live →
 * `complete()` (subscribers get `done`; the buffer stays for late subscribers
 * and for the executor's trace) → evicted `ttlMs` later. One bus per Container.
 *
 * Event shape on the wire (SSE `data`): RunEvent (see @devdigest/shared).
 */

/** Wall-clock time-of-day (HH:MM:SS, local) stamped on each log line. */
function clockTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** Schedules `fn` after `ms`; the handle is unref-ed so it never holds the process open. */
export type RunBusTimer = (fn: () => void, ms: number) => { unref?: () => void };

export interface RunBusOptions {
  /** How long a completed run's state (buffer, flags) is kept. Default 5 min. */
  ttlMs?: number;
  /** Injectable timer (tests). Default `setTimeout`. */
  schedule?: RunBusTimer;
}

export const RUN_STATE_TTL_MS = 5 * 60_000;

export class RunBus {
  private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, RunEvent[]>();
  private seq = new Map<string, number>();
  private completed = new Set<string>();
  private cancelled = new Set<string>();
  private cancelListeners = new Map<string, Set<() => void>>();
  private idleWaiters = new Set<() => void>();
  private readonly ttlMs: number;
  private readonly schedule: RunBusTimer;

  constructor(opts: RunBusOptions = {}) {
    this.ttlMs = opts.ttlMs ?? RUN_STATE_TTL_MS;
    this.schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  }

  /** Request cancellation of an in-flight run. The runner checks `isCancelled`
   *  at its next checkpoint (before each LLM call, and once more before it
   *  persists the review) and its `onCancel` listener aborts the in-flight
   *  call. The flag is sticky: `complete()` must not clear it, because
   *  `cancelRun` completes the bus right after cancelling (to end the SSE
   *  stream at once) while a live runner has yet to see it. Evicted with the
   *  rest of the run's state after the TTL. */
  cancel(runId: string): void {
    this.cancelled.add(runId);
    for (const listener of [...(this.cancelListeners.get(runId) ?? [])]) listener();
  }

  /** Whether cancellation has been requested for a run. */
  isCancelled(runId: string): boolean {
    return this.cancelled.has(runId);
  }

  /** Call `listener` when the run is cancelled (at once if it already is). */
  onCancel(runId: string, listener: () => void): () => void {
    if (this.cancelled.has(runId)) {
      listener();
      return () => undefined;
    }
    let set = this.cancelListeners.get(runId);
    if (!set) this.cancelListeners.set(runId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0 && this.cancelListeners.get(runId) === set) this.cancelListeners.delete(runId);
    };
  }

  /** Whether the bus holds any state for a run (live or recently completed). */
  has(runId: string): boolean {
    return this.buffers.has(runId) || this.completed.has(runId) || this.emitters.has(runId);
  }

  private emitterFor(runId: string): EventEmitter {
    let e = this.emitters.get(runId);
    if (!e) {
      e = new EventEmitter();
      e.setMaxListeners(50);
      this.emitters.set(runId, e);
      if (!this.buffers.has(runId)) this.buffers.set(runId, []);
      if (!this.seq.has(runId)) this.seq.set(runId, 0);
    }
    return e;
  }

  /**
   * Publish a live event for a run. Returns the constructed RunEvent.
   * After `complete()` nothing is emitted and no live state is re-created; the
   * event is only appended to the still-retained buffer, so the trace the
   * executor persists after a cancel keeps its final lines.
   */
  publish(runId: string, kind: RunEventKind, msg: string, data?: unknown): RunEvent {
    const next = (this.seq.get(runId) ?? 0) + 1;
    const event: RunEvent = { runId, seq: next, kind, msg, t: clockTime(), data };
    if (this.completed.has(runId)) {
      const buffer = this.buffers.get(runId);
      if (buffer) {
        this.seq.set(runId, next);
        buffer.push(event);
      }
      return event;
    }
    const e = this.emitterFor(runId);
    this.seq.set(runId, next);
    this.buffers.get(runId)!.push(event);
    e.emit('event', event);
    return event;
  }

  /** Subscribe to live events. Replays any buffered events first. */
  subscribe(runId: string, listener: (e: RunEvent) => void): () => void {
    for (const buffered of this.buffers.get(runId) ?? []) listener(buffered);
    if (this.completed.has(runId)) return () => undefined;
    const e = this.emitterFor(runId);
    e.on('event', listener);
    return () => e.off('event', listener);
  }

  /** The full buffered log for a run (used to persist the trace on completion). */
  buffer(runId: string): RunEvent[] {
    return this.buffers.get(runId) ?? [];
  }

  /** Signal completion, release the emitter and schedule eviction of the
   *  run's state. Leaves the cancel flag alone until eviction (see `cancel`). */
  complete(runId: string): void {
    if (this.completed.has(runId)) return;
    const e = this.emitters.get(runId);
    this.completed.add(runId);
    e?.emit('done');
    this.emitters.delete(runId);
    this.schedule(() => this.evict(runId), this.ttlMs).unref?.();
    if (this.idleWaiters.size > 0 && this.liveRunIds().length === 0) {
      for (const wake of [...this.idleWaiters]) wake();
    }
  }

  // ---- Shutdown -------------------------------------------------------------

  /** Runs the bus holds that have not completed (in flight, or subscribed-to). */
  liveRunIds(): string[] {
    const ids = new Set([...this.buffers.keys(), ...this.emitters.keys()]);
    return [...ids].filter((id) => !this.completed.has(id));
  }

  /** Cancel every live run (shutdown). Runners abort and complete themselves. */
  cancelAll(): string[] {
    const ids = this.liveRunIds();
    for (const id of ids) this.cancel(id);
    return ids;
  }

  /** Resolve true once no run is live, or false after `timeoutMs`. */
  whenIdle(timeoutMs: number): Promise<boolean> {
    if (this.liveRunIds().length === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const finish = (idle: boolean) => {
        clearTimeout(timer);
        this.idleWaiters.delete(wake);
        resolve(idle);
      };
      const wake = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.idleWaiters.add(wake);
    });
  }

  /** Complete every live run: SSE subscribers get `done` and their streams end,
   *  so open SSE connections never stall server close. */
  completeAll(): void {
    for (const id of this.liveRunIds()) this.complete(id);
  }

  private evict(runId: string): void {
    this.emitters.delete(runId);
    this.buffers.delete(runId);
    this.seq.delete(runId);
    this.completed.delete(runId);
    this.cancelled.delete(runId);
    this.cancelListeners.delete(runId);
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
