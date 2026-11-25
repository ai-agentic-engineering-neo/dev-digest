/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  rollupSeverities,
  STALE_DAYS,
  latestReviewPerAgent,
  totalRunCostByPr,
  worstLatestScoreByPr,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('worstLatestScoreByPr', () => {
  it('a passing agent that finished last does not mask failing agents (multi-agent run)', () => {
    // Newest-first, as the route queries them: perf finished last with 100.
    const scores = worstLatestScoreByPr([
      { prId: 'pr1', agentId: 'perf', score: 100 },
      { prId: 'pr1', agentId: 'security', score: 0 },
      { prId: 'pr1', agentId: 'general', score: 0 },
    ]);
    expect(scores.get('pr1')).toBe(0);
  });

  it('uses only each agent\'s latest review — an older re-run of the same agent is ignored', () => {
    const scores = worstLatestScoreByPr([
      { prId: 'pr1', agentId: 'security', score: 90 }, // fixed and re-run
      { prId: 'pr1', agentId: 'general', score: 80 },
      { prId: 'pr1', agentId: 'security', score: 10 }, // stale
    ]);
    expect(scores.get('pr1')).toBe(80);
  });

  it('keeps PRs independent', () => {
    const scores = worstLatestScoreByPr([
      { prId: 'pr1', agentId: 'a', score: 70 },
      { prId: 'pr2', agentId: 'a', score: 30 },
      { prId: 'pr1', agentId: 'b', score: 95 },
    ]);
    expect(scores.get('pr1')).toBe(70);
    expect(scores.get('pr2')).toBe(30);
  });

  it('ignores null scores, and yields null only when no agent scored', () => {
    const scores = worstLatestScoreByPr([
      { prId: 'pr1', agentId: 'a', score: null },
      { prId: 'pr1', agentId: 'b', score: 60 },
      { prId: 'pr2', agentId: 'a', score: null },
    ]);
    expect(scores.get('pr1')).toBe(60);
    expect(scores.get('pr2')).toBeNull();
  });

  it('treats agent-less reviews (seed / legacy) as a single agent', () => {
    const scores = worstLatestScoreByPr([
      { prId: 'pr1', agentId: null, score: 42 },
      { prId: 'pr1', agentId: null, score: 5 }, // older, same "agent"
    ]);
    expect(scores.get('pr1')).toBe(42);
  });

  it('returns an empty map for no reviews', () => {
    expect(worstLatestScoreByPr([]).size).toBe(0);
  });
});

describe('latestReviewPerAgent', () => {
  it('keeps the first (newest) review per (pr, agent), preserving order', () => {
    const rows = [
      { id: 'r4', prId: 'pr1', agentId: 'perf' },
      { id: 'r3', prId: 'pr1', agentId: 'sec' },
      { id: 'r2', prId: 'pr2', agentId: 'sec' },
      { id: 'r1', prId: 'pr1', agentId: 'sec' }, // older re-run of sec on pr1
      { id: 'r0', prId: 'pr1', agentId: null },
    ];
    expect(latestReviewPerAgent(rows).map((r) => r.id)).toEqual(['r4', 'r3', 'r2', 'r0']);
  });
});

describe('totalRunCostByPr', () => {
  it('sums every run on the PR — all agents and every re-run', () => {
    const cost = totalRunCostByPr([
      { prId: 'pr1', status: 'done', costUsd: 0.001 },
      { prId: 'pr1', status: 'done', costUsd: 0.002 }, // re-run of the same agent still counts
      { prId: 'pr1', status: 'done', costUsd: 0.0005 },
      { prId: 'pr2', status: 'done', costUsd: 0.01 },
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.0035, 10);
    expect(cost.get('pr2')).toBe(0.01);
  });

  it('runs without a recorded cost (failed / cancelled / running) add nothing', () => {
    const cost = totalRunCostByPr([
      { prId: 'pr1', status: 'failed', costUsd: null },
      { prId: 'pr1', status: 'cancelled', costUsd: null },
      { prId: 'pr1', status: 'running', costUsd: null },
      { prId: 'pr1', status: 'done', costUsd: 0.004 },
      { prId: 'pr2', status: 'failed', costUsd: null },
    ]);
    expect(cost.get('pr1')).toBe(0.004);
    expect(cost.get('pr2')).toBe(0);
  });

  it('a failed run that did record a cost still counts', () => {
    expect(totalRunCostByPr([{ prId: 'pr1', status: 'failed', costUsd: 0.003 }]).get('pr1')).toBe(0.003);
  });

  it('a completed run with unknown cost makes the total null (no silent under-report)', () => {
    const cost = totalRunCostByPr([
      { prId: 'pr1', status: 'done', costUsd: 0.004 },
      { prId: 'pr1', status: 'done', costUsd: null },
      { prId: 'pr1', status: 'done', costUsd: 0.001 },
    ]);
    expect(cost.get('pr1')).toBeNull();
  });

  it('skips runs detached from a PR and leaves PRs without runs absent', () => {
    const cost = totalRunCostByPr([{ prId: null, status: 'done', costUsd: 1 }]);
    expect(cost.size).toBe(0);
  });
});
