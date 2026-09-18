import type { FindingRecord, Severity } from "@devdigest/shared";

/**
 * Shared finding helpers — severity grouping/ordering and file:line formatting.
 * Single source of truth reused by the PR-detail FindingsPanel/RunHistory
 * timeline AND the PR-list findings popover, so the "only severities that
 * actually exist" and file:line rules stay consistent everywhere.
 */

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Severities shown (and clickable to filter by) in a counter bar, in display order. */
export const FILTERABLE_SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Count of findings per severity, in display order (CRITICAL · WARNING · SUGGESTION). */
export function severityCounts(findings: Pick<FindingRecord, "severity">[]): Record<Severity, number> {
  const counts = Object.fromEntries(FILTERABLE_SEVERITIES.map((sev) => [sev, 0])) as Record<
    Severity,
    number
  >;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as Severity] += 1;
  }
  return counts;
}

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
