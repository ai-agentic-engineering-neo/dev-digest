import type { LogLine } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/**
 * Rough size of one prompt block, in tokens: `chars / 4`, the usual English
 * heuristic.
 *
 * This is an ESTIMATE and the UI must say so (it renders as `~412 tok`). The
 * skill editor's counter calls the real server-side tokenizer, and `run_skills`
 * stores that count — this one deliberately does not, because a per-block
 * round-trip is not worth it in the trace drawer. Never drop the tilde.
 */
export function estimateTokens(text: string | null | undefined): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
