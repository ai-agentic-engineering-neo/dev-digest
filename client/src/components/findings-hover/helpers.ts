import type { FindingRecord, Severity } from "@devdigest/shared";

/** Severity levels in display order. */
export const SEVERITY_LEVELS: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export type SeverityCount = { severity: Severity; count: number };

/** Count findings per severity, in display order; severities with none are omitted. */
export function countBySeverity(findings: Pick<FindingRecord, "severity">[]): SeverityCount[] {
  return SEVERITY_LEVELS.map((severity) => ({
    severity,
    count: findings.filter((f) => f.severity === severity).length,
  })).filter((c) => c.count > 0);
}

/** Same shape from a pre-aggregated `{ CRITICAL, WARNING, SUGGESTION }` map (PR list). */
export function countsFromMap(map: Partial<Record<Severity, number>> | null | undefined): SeverityCount[] {
  if (!map) return [];
  return SEVERITY_LEVELS.map((severity) => ({ severity, count: map[severity] ?? 0 })).filter((c) => c.count > 0);
}

/** `file:12` or `file:45-52`. */
export function lineRef(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.file}:${f.start_line}` : `${f.file}:${f.start_line}-${f.end_line}`;
}

/** Rationale as plain preview text (markdown emphasis/code ticks stripped). */
export function plainText(md: string | null | undefined): string {
  return (md ?? "").replace(/\*\*|`/g, "");
}
