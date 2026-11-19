import { describe, it, expect } from 'vitest';
import { aggregatePrCost, type CostRunRow } from './cost.js';

const run = (prId: string, agentId: string | null, costUsd: number | null, minute: number): CostRunRow => ({
  prId,
  agentId,
  costUsd,
  ranAt: new Date(Date.UTC(2026, 10, 19, 12, minute)),
});

describe('aggregatePrCost', () => {
  it('sums the latest run of each agent', () => {
    const m = aggregatePrCost([run('p1', 'a', 0.01, 1), run('p1', 'b', 0.02, 2)]);
    expect(m.get('p1')).toBeCloseTo(0.03);
  });

  it('ignores older re-runs of the same agent', () => {
    const m = aggregatePrCost([run('p1', 'a', 0.5, 1), run('p1', 'a', 0.01, 5), run('p1', 'a', 0.9, 3)]);
    expect(m.get('p1')).toBeCloseTo(0.01);
  });

  it('omits PRs with no cost data (null, not 0)', () => {
    const m = aggregatePrCost([run('p1', 'a', null, 1)]);
    expect(m.has('p1')).toBe(false);
  });

  it('sums the non-null costs when some are null', () => {
    const m = aggregatePrCost([run('p1', 'a', null, 1), run('p1', 'b', 0.02, 1)]);
    expect(m.get('p1')).toBeCloseTo(0.02);
  });

  it('keeps a real zero cost (free model)', () => {
    expect(aggregatePrCost([run('p1', 'a', 0, 1)]).get('p1')).toBe(0);
  });

  it('keeps PRs separate', () => {
    const m = aggregatePrCost([run('p1', 'a', 0.01, 1), run('p2', 'a', 0.02, 1)]);
    expect(m.get('p1')).toBeCloseTo(0.01);
    expect(m.get('p2')).toBeCloseTo(0.02);
  });
});
