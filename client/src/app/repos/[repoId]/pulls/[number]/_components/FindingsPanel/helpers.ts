import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITIES, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings and/or narrow to one severity
 *  (the filter pills above the list), then sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severityFilter?: Severity | null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severityFilter) shown = shown.filter((f) => f.severity === severityFilter);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

export type SeverityCountMap = Record<(typeof SEVERITIES)[number], number>;

/**
 * Count every finding by severity — a plain COUNT/filter over findings this
 * run already loaded, no LLM call. Unlike the PR-list/Timeline counters,
 * dismissed findings ARE counted here: they still render as (muted) cards in
 * the list below, so the pill total must match what's actually shown.
 */
export function countBySeverity(findings: FindingRecord[]): SeverityCountMap {
  const counts: SeverityCountMap = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as keyof SeverityCountMap] += 1;
  }
  return counts;
}
