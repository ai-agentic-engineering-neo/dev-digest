import { describe, it, expect } from 'vitest';
import { runCostUsd, type CostEstimator } from '../src/platform/run-cost.js';

// deepseek: $0.14 in / $0.28 out per 1M tokens; everything else unpriced.
const prices: CostEstimator = {
  estimate: (model, tokensIn, tokensOut) =>
    model === 'deepseek/deepseek-v4-flash' ? (tokensIn * 0.14 + tokensOut * 0.28) / 1_000_000 : null,
};

describe('runCostUsd (per-run cost, computed on read)', () => {
  it('prices a completed run as tokens × current price', () => {
    // 8,000 × 0.14 + 1,119 × 0.28 = 1,120 + 313.32 = 1,433.32 / 1e6
    expect(runCostUsd(prices, 'deepseek/deepseek-v4-flash', 8000, 1119)).toBeCloseTo(0.00143332, 10);
  });

  it('returns null (unknown), never 0, when there is no data', () => {
    expect(runCostUsd(prices, 'deepseek/deepseek-v4-flash', 0, 0)).toBeNull(); // failed/cancelled run
    expect(runCostUsd(prices, null, 100, 50)).toBeNull();
    expect(runCostUsd(prices, 'deepseek/deepseek-v4-flash', null, 50)).toBeNull();
    expect(runCostUsd(prices, 'mystery/model', 100, 50)).toBeNull(); // unpriced model
  });
});
