import type { FindingRecord } from "@devdigest/shared";
import { FILTERABLE_SEVERITIES, LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER, type FilterableSeverity } from "./constants";

/**
 * Findings to show: optional low-confidence drop, optional single-severity
 * filter, then sorted by severity. Pure filter/sort over persisted rows.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: FilterableSeverity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** COUNT per severity over the run's persisted findings (no model call). */
export function countBySeverity(findings: FindingRecord[]): Record<FilterableSeverity, number> {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as Record<FilterableSeverity, number>;
  for (const f of findings) {
    if ((FILTERABLE_SEVERITIES as readonly string[]).includes(f.severity)) {
      counts[f.severity as FilterableSeverity] += 1;
    }
  }
  return counts;
}
