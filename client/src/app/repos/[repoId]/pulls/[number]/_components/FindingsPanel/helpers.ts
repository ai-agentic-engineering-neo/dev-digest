import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITIES, SEVERITY_ORDER } from "./constants";

/** Drop low-confidence findings when `hideLow` is on; identity otherwise.
 *  Shared by `visibleFindings` and the severity-pill counts so the two never
 *  disagree about which findings are "on screen". */
export function hideLowConfidence(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** Optionally drop low-confidence findings and/or narrow to one severity
 *  (the filter pills above the list), then sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severityFilter?: Severity | null,
): FindingRecord[] {
  let shown = hideLowConfidence(findings, hideLow);
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
 * the list below, so the pill total must match what's actually shown. Callers
 * must pass the same `hideLowConfidence`-filtered array used to render the
 * cards below (see `FindingsPanel`), so the pill number and the on-screen
 * card count for that severity always agree, "hide low confidence" or not.
 */
export function countBySeverity(findings: FindingRecord[]): SeverityCountMap {
  const counts: SeverityCountMap = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as keyof SeverityCountMap] += 1;
  }
  return counts;
}
