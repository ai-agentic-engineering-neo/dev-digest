import type { LogLine } from "@devdigest/ui";
import type { RunTrace, ToolCall } from "@devdigest/shared";

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

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Rough token weight of ONE prompt block, so the trace can say what each slot
 * (skills, repo map, diff…) costs on its own. Mirrors the server's estimate
 * (reviewer-core `estimateTokens`: chars / 4), which the Live Log line uses —
 * the two numbers therefore agree for the same text.
 */
export function approxTokens(text: string | null | undefined): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/** Compact form for the block chip: `187`, `1.2k`. */
export function formatApproxTokens(tokens: number): string {
  return tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`;
}

/** True when a click started on a link/button inside a clickable row — those own the click. */
export function isFromInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, button, input, textarea, select") != null;
}

/**
 * Stable React keys for a trace's tool calls: tool + args, with a #n suffix
 * only for repeated identical calls (the trace is append-only, never reordered).
 */
export function toolCallKeys(calls: readonly Pick<ToolCall, "tool" | "args">[]): string[] {
  const seen = new Map<string, number>();
  return calls.map((c) => {
    const base = `${c.tool}(${c.args})`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}
