import type { FindingRecord, ReviewRecord, Severity, SeverityCounts } from "@devdigest/shared";

/** Severities in display order (most severe first). */
export const SEVERITY_KEYS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Severity → CSS colour token. */
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

/** Fallback colour for an unknown severity. */
export const SEV_COLOR_FALLBACK = "var(--text-muted)";

/** Group findings by severity — a plain count, never a model call. */
export function countBySeverity(findings: Pick<FindingRecord, "severity">[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as Severity] += 1;
  }
  return counts;
}

export function totalFindings(counts: SeverityCounts | null | undefined): number {
  return counts ? counts.CRITICAL + counts.WARNING + counts.SUGGESTION : 0;
}

/**
 * Newest `kind: "review"` record of EACH agent — what the PR list's FINDINGS
 * column sums (one Run Review writes one review per agent). Matches the
 * server's `latestReviewIdsPerAgent`; agent-less reviews share one bucket.
 */
export function latestReviewsPerAgent(reviews: ReviewRecord[] | undefined): ReviewRecord[] {
  const newest = new Map<string, ReviewRecord>();
  for (const r of reviews ?? []) {
    if (r.kind !== "review") continue;
    const key = r.agent_id ?? "none";
    const cur = newest.get(key);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) newest.set(key, r);
  }
  return [...newest.values()];
}
