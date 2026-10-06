/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import { deriveReviewStatus, rollupCostPerPr, rollupSeverities, STALE_DAYS } from '../src/modules/pulls/status.js';

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

describe('rollupCostPerPr', () => {
  // Rows are newest-first, as the route queries them.
  const row = (prId: string, agentId: string | null, status: string, costUsd: number | null) => ({
    prId,
    agentId,
    status,
    costUsd,
  });

  it('sums the latest finished run of each agent; reruns replace, not add', () => {
    const totals = rollupCostPerPr([
      row('pr1', 'sec', 'done', 0.0013), // latest Security run
      row('pr1', 'perf', 'done', 0.0014),
      row('pr1', 'sec', 'done', 0.05), // older Security rerun — ignored
    ]);
    expect(totals.get('pr1')).toBeCloseTo(0.0027, 10);
  });

  it("skips a running run so that agent's previous finished run counts", () => {
    const totals = rollupCostPerPr([row('pr1', 'sec', 'running', null), row('pr1', 'sec', 'done', 0.002)]);
    expect(totals.get('pr1')).toBe(0.002);
  });

  it('counts the partial cost of a failed latest run', () => {
    const totals = rollupCostPerPr([row('pr1', 'sec', 'failed', 0.0006), row('pr1', 'sec', 'done', 0.002)]);
    expect(totals.get('pr1')).toBe(0.0006);
  });

  it('leaves unknown costs out; a PR with no known cost is absent (→ null)', () => {
    const totals = rollupCostPerPr([
      row('pr1', 'sec', 'done', null),
      row('pr1', 'perf', 'done', 0.001),
      row('pr2', 'sec', 'done', null),
    ]);
    expect(totals.get('pr1')).toBe(0.001);
    expect(totals.has('pr2')).toBe(false);
  });

  it('keeps PRs apart and treats a deleted agent (null id) as its own group', () => {
    const totals = rollupCostPerPr([row('pr1', null, 'done', 0.001), row('pr2', 'sec', 'done', 0.003)]);
    expect(totals.get('pr1')).toBe(0.001);
    expect(totals.get('pr2')).toBe(0.003);
  });
});
