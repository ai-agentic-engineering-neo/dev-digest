import type { Severity } from '@devdigest/shared';
import { rollupSeverities } from './status.js';

/**
 * PR-list FINDINGS column: severity breakdown counted from each agent's
 * LATEST review only (mirrors the SCORE column's "latest review" rule,
 * generalized across agents that each run their own review) — so a re-run
 * replaces that agent's contribution instead of piling its findings on top
 * of the stale ones. A review with no agentId (legacy rows) is its own
 * independent group, keyed by reviewId — same "own group" fallback the cost
 * reducer uses for a null batchId.
 *
 * Rows must arrive newest-review-first per PR (same convention the score and
 * cost reducers rely on): the first row seen for an agent within a PR is
 * that agent's latest review.
 *
 * The leaf tally reuses `rollupSeverities` (already written for this list —
 * see status.ts) rather than re-implementing the CRITICAL/WARNING/SUGGESTION
 * counting; this layer only picks which rows are each PR's "current" ones
 * before handing them to it.
 */
export function findingsCountsByPr(
  rows: { prId: string; agentId: string | null; reviewId: string; severity: Severity }[],
): Map<string, Partial<Record<Severity, number>>> {
  const latestReviewByGroup = new Map<string, string>();
  const currentRowsByPr = new Map<string, { severity: string }[]>();

  for (const row of rows) {
    const groupKey = `${row.prId}:${row.agentId ?? row.reviewId}`;
    const latestReviewId = latestReviewByGroup.get(groupKey);
    if (latestReviewId === undefined) {
      latestReviewByGroup.set(groupKey, row.reviewId);
    } else if (row.reviewId !== latestReviewId) {
      continue; // a stale review from this agent — skip its findings
    }

    const list = currentRowsByPr.get(row.prId) ?? [];
    list.push({ severity: row.severity });
    currentRowsByPr.set(row.prId, list);
  }

  const result = new Map<string, Partial<Record<Severity, number>>>();
  for (const [prId, prRows] of currentRowsByPr) {
    const { critical, warning, suggestion } = rollupSeverities(prRows);
    const counts: Partial<Record<Severity, number>> = {};
    if (critical > 0) counts.CRITICAL = critical;
    if (warning > 0) counts.WARNING = warning;
    if (suggestion > 0) counts.SUGGESTION = suggestion;
    result.set(prId, counts);
  }

  return result;
}
