import type { FindingRecord, Severity } from "@devdigest/shared";

export type SeverityCountMap = Partial<Record<Severity, number>>;

/** Severity levels shown by counters, in display order. */
export const COUNTED_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/** Number of findings per severity. */
export function countBySeverity(findings: FindingRecord[]): SeverityCountMap {
  const counts: SeverityCountMap = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}
