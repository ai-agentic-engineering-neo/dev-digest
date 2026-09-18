import type { PrStatus, SeverityCounts } from '@devdigest/shared';

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

/**
 * Map key for a review with no `agent_id` (the demo seed writes one). Such
 * reviews get their own bucket rather than being folded into any agent's, so a
 * seeded review still contributes to the PR row.
 */
export const NO_AGENT_KEY = '__no_agent__';

/** A review with no outstanding findings. Spread it — never share the object. */
export const ZERO_SEVERITY_COUNTS: Readonly<SeverityCounts> = Object.freeze({
  CRITICAL: 0,
  WARNING: 0,
  SUGGESTION: 0,
});

/**
 * Tally finding severities for one review into the shared `SeverityCounts`
 * shape. Input is the SQL `GROUP BY severity` result (a count per severity),
 * not one row per finding, so the route never materializes every finding just
 * to count it. Unknown severity strings are ignored — the column is plain
 * `text` with no CHECK constraint, so a stray value must not throw.
 */
export function tallySeverityGroups(rows: { severity: string; n: number }[]): SeverityCounts {
  const c: SeverityCounts = { ...ZERO_SEVERITY_COUNTS };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.CRITICAL += r.n;
    else if (r.severity === 'WARNING') c.WARNING += r.n;
    else if (r.severity === 'SUGGESTION') c.SUGGESTION += r.n;
  }
  return c;
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
