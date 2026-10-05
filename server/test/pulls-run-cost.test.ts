/**
 * PR-list cost (`modules/pulls/run-cost.ts`): the COST cell shows the cost of
 * the run behind the PR's latest review — the same review the score ring uses —
 * so cost and score never describe different runs.
 */
import { describe, it, expect } from 'vitest';
import { costOfLatestReviewRun, type RunCostRow } from '../src/modules/pulls/run-cost.js';

const run = (o: Partial<RunCostRow> & { id: string }): RunCostRow => ({ status: 'done', costUsd: 0.01, ...o });

describe('costOfLatestReviewRun', () => {
  it("returns the latest review's run cost", () => {
    const m = costOfLatestReviewRun(new Map([['pr1', 'r2']]), [
      run({ id: 'r1', costUsd: 0.5 }),
      run({ id: 'r2', costUsd: 0.014 }),
    ]);
    expect(m.get('pr1')).toBe(0.014);
  });

  it('a run that is not done never shows a price', () => {
    for (const status of ['failed', 'cancelled', 'running', null]) {
      const m = costOfLatestReviewRun(new Map([['pr1', 'r1']]), [run({ id: 'r1', status, costUsd: 0.3 })]);
      expect(m.get('pr1')).toBeNull();
    }
  });

  it('unknown cost stays null; a missing run (deleted) or a review without run_id is null', () => {
    const m = costOfLatestReviewRun(
      new Map<string, string | null>([['a', 'r1'], ['b', 'gone'], ['c', null]]),
      [run({ id: 'r1', costUsd: null })],
    );
    expect(m.get('a')).toBeNull();
    expect(m.get('b')).toBeNull();
    expect(m.get('c')).toBeNull();
  });

  it('keeps a real zero (free model) as 0, distinct from null', () => {
    expect(costOfLatestReviewRun(new Map([['pr1', 'r1']]), [run({ id: 'r1', costUsd: 0 })]).get('pr1')).toBe(0);
  });

  it('PRs without a review are absent', () => {
    expect(costOfLatestReviewRun(new Map(), [run({ id: 'r1' })]).size).toBe(0);
  });
});
