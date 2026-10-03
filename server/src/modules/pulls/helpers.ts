import type { PrMeta } from '@devdigest/shared';
import type { PullRow, ReviewAgentRow, ReviewScoreRow, RunCostRow, SeverityCountRow } from './repository.js';
import { deriveReviewStatus } from './status.js';

/**
 * Pure map-building helpers for the PR list's per-PR rollups (score / findings
 * / cost). Kept separate from repository.ts (raw queries) and service.ts
 * (orchestration) so the grouping rules — which are the actual business logic —
 * get their own unit-testable surface.
 */

// FINDINGS and COST are deliberately DIFFERENT rules, not the same one:
//
// FINDINGS (below): for every DISTINCT agent that has ever run on the PR,
// count only its most recent run/review — a superseded run's stale findings
// shouldn't inflate "how many issues does this PR currently have", then SUM
// across all distinct agents. Example: Test Quality Reviewer ran once (3
// findings). General Reviewer ran three times in a row (its last run: 4
// findings). The list shows 3 + 4 = 7, not 3 + (every General Reviewer run
// added together).
//
// COST (further below): the sum of EVERY successful run, no per-agent dedup —
// it's actual money already spent, not a "current state" — see that block's
// own comment for why.
//
// SCORE (above) is different again: a single overall "current" score, not
// additive, so it's just "latest review wins", full stop — no per-agent
// grouping at all.
//
// A review/run with no agentId (legacy/seeded data predating that link) is
// never deduped against another — each counts as its own "agent" via a
// fallback key — since there's no way to tell whether two such rows came
// from the same reviewer.

/** Latest review per PR (rows must already be ordered newest-first). */
export function buildLatestReviewMap(
  rows: ReviewScoreRow[],
): Map<string, { id: string; score: number | null }> {
  const map = new Map<string, { id: string; score: number | null }>();
  for (const rv of rows) {
    if (!map.has(rv.prId)) map.set(rv.prId, { id: rv.id, score: rv.score });
  }
  return map;
}

/** For each PR, the latest review id per distinct agent (dedup key =
 *  agentId, falling back to the review's own id when agentId is null). */
export function latestReviewIdsPerAgent(rows: ReviewAgentRow[]): string[] {
  const byPrAgent = new Map<string, Map<string, { id: string; createdAt: Date | null }>>();
  for (const rv of rows) {
    const agentKey = rv.agentId ?? rv.id;
    let byAgent = byPrAgent.get(rv.prId);
    if (!byAgent) {
      byAgent = new Map();
      byPrAgent.set(rv.prId, byAgent);
    }
    const existing = byAgent.get(agentKey);
    if (!existing || (rv.createdAt?.getTime() ?? 0) > (existing.createdAt?.getTime() ?? 0)) {
      byAgent.set(agentKey, { id: rv.id, createdAt: rv.createdAt });
    }
  }
  return [...byPrAgent.values()].flatMap((byAgent) => [...byAgent.values()].map((v) => v.id));
}

export function buildFindingsBySeverityMap(
  rows: SeverityCountRow[],
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const bySeverity = map.get(row.prId) ?? {};
    bySeverity[row.severity] = row.count;
    map.set(row.prId, bySeverity);
  }
  return map;
}

export function buildRunCostMap(rows: RunCostRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const run of rows) {
    if (!run.prId || run.costUsd == null) continue;
    map.set(run.prId, (map.get(run.prId) ?? 0) + run.costUsd);
  }
  return map;
}

/** Assemble one PR row + its rollups into the list's PrMeta DTO. */
export function toPrMetaDto(
  r: PullRow,
  review: { id: string; score: number | null } | undefined,
  cost: number | undefined,
  findings: Record<string, number> | undefined,
  now: number,
): PrMeta {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    head_sha: r.headSha,
    additions: r.additions,
    deletions: r.deletions,
    files_count: r.filesCount,
    status: deriveReviewStatus({
      ghStatus: r.status,
      lastReviewedSha: r.lastReviewedSha,
      headSha: r.headSha,
      updatedAt: r.updatedAt,
      now,
    }),
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    score: review ? review.score : null,
    cost_usd: cost ?? null,
    findings_by_severity: findings ?? null,
  };
}
