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
  latestReviewPerAgent,
  totalCostPerPr,
  rollupSeverities,
  STALE_DAYS,
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

describe('latestReviewPerAgent', () => {
  // Newest-first, as the route queries them (PR #7196's shape: three agents, each run twice).
  const rows = [
    { id: 'perf-2', prId: 'pr1', agentId: 'perf' },
    { id: 'sec-2', prId: 'pr1', agentId: 'sec' },
    { id: 'gen-2', prId: 'pr1', agentId: 'gen' },
    { id: 'perf-1', prId: 'pr1', agentId: 'perf' },
    { id: 'sec-1', prId: 'pr1', agentId: 'sec' },
    { id: 'gen-1', prId: 'pr1', agentId: 'gen' },
    { id: 'other', prId: 'pr2', agentId: 'sec' },
  ];

  it("keeps each agent's newest review, so a newer agent doesn't hide another's findings", () => {
    const byPr = latestReviewPerAgent(rows);
    expect(byPr.get('pr1')!.map((r) => r.id)).toEqual(['perf-2', 'sec-2', 'gen-2']);
    expect(byPr.get('pr2')!.map((r) => r.id)).toEqual(['other']);
  });

  it('treats reviews without an agent as one agent', () => {
    const byPr = latestReviewPerAgent([
      { id: 'legacy-2', prId: 'pr1', agentId: null },
      { id: 'legacy-1', prId: 'pr1', agentId: null },
    ]);
    expect(byPr.get('pr1')!.map((r) => r.id)).toEqual(['legacy-2']);
  });
});

describe('totalCostPerPr', () => {
  it('sums every run with a known cost per PR; unknown costs add nothing', () => {
    const totals = totalCostPerPr([
      { prId: 'pr1', costUsd: 0.0011 },
      { prId: 'pr1', costUsd: 0.0013 },
      { prId: 'pr1', costUsd: null }, // failed run
      { prId: 'pr2', costUsd: 0.5 },
      { prId: null, costUsd: 9 },
    ]);
    expect(totals.get('pr1')).toBeCloseTo(0.0024, 9);
    expect(totals.get('pr2')).toBe(0.5);
  });

  it('leaves out a PR whose runs have no known cost (shown as "—", not $0)', () => {
    expect(totalCostPerPr([{ prId: 'pr1', costUsd: null }]).has('pr1')).toBe(false);
  });
});
