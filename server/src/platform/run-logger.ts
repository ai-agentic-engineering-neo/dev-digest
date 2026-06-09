import type { RunEventKind, RunLogLine } from '@devdigest/shared';
import type { RunBus } from './sse.js';

/**
 * Structured run logger (§7/§11) — the SINGLE sink for everything a run does.
 *
 * Every operation in a review run (load diff, derive intent, embed + retrieve
 * memory, load skills/specs, each model call, grounding, persistence) goes
 * through here so it is, in one shot:
 *   1. streamed live to the UI over the SSE RunBus (the Live Log),
 *   2. captured in the run's event buffer → persisted as the run_traces.log doc
 *      (survives reload), and
 *   3. mirrored to the server's structured stdout logger (pino) for ops.
 *
 * A run logger can target ONE run (the usual case) or FAN OUT to several runIds
 * at once — used for shared pre-work (diff/intent) that happens before the
 * per-agent loop, so each target agent's stream shows it too.
 */

/** Minimal pino-compatible logger: (obj, msg). Optional stdout mirror. */
export type PinoLike = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

/** Which stdout level a run-event kind mirrors to. */
const LEVEL: Record<RunEventKind, keyof PinoLike> = {
  info: 'info',
  tool: 'debug',
  result: 'info',
  error: 'error',
};

export class RunLogger {
  constructor(
    private readonly bus: RunBus,
    private readonly runIds: string[],
    private readonly base?: PinoLike,
    private readonly ctx: Record<string, unknown> = {},
  ) {}

  /** Narrow to a single run (drops the fan-out), optionally adding context. */
  forRun(runId: string, ctx: Record<string, unknown> = {}): RunLogger {
    return new RunLogger(this.bus, [runId], this.base, { ...this.ctx, ...ctx });
  }

  /** Publish one event to every target run's stream + mirror to stdout. */
  event(kind: RunEventKind, msg: string, data?: unknown): void {
    for (const runId of this.runIds) this.bus.publish(runId, kind, msg, data);
    this.base?.[LEVEL[kind]]({ ...this.ctx, runIds: this.runIds, kind, ...(data !== undefined ? { data } : {}) }, msg);
  }

  info(msg: string, data?: unknown): void {
    this.event('info', msg, data);
  }
  /** External I/O (LLM / embedding / git) — shown amber in the Live Log. */
  tool(msg: string, data?: unknown): void {
    this.event('tool', msg, data);
  }
  result(msg: string, data?: unknown): void {
    this.event('result', msg, data);
  }
  error(msg: string, data?: unknown): void {
    this.event('error', msg, data);
  }

  /**
   * Time an async operation: emits `"<label>…"` up front, then
   * `"<label> done (Nms)"` on success or `"<label> failed (Nms): <err>"` on
   * throw (re-throws). `kind` styles the start/done lines (default 'info';
   * pass 'tool' for external calls). The error line is always an `error` event.
   */
  async step<T>(
    label: string,
    fn: () => Promise<T>,
    opts: { kind?: RunEventKind; data?: unknown } = {},
  ): Promise<T> {
    const kind = opts.kind ?? 'info';
    const t0 = Date.now();
    this.event(kind, `${label}…`, opts.data);
    try {
      const result = await fn();
      this.event(kind, `${label} done (${Date.now() - t0}ms)`);
      return result;
    } catch (err) {
      this.error(`${label} failed (${Date.now() - t0}ms): ${(err as Error).message}`);
      throw err;
    }
  }

  /** The run's full event buffer mapped to persisted log lines (incl. pre-work). */
  logFor(runId: string): RunLogLine[] {
    return this.bus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg }));
  }
}
