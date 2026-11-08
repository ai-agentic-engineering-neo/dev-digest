import type { LogLine } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";
import type { LeftOutReason, RunTraceView } from "@/lib/types";

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


/** What the Configuration "Specs read" row shows (SPEC-04 AC-6). */
export type SpecsReadView =
  | { kind: "none" }
  | { kind: "paths"; paths: string[] }
  | { kind: "unavailable"; attached: string[] }
  | {
      kind: "detail";
      included: { path: string; changed: boolean }[];
      leftOut: { path: string; reason: LeftOutReason; changed: boolean }[];
    };

/**
 * "Specs read" from the stored trace: the project-context detail when recorded (included in order,
 * then left-out in order, each flagged when the PR changes it), the bare `specs_read` list for runs
 * recorded before that detail existed, else none.
 */
export function specsReadView(trace: RunTraceView): SpecsReadView {
  const pc = trace.project_context;
  if (pc?.status === "unavailable") return { kind: "unavailable", attached: [...pc.attached] };
  if (pc?.status === "ok") {
    const changed = new Set(pc.changed_by_pr);
    return {
      kind: "detail",
      included: pc.included.map((d) => ({ path: d.path, changed: changed.has(d.path) })),
      leftOut: pc.left_out.map((d) => ({ path: d.path, reason: d.reason, changed: changed.has(d.path) })),
    };
  }
  if (trace.specs_read.length > 0) return { kind: "paths", paths: [...trace.specs_read] };
  return { kind: "none" };
}
