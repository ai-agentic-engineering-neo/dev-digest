import { describe, it, expect } from 'vitest';
import { aggregatePrCosts, type RunCostRow } from '../src/modules/pulls/cost.js';

const row = (o: Partial<RunCostRow>): RunCostRow => ({
  prId: 'pr1',
  agentId: 'a1',
  status: 'done',
  costUsd: 0.001,
  ...o,
});

describe('aggregatePrCosts (PR list COST column)', () => {
  it('sums the latest run of each agent', () => {
    const m = aggregatePrCosts([
      row({ agentId: 'sec', costUsd: 0.0013 }),
      row({ agentId: 'perf', costUsd: 0.0014 }),
      row({ agentId: 'perf', costUsd: 0.0012 }), // older perf run — ignored
    ]);
    expect(m.get('pr1')).toBeCloseTo(0.0027, 10);
  });

  it('a latest run with unknown cost shadows an older priced run of the same agent', () => {
    const m = aggregatePrCosts([
      row({ agentId: 'gen', status: 'failed', costUsd: null }),
      row({ agentId: 'gen', costUsd: 0.05 }),
      row({ agentId: 'sec', costUsd: 0.001 }),
    ]);
    expect(m.get('pr1')).toBeCloseTo(0.001, 10);
  });

  it('counts failed runs that recorded partial cost', () => {
    const m = aggregatePrCosts([row({ status: 'cancelled', costUsd: 0.002 })]);
    expect(m.get('pr1')).toBeCloseTo(0.002, 10);
  });

  it('skips running runs and runs of deleted agents', () => {
    const m = aggregatePrCosts([
      row({ status: 'running', costUsd: null }),
      row({ costUsd: 0.003 }), // previous completed run of a1 → counted
      row({ agentId: null, costUsd: 9 }),
    ]);
    expect(m.get('pr1')).toBeCloseTo(0.003, 10);
  });

  it('null when no run has cost data; absent when the PR has no runs', () => {
    const m = aggregatePrCosts([row({ costUsd: null }), row({ agentId: 'a2', costUsd: null })]);
    expect(m.get('pr1')).toBeNull();
    expect(m.has('pr2')).toBe(false);
  });

  it('keeps PRs apart', () => {
    const m = aggregatePrCosts([row({ prId: 'pr1', costUsd: 0.01 }), row({ prId: 'pr2', costUsd: 0.02 })]);
    expect(m.get('pr1')).toBeCloseTo(0.01, 10);
    expect(m.get('pr2')).toBeCloseTo(0.02, 10);
  });
});
