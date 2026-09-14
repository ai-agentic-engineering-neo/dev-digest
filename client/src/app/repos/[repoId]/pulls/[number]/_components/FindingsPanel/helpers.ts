import type { FindingRecord, Severity } from "@devdigest/shared";
import { FILTERABLE_SEVERITIES, LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Count of findings per severity, in display order (CRITICAL · WARNING · SUGGESTION). */
export function severityCounts(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(FILTERABLE_SEVERITIES.map((sev) => [sev, 0])) as Record<
    Severity,
    number
  >;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as Severity] += 1;
  }
  return counts;
}
