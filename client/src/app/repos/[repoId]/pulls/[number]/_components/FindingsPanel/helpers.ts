import type { FindingRecord, Severity } from "@devdigest/shared";
import { FILTERABLE_SEVERITIES, LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

function dropLowConfidence(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** Optionally drop low-confidence findings, keep one severity, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = dropLowConfidence(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Findings per severity, after the low-confidence filter (matches what a click shows). */
export function severityCounts(findings: FindingRecord[], hideLow: boolean): Record<Severity, number> {
  const counts = Object.fromEntries(FILTERABLE_SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const f of dropLowConfidence(findings, hideLow)) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}
