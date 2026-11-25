import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

export interface SeverityCount {
  severity: Severity;
  count: number;
}

const bySeverity = (a: string, b: string) => (SEVERITY_ORDER[a] ?? 9) - (SEVERITY_ORDER[b] ?? 9);

/** Per-severity counts for a run, most severe first; zero-count severities omitted. */
export function countBySeverity(findings: FindingRecord[]): SeverityCount[] {
  const counts = new Map<Severity, number>();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  return [...counts.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => bySeverity(a.severity, b.severity));
}

/** Optionally keep one severity, optionally drop low-confidence findings, then sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (severity) shown = shown.filter((f) => f.severity === severity);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort((a, b) => bySeverity(a.severity, b.severity));
}
