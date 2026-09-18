import { describe, it, expect } from 'vitest';
import { sumCostByPr } from './helpers.js';

describe('sumCostByPr', () => {
  it('sums cost across multiple done runs for the same PR', () => {
    const byPr = sumCostByPr([
      { prId: 'pr1', costUsd: 0.01 },
      { prId: 'pr1', costUsd: 0.02 },
      { prId: 'pr1', costUsd: 0.005 },
    ]);
    expect(byPr.get('pr1')).toBeCloseTo(0.035);
  });

  it('keeps totals separate per PR', () => {
    const byPr = sumCostByPr([
      { prId: 'pr1', costUsd: 0.01 },
      { prId: 'pr2', costUsd: 0.02 },
    ]);
    expect(byPr.get('pr1')).toBe(0.01);
    expect(byPr.get('pr2')).toBe(0.02);
  });

  it('skips a null-cost (unpriced) run without zeroing the total', () => {
    const byPr = sumCostByPr([
      { prId: 'pr1', costUsd: 0.01 },
      { prId: 'pr1', costUsd: null },
    ]);
    expect(byPr.get('pr1')).toBe(0.01);
  });

  it('has no entry for a PR whose only runs are unpriced', () => {
    const byPr = sumCostByPr([{ prId: 'pr1', costUsd: null }]);
    expect(byPr.has('pr1')).toBe(false);
  });

  it('has no entry for a PR with no runs at all', () => {
    const byPr = sumCostByPr([]);
    expect(byPr.has('pr1')).toBe(false);
  });

  it('ignores a row with a null prId', () => {
    const byPr = sumCostByPr([{ prId: null, costUsd: 5 }]);
    expect(byPr.size).toBe(0);
  });
});
