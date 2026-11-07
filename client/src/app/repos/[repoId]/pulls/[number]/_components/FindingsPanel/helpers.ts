import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Drop low-confidence findings when `hideLow` is on (no sorting). */
export function confidentFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/**
 * Optionally drop low-confidence findings, optionally keep only one severity,
 * and sort by severity.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = confidentFindings(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Findings per severity, zeros included — feeds SeverityCounters. */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/** Consecutive runs of an already severity-sorted list → one group per severity (empty ones skipped). */
export function groupBySeverity(sorted: FindingRecord[]): { severity: Severity; findings: FindingRecord[] }[] {
  const groups: { severity: Severity; findings: FindingRecord[] }[] = [];
  for (const f of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.severity === f.severity) last.findings.push(f);
    else groups.push({ severity: f.severity, findings: [f] });
  }
  return groups;
}
