import type { SeverityCounts } from '@devdigest/shared';

/**
 * PR-list FINDINGS breakdown (pure — unit-tests without a DB).
 *
 * Groups persisted findings by review and severity. A plain count over rows we
 * already have — never a model call. Unknown severities are ignored; a review
 * with no findings still gets all-zero counts when listed in `reviewIds`.
 */
export function countSeveritiesByReview(
  reviewIds: string[],
  rows: { reviewId: string; severity: string }[],
): Map<string, SeverityCounts> {
  const byReview = new Map<string, SeverityCounts>();
  for (const id of reviewIds) byReview.set(id, { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  for (const r of rows) {
    const counts = byReview.get(r.reviewId);
    if (!counts) continue;
    if (r.severity === 'CRITICAL' || r.severity === 'WARNING' || r.severity === 'SUGGESTION') {
      counts[r.severity] += 1;
    }
  }
  return byReview;
}

/**
 * One "Run Review" writes a separate review row PER AGENT, so the newest review
 * alone is just whichever agent finished last. The list's FINDINGS column sums
 * the latest review of EACH agent; re-running one agent replaces only its share.
 * `rows` must be newest-first. Reviews without an agent share one bucket.
 */
export function latestReviewIdsPerAgent(
  rows: { id: string; prId: string; agentId: string | null }[],
): Map<string, string[]> {
  const seen = new Set<string>();
  const byPr = new Map<string, string[]>();
  for (const r of rows) {
    const key = `${r.prId}:${r.agentId ?? 'none'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byPr.set(r.prId, [...(byPr.get(r.prId) ?? []), r.id]);
  }
  return byPr;
}

/** Add severity counts together. */
export function sumSeverityCounts(counts: SeverityCounts[]): SeverityCounts {
  const total: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const c of counts) {
    total.CRITICAL += c.CRITICAL;
    total.WARNING += c.WARNING;
    total.SUGGESTION += c.SUGGESTION;
  }
  return total;
}
