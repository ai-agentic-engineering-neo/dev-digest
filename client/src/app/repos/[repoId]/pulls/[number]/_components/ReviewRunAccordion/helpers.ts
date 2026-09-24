import type { FindingRecord } from "@devdigest/shared";

/** Locale date-time for an ISO timestamp; an unparseable value is shown as-is. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Open blockers: CRITICAL findings that were not dismissed. */
export function countBlockers(findings: readonly FindingRecord[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}
