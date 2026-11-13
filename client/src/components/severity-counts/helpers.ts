import type { FindingRecord, Severity, SeverityCounts } from "@devdigest/shared";

/** Display order, most severe first. */
export const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Tally non-dismissed findings per severity (same rule as the PR list API). */
export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const c: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (!f.dismissed_at && f.severity in c) c[f.severity] += 1;
  }
  return c;
}

/** Non-dismissed findings, optionally of one severity, most severe first. */
export function findingsForPopover(findings: FindingRecord[], severity: Severity | null): FindingRecord[] {
  return findings
    .filter((f) => !f.dismissed_at && (severity == null || f.severity === severity))
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
}
