import { describe, it, expect } from 'vitest';
import { runCost } from '../src/modules/reviews/run-cost.js';

/** Stub price book: prices only "priced-model" (1 $/1M in, 2 $/1M out). */
const book = {
  estimate: (model: string, tin: number, tout: number) =>
    model === 'priced-model' ? (tin * 1 + tout * 2) / 1_000_000 : null,
};

describe('runCost (derived, never stored)', () => {
  it('computes the estimate from tokens and the price book', () => {
    expect(runCost(book, 'priced-model', 1_000_000, 500_000)).toBeCloseTo(2, 10);
  });

  it('is null when there was no usage (zero tokens), never 0', () => {
    expect(runCost(book, 'priced-model', 0, 0)).toBeNull();
    expect(runCost(book, 'priced-model', null, null)).toBeNull();
  });

  it('is null when the model has no price', () => {
    expect(runCost(book, 'unknown-model', 1200, 300)).toBeNull();
  });

  it('is null when the model is missing', () => {
    expect(runCost(book, null, 1200, 300)).toBeNull();
  });
});
