import type { PrMeta, PrFindingsSummary } from '@devdigest/shared';
import { rollupSeverities, type SeverityCounts } from './status.js';
import { VERDICT_RANK } from './constants.js';
import type { PullRecord, ReviewRollupRow, FindingSeverityRow, RunCostRow } from './types.js';

/**
 * Pure aggregation/mapping for the pulls-list rollup (ring 1 — no I/O, no
 * `this`). Extracted from the SCORE + STATUS + FINDINGS block that used to
 * live inline in `pulls/routes.ts`'s `GET /repos/:id/pulls` handler.
 */

export interface ScoreVerdictAgg {
  scoreByPr: Map<string, number | null>;
  worstVerdictByPr: Map<string, string | null>;
  /** Ids of each PR's latest-per-agent review (feeds the findings query). */
  latestReviewIds: string[];
  /** PRs that have at least one qualifying (latest-per-agent) review. */
  prIdsWithLatestReview: Set<string>;
}

/**
 * SCORE + STATUS aggregated across each AGENT'S LATEST completed review only
 * — re-running the same agent supersedes its prior pass rather than stacking
 * a stale run's score/findings on top of the fresh one. Re-running a
 * DIFFERENT agent still contributes its own latest review — this scopes
 * "latest" to "latest PER AGENT", not "only the single latest review on the
 * PR". `rows` must be ordered newest-first. A null agentId can't be deduped
 * against other runs, so each such review counts as its own group (falls
 * back to its own row id as the grouping key).
 */
export function computeScoreAndVerdictByPr(rows: ReviewRollupRow[]): ScoreVerdictAgg {
  const scoreByPr = new Map<string, number | null>();
  const worstVerdictByPr = new Map<string, string | null>();
  const latestReviewIds: string[] = [];
  const prIdsWithLatestReview = new Set<string>();
  const seenPrAgent = new Set<string>();

  for (const rv of rows) {
    const key = `${rv.prId}:${rv.agentId ?? rv.id}`;
    if (seenPrAgent.has(key)) continue;
    seenPrAgent.add(key);
    latestReviewIds.push(rv.id);
    prIdsWithLatestReview.add(rv.prId);

    if (rv.score != null) {
      const prior = scoreByPr.get(rv.prId);
      if (prior == null || rv.score < prior) scoreByPr.set(rv.prId, rv.score);
    }
    if (rv.verdict && VERDICT_RANK[rv.verdict] != null) {
      const prior = worstVerdictByPr.get(rv.prId);
      if (!prior || VERDICT_RANK[rv.verdict]! < VERDICT_RANK[prior]!) {
        worstVerdictByPr.set(rv.prId, rv.verdict);
      }
    }
  }

  return { scoreByPr, worstVerdictByPr, latestReviewIds, prIdsWithLatestReview };
}

/**
 * Every PR with at least one qualifying (latest-per-agent) review gets a real
 * zero-filled findings object, not `null` — `null` is reserved for "no
 * completed review at all yet".
 */
export function computeFindingsByPr(
  findingRows: FindingSeverityRow[],
  prIdsWithLatestReview: Set<string>,
): Map<string, SeverityCounts> {
  const bySeverityRowsByPr = new Map<string, { severity: string }[]>();
  for (const fr of findingRows) {
    const list = bySeverityRowsByPr.get(fr.prId) ?? [];
    list.push({ severity: fr.severity });
    bySeverityRowsByPr.set(fr.prId, list);
  }
  const findingsByPr = new Map<string, SeverityCounts>();
  for (const prId of prIdsWithLatestReview) {
    findingsByPr.set(prId, rollupSeverities(bySeverityRowsByPr.get(prId) ?? []));
  }
  return findingsByPr;
}

/**
 * Total cost across every COMPLETED run for the PR (e.g. running 3 agents on
 * one PR shows their combined cost, not just the newest one's). Null-
 * propagates: if ANY completed run's cost is unknown (unpriced model), the
 * PR's total is unknown too, rather than silently undercounting — same rule
 * as reviewer-core's per-run cost summation.
 */
export function computeCostByPr(runRows: RunCostRow[]): Map<string, number | null> {
  const costByPr = new Map<string, number | null>();
  for (const run of runRows) {
    const prior = costByPr.has(run.prId) ? costByPr.get(run.prId)! : 0;
    costByPr.set(run.prId, prior == null || run.costUsd == null ? null : prior + run.costUsd);
  }
  return costByPr;
}

export function toPrMetaDto(
  pull: PullRecord,
  extra: {
    status: PrMeta['status'];
    score: number | null;
    cost: number | null;
    findings: SeverityCounts | null;
  },
): PrMeta {
  const findings: PrFindingsSummary | null = extra.findings
    ? {
        critical: extra.findings.critical,
        warning: extra.findings.warning,
        suggestion: extra.findings.suggestion,
      }
    : null;
  return {
    id: pull.id,
    number: pull.number,
    title: pull.title,
    author: pull.author,
    branch: pull.branch,
    base: pull.base,
    head_sha: pull.headSha,
    additions: pull.additions,
    deletions: pull.deletions,
    files_count: pull.filesCount,
    status: extra.status,
    opened_at: pull.openedAt?.toISOString() ?? null,
    updated_at: pull.updatedAt?.toISOString() ?? null,
    score: extra.score,
    cost_usd: extra.cost,
    findings,
  };
}
