import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** True when a click started on a link/button inside the header — those own the click. */
export function isFromInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, button, input, textarea, select") != null;
}
