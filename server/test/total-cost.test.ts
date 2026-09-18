import { describe, it, expect } from 'vitest';
import { totalCostByPr, type AgentRunCostRow } from '../src/modules/pulls/total-cost.js';

function row(over: Partial<AgentRunCostRow>): AgentRunCostRow {
  return { prId: 'pr-1', status: 'done', costUsd: 0, ...over };
}

describe('totalCostByPr', () => {
  it('a PR with a single completed run: cost = that run\'s cost', () => {
    const out = totalCostByPr([row({ costUsd: 0.012 })]);
    expect(out.get('pr-1')).toBe(0.012);
  });

  it('sums every completed run across the PR\'s whole history, not just the latest batch', () => {
    const runs: AgentRunCostRow[] = [
      row({ status: 'done', costUsd: 0.05 }), // most recent run
      row({ status: 'done', costUsd: 999 }), // an older run — still counted
    ];
    const out = totalCostByPr(runs);
    expect(out.get('pr-1')).toBeCloseTo(999.05, 9);
  });

  it('excludes failed/cancelled/running runs, but not their siblings\' spend', () => {
    const runs: AgentRunCostRow[] = [
      row({ status: 'done', costUsd: 0.0013 }),
      row({ status: 'done', costUsd: 0.0014 }),
      row({ status: 'failed', costUsd: null }),
    ];
    const out = totalCostByPr(runs);
    expect(out.get('pr-1')).toBeCloseTo(0.0027, 9);
  });

  it('a PR where every run failed → null, not 0', () => {
    const runs: AgentRunCostRow[] = [
      row({ status: 'failed', costUsd: null }),
      row({ status: 'cancelled', costUsd: null }),
    ];
    const out = totalCostByPr(runs);
    expect(out.get('pr-1')).toBeNull();
  });

  it('keeps PRs independent', () => {
    const runs: AgentRunCostRow[] = [
      row({ prId: 'pr-1', status: 'done', costUsd: 1 }),
      row({ prId: 'pr-2', status: 'done', costUsd: 2 }),
    ];
    const out = totalCostByPr(runs);
    expect(out.get('pr-1')).toBe(1);
    expect(out.get('pr-2')).toBe(2);
  });

  it('ignores rows with no prId', () => {
    const out = totalCostByPr([row({ prId: null })]);
    expect(out.size).toBe(0);
  });
});
