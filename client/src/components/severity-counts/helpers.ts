import type { FindingRecord } from "@devdigest/shared";

/** Display order for severity chips, and the sort rank for finding lists. */
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export type CountedSeverity = (typeof SEVERITIES)[number];
export type SeverityCountMap = Partial<Record<string, number>>;

function rank(severity: string): number {
  const i = SEVERITIES.indexOf(severity as CountedSeverity);
  return i === -1 ? SEVERITIES.length : i;
}

/**
 * Tally findings per severity.
 *
 * DISMISSED findings are skipped: a counter answers "what still needs
 * attention", the same rule ReviewRunAccordion applies to its blockers count.
 * This is the single client-side chokepoint for that rule — the PR list, the
 * findings panel and the timeline all count through here, so none of them can
 * drift from the server's own `findings_counts` aggregate.
 */
export function severityCounts(findings: FindingRecord[]): SeverityCountMap {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    if (f.dismissed_at) continue;
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

/** Findings sorted CRITICAL → WARNING → SUGGESTION (unknown severities last). */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort((a, b) => rank(a.severity) - rank(b.severity));
}
