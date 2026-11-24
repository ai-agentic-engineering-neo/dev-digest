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

/**
 * The reviews that make up a PR's current findings: the latest review of EACH
 * agent. Several agents review a PR independently, so the newest review alone
 * hides what the others found; a re-run of the same agent supersedes its
 * earlier review, so findings aren't double-counted. Reviews without an agent
 * (legacy runs) count as one agent. Input must be newest-first.
 */
export function latestReviewPerAgent<R extends { prId: string; agentId: string | null }>(
  reviewsNewestFirst: R[],
): Map<string, R[]> {
  const seen = new Set<string>();
  const byPr = new Map<string, R[]>();
  for (const rv of reviewsNewestFirst) {
    const key = `${rv.prId}:${rv.agentId ?? 'legacy'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byPr.get(rv.prId) ?? [];
    list.push(rv);
    byPr.set(rv.prId, list);
  }
  return byPr;
}

/**
 * Total LLM spend per PR across ALL its agent runs (the list's Cost column;
 * per-run cost lives on the PR's Agent runs tab). Runs with an unknown cost
 * (failed / cancelled / legacy) add nothing; a PR none of whose runs has a
 * known cost is absent from the map, so the column shows "—" rather than $0.
 */
export function totalCostPerPr(runs: { prId: string | null; costUsd: number | null }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const run of runs) {
    if (!run.prId || run.costUsd == null) continue;
    totals.set(run.prId, (totals.get(run.prId) ?? 0) + run.costUsd);
  }
  return totals;
}
