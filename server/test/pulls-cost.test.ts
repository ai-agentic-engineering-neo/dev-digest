/**
 * PR-list COST rollup (`modules/pulls/cost.ts`) — sum of completed runs' cost,
 * with unknown costs skipped and "no known cost" left absent (UI shows "—").
 */
import { describe, it, expect } from 'vitest';
import { sumRunCostByPr } from '../src/modules/pulls/cost.js';

describe('sumRunCostByPr', () => {
  it('sums cost over completed runs per PR', () => {
    const m = sumRunCostByPr([
      { prId: 'a', status: 'done', costUsd: 0.01 },
      { prId: 'a', status: 'done', costUsd: 0.004 },
      { prId: 'b', status: 'done', costUsd: 0.002 },
    ]);
    expect(m.get('a')).toBeCloseTo(0.014);
    expect(m.get('b')).toBeCloseTo(0.002);
  });

  it('ignores failed/running runs and unknown costs', () => {
    const m = sumRunCostByPr([
      { prId: 'a', status: 'failed', costUsd: 0.5 },
      { prId: 'a', status: 'running', costUsd: null },
      { prId: 'a', status: 'done', costUsd: 0.003 },
      { prId: 'a', status: 'done', costUsd: null },
      { prId: null, status: 'done', costUsd: 1 },
    ]);
    expect(m.get('a')).toBeCloseTo(0.003);
    expect(m.size).toBe(1);
  });

  it('leaves a PR absent when no completed run has a known cost', () => {
    const m = sumRunCostByPr([
      { prId: 'a', status: 'done', costUsd: null },
      { prId: 'a', status: 'failed', costUsd: null },
    ]);
    expect(m.has('a')).toBe(false);
  });
});
