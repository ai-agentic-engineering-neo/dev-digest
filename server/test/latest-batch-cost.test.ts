import { describe, it, expect } from 'vitest';
import { latestBatchCostByPr, type AgentRunCostRow } from '../src/modules/pulls/latest-batch-cost.js';

function row(over: Partial<AgentRunCostRow>): AgentRunCostRow {
  return { prId: 'pr-1', id: 'run-1', batchId: null, status: 'done', costUsd: 0, ...over };
}

describe('latestBatchCostByPr', () => {
  it('a PR with a single completed run: cost = that run\'s cost', () => {
    const out = latestBatchCostByPr([row({ id: 'r1', costUsd: 0.012 })]);
    expect(out.get('pr-1')).toBe(0.012);
  });

  it('sums a multi-agent batch, excluding a run that errored (matches PR #482: some done + one 429)', () => {
    const batchId = 'batch-1';
    const runs: AgentRunCostRow[] = [
      row({ id: 'r1', batchId, status: 'done', costUsd: 0.0013 }),
      row({ id: 'r2', batchId, status: 'done', costUsd: 0.0014 }),
      row({ id: 'r3', batchId, status: 'failed', costUsd: null }),
    ];
    const out = latestBatchCostByPr(runs);
    expect(out.get('pr-1')).toBeCloseTo(0.0027, 9);
  });

  it('a batch where every run failed → null, not 0', () => {
    const batchId = 'batch-1';
    const runs: AgentRunCostRow[] = [
      row({ id: 'r1', batchId, status: 'failed', costUsd: null }),
      row({ id: 'r2', batchId, status: 'cancelled', costUsd: null }),
    ];
    const out = latestBatchCostByPr(runs);
    expect(out.get('pr-1')).toBeNull();
  });

  it('older runs with no batch_id are each their own singleton batch — only the newest counts', () => {
    // Newest-first input (caller sorts by ran_at DESC before calling).
    const runs: AgentRunCostRow[] = [
      row({ id: 'newest', batchId: null, status: 'done', costUsd: 0.05 }),
      row({ id: 'older', batchId: null, status: 'done', costUsd: 999 }),
    ];
    const out = latestBatchCostByPr(runs);
    expect(out.get('pr-1')).toBe(0.05);
  });

  it('ignores runs outside the latest batch entirely, even other done runs for the same PR', () => {
    const runs: AgentRunCostRow[] = [
      row({ id: 'r1', batchId: 'latest', status: 'done', costUsd: 0.01 }),
      row({ id: 'r2', batchId: 'previous', status: 'done', costUsd: 100 }),
    ];
    const out = latestBatchCostByPr(runs);
    expect(out.get('pr-1')).toBe(0.01);
  });

  it('keeps PRs independent', () => {
    const runs: AgentRunCostRow[] = [
      row({ prId: 'pr-1', id: 'a', status: 'done', costUsd: 1 }),
      row({ prId: 'pr-2', id: 'b', status: 'done', costUsd: 2 }),
    ];
    const out = latestBatchCostByPr(runs);
    expect(out.get('pr-1')).toBe(1);
    expect(out.get('pr-2')).toBe(2);
  });

  it('ignores rows with no prId', () => {
    const out = latestBatchCostByPr([row({ prId: null })]);
    expect(out.size).toBe(0);
  });
});
