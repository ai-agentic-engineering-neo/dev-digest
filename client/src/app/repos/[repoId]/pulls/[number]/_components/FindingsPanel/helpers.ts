import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings, sorted by severity. */
export function confidentFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  const shown = hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Optionally drop low-confidence findings, keep one severity, sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  const shown = confidentFindings(findings, hideLow);
  return severity ? shown.filter((f) => f.severity === severity) : shown;
}
