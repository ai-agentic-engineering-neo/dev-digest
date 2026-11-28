import { describe, it, expect, vi } from 'vitest';
import { latestRunCostByPr, runCostUsd, type PricedRun } from '../src/modules/pulls/cost.js';

function run(o: Partial<PricedRun>): PricedRun {
  return { prId: 'pr-1', model: 'gpt-4o-mini', tokensIn: 1000, tokensOut: 200, costUsd: undefined, ...o };
}

describe('runCostUsd', () => {
  it('prefers the cost recorded in the run trace', () => {
    const estimate = vi.fn(() => 99);
    expect(runCostUsd(run({ costUsd: 0.0042 }), estimate)).toBe(0.0042);
    expect(estimate).not.toHaveBeenCalled();
  });

  it('falls back to a token-based estimate for traces without cost', () => {
    const estimate = vi.fn(() => 0.001);
    expect(runCostUsd(run({}), estimate)).toBe(0.001);
    expect(estimate).toHaveBeenCalledWith('gpt-4o-mini', 1000, 200);
  });

  it('is null when nothing can be priced', () => {
    const estimate = vi.fn(() => 0.5);
    expect(runCostUsd(run({ model: null }), estimate)).toBeNull();
    expect(runCostUsd(run({ tokensIn: 0, tokensOut: 0 }), estimate)).toBeNull();
    expect(runCostUsd(run({ costUsd: null }), () => null)).toBeNull();
  });
});

describe('latestRunCostByPr', () => {
  it('takes the first (newest) run per PR', () => {
    const runs = [
      run({ prId: 'a', costUsd: 0.01 }),
      run({ prId: 'b', costUsd: 0.2 }),
      run({ prId: 'a', costUsd: 5 }),
    ];
    const map = latestRunCostByPr(runs, () => null);
    expect(map.get('a')).toBe(0.01);
    expect(map.get('b')).toBe(0.2);
  });

  it('does not let an older priced run stand in for a newer unpriced one', () => {
    const runs = [run({ prId: 'a', model: null }), run({ prId: 'a', costUsd: 3 })];
    expect(latestRunCostByPr(runs, () => null).get('a')).toBeNull();
  });

  it('has no entry for PRs without runs', () => {
    expect(latestRunCostByPr([], () => 1).has('a')).toBe(false);
  });
});
