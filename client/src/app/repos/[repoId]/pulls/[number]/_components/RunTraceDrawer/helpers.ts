import type { LogLine } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";

export { formatCost, formatTokens } from "@/lib/format";

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
 * Token count of the Skills block for the trace badge. Prefers the server-side
 * count (`prompt_assembly_meta.skills_tokens`); traces persisted before that
 * field existed fall back to the ceil(length/4) heuristic. `null` = no block.
 */
export function skillsTokenCount(trace: RunTrace): number | null {
  const skills = trace.prompt_assembly.skills;
  if (skills == null) return null;
  return trace.prompt_assembly_meta?.skills_tokens ?? Math.ceil(skills.length / 4);
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
