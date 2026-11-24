import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";

/** Findings of each agent's latest review (input is newest-first, as the API
 *  returns it) — mirrors the server's PR-list `findings_by_severity`. */
export function latestAgentFindings(reviews: ReviewRecord[]): FindingRecord[] {
  const seen = new Set<string>();
  return reviews
    .filter((r) => r.kind === "review")
    .filter((r) => {
      const key = r.agent_id ?? r.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .flatMap((r) => r.findings);
}

export type SeverityCountMap = Partial<Record<Severity, number>>;

/** Severity levels shown by counters, in display order. */
export const COUNTED_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/** Number of findings per severity. */
export function countBySeverity(findings: FindingRecord[]): SeverityCountMap {
  const counts: SeverityCountMap = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}
