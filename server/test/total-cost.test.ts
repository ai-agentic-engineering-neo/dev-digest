/**
 * PR-list COST column reducer (`modules/pulls/total-cost.ts`) — pure
 * grouping/summing over already-fetched `agent_runs` rows, unit-tested
 * without a DB. Sums every successful (status='done') run's cost for the
 * PR — not just the newest batch — per criterion 12.
 */
import { describe, it, expect } from 'vitest';
import { totalCostByPr } from '../src/modules/pulls/total-cost.js';

describe('totalCostByPr', () => {
  it('sums a single batch of 3 runs', () => {
    const result = totalCostByPr([
      { prId: 'pr1', runId: 'r1', costUsd: 0.01 },
      { prId: 'pr1', runId: 'r2', costUsd: 0.02 },
      { prId: 'pr1', runId: 'r3', costUsd: 0.003 },
    ]);
    expect(result.get('pr1')).toBeCloseTo(0.033);
  });

  it('sums across multiple batches / re-runs, not just the newest', () => {
    const result = totalCostByPr([
      { prId: 'pr1', runId: 'r3', costUsd: 0.05 },
      { prId: 'pr1', runId: 'r1', costUsd: 0.01 },
      { prId: 'pr1', runId: 'r2', costUsd: 0.02 },
    ]);
    expect(result.get('pr1')).toBeCloseTo(0.08);
  });

  it('a PR with no known prices is null', () => {
    const result = totalCostByPr([
      { prId: 'pr1', runId: 'r1', costUsd: null },
      { prId: 'pr1', runId: 'r2', costUsd: null },
    ]);
    expect(result.get('pr1')).toBeNull();
  });

  it('mixes known and unknown, summing only the known', () => {
    const result = totalCostByPr([
      { prId: 'pr1', runId: 'r1', costUsd: null },
      { prId: 'pr1', runId: 'r2', costUsd: 0.02 },
    ]);
    expect(result.get('pr1')).toBe(0.02);
  });

  it('keeps PRs independent', () => {
    const result = totalCostByPr([
      { prId: 'pr1', runId: 'r1', costUsd: 0.01 },
      { prId: 'pr2', runId: 'r2', costUsd: 0.02 },
    ]);
    expect(result.get('pr1')).toBe(0.01);
    expect(result.get('pr2')).toBe(0.02);
  });

  it('a PR with no rows at all is absent from the map', () => {
    const result = totalCostByPr([]);
    expect(result.has('pr1')).toBe(false);
  });
});
