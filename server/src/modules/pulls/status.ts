import type { PrStatus } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `changes_requested` — ANY completed run on this PR has a `request_changes`
 *    verdict. Checked BEFORE head-freshness, deliberately unscoped to the
 *    current head — consistent with how cost/score already aggregate across
 *    the PR's whole run history rather than just the latest head. A
 *    `request_changes` verdict is a stronger, more actionable signal than mere
 *    staleness and shouldn't be hidden by `needs_review`/`stale` once any run
 *    has ever raised it.
 *  - `needs_review`      — never reviewed, OR head moved since the last review
 *  - `stale`              — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`           — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
  /** Worst verdict (`request_changes` < `comment` < `approve`) among all of
   *  this PR's completed runs, or null if none has a verdict yet. */
  worstVerdict?: string | null;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now, worstVerdict } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (worstVerdict === 'request_changes') return 'changes_requested';
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
