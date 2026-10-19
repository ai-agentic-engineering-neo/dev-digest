/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import { deriveReviewStatus, latestReviewCostByPr, rollupSeverities, STALE_DAYS } from '../src/modules/pulls/status.js';

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

describe('latestReviewCostByPr', () => {
  it('sums only the newest review batch per PR (rows newest-first)', () => {
    const cost = latestReviewCostByPr([
      { prId: 'p1', reviewBatchId: 'b2', costUsd: 0.0013 },
      { prId: 'p1', reviewBatchId: 'b2', costUsd: 0.0014 },
      { prId: 'p1', reviewBatchId: 'b1', costUsd: 0.5 },
    ]);
    expect(cost.get('p1')).toBeCloseTo(0.0027);
  });

  it('ignores null-cost (failed) runs inside the batch', () => {
    const cost = latestReviewCostByPr([
      { prId: 'p1', reviewBatchId: 'b1', costUsd: null },
      { prId: 'p1', reviewBatchId: 'b1', costUsd: 0.002 },
    ]);
    expect(cost.get('p1')).toBe(0.002);
  });

  it('null when the latest batch has no known cost; absent when the PR has no runs', () => {
    const cost = latestReviewCostByPr([
      { prId: 'p1', reviewBatchId: 'b2', costUsd: null },
      { prId: 'p1', reviewBatchId: 'b1', costUsd: 0.01 },
    ]);
    expect(cost.get('p1')).toBeNull();
    expect(cost.has('p2')).toBe(false);
  });

  it('legacy runs without a batch id count as a batch of one', () => {
    const cost = latestReviewCostByPr([
      { prId: 'p1', reviewBatchId: null, costUsd: 0.003 },
      { prId: 'p1', reviewBatchId: null, costUsd: 0.004 },
    ]);
    expect(cost.get('p1')).toBe(0.003);
  });
});
