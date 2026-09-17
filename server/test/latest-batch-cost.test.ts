/**
 * PR-list COST column reducer (`modules/pulls/latest-batch-cost.ts`) — pure
 * grouping/summing over already-fetched `agent_runs` rows, unit-tested
 * without a DB.
 */
import { describe, it, expect } from 'vitest';
import { latestBatchCostByPr } from '../src/modules/pulls/latest-batch-cost.js';

describe('latestBatchCostByPr', () => {
  it('sums a batch of 3 runs', () => {
    const result = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b1', runId: 'r1', costUsd: 0.01 },
      { prId: 'pr1', batchId: 'b1', runId: 'r2', costUsd: 0.02 },
      { prId: 'pr1', batchId: 'b1', runId: 'r3', costUsd: 0.003 },
    ]);
    expect(result.get('pr1')).toBeCloseTo(0.033);
  });

  it('a run outside the latest batch is not included', () => {
    const result = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b2', runId: 'r3', costUsd: 0.05 },
      { prId: 'pr1', batchId: 'b1', runId: 'r1', costUsd: 0.01 },
      { prId: 'pr1', batchId: 'b1', runId: 'r2', costUsd: 0.02 },
    ]);
    expect(result.get('pr1')).toBeCloseTo(0.05);
  });

  it('batchId: null means the run is its own batch', () => {
    const result = latestBatchCostByPr([
      { prId: 'pr1', batchId: null, runId: 'r1', costUsd: 0.04 },
      { prId: 'pr1', batchId: 'b1', runId: 'r2', costUsd: 0.02 },
    ]);
    expect(result.get('pr1')).toBe(0.04);
  });

  it('a batch with no known prices is null', () => {
    const result = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b1', runId: 'r1', costUsd: null },
      { prId: 'pr1', batchId: 'b1', runId: 'r2', costUsd: null },
    ]);
    expect(result.get('pr1')).toBeNull();
  });

  it('mixes known and unknown within a batch, summing only the known', () => {
    const result = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b1', runId: 'r1', costUsd: null },
      { prId: 'pr1', batchId: 'b1', runId: 'r2', costUsd: 0.02 },
    ]);
    expect(result.get('pr1')).toBe(0.02);
  });

  it('keeps PRs independent', () => {
    const result = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b1', runId: 'r1', costUsd: 0.01 },
      { prId: 'pr2', batchId: 'b2', runId: 'r2', costUsd: 0.02 },
    ]);
    expect(result.get('pr1')).toBe(0.01);
    expect(result.get('pr2')).toBe(0.02);
  });
});
