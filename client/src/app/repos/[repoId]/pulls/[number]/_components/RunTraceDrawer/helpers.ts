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

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/**
 * USD cost at 3 significant digits (e.g. "$0.012", "$1.23"). null/undefined
 * or exactly 0 → em-dash — never "$0.00", per the spec for "no data".
 */
export function formatCost(cost: number | null | undefined): string {
  if (cost == null || cost === 0) return "—";
  const precise = cost.toPrecision(3);
  // Guard against scientific notation on sub-microcent values: fall back to
  // fixed-decimal with trailing zeros stripped.
  const numeric = /e/i.test(precise)
    ? cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
    : parseFloat(precise).toString();
  return `$${numeric}`;
}
