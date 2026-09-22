import { describe, it, expect } from 'vitest';
import type { ModelInfo } from '@devdigest/shared';
import { PriceBook } from '../src/platform/price-book.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

const MODELS: ModelInfo[] = [
  {
    id: 'deepseek/deepseek-v4-flash',
    provider: 'openrouter',
    pricing: { promptPerM: 0.14, completionPerM: 0.28 },
    contextLength: 1_000_000,
  },
];

describe('PriceBook (live OpenRouter pricing for cost attribution)', () => {
  it('uses the fallback until the cache is warm, then live OpenRouter prices', async () => {
    const t = 0;
    // Fallback only knows the static deepseek price; live price will differ.
    const fallback = (m: string) => (m === 'deepseek/deepseek-v4-flash' ? 0.999 : null);
    const pb = new PriceBook(async () => MODELS, fallback, 1000, () => t);

    // Cold cache → fallback value.
    expect(pb.estimate('deepseek/deepseek-v4-flash', 1_000_000, 1_000_000)).toBe(0.999);

    await pb.refresh();
    // Warm: 1e6 * 0.14 (in) + 1e6 * 0.28 (out) = 0.42.
    expect(pb.estimate('deepseek/deepseek-v4-flash', 1_000_000, 1_000_000)).toBeCloseTo(0.42, 9);
  });

  it('falls back for models the OpenRouter list does not price, and returns null when neither knows it', async () => {
    const pb = new PriceBook(async () => MODELS, (m) => (m === 'gpt-4.1' ? 12.34 : null));
    await pb.refresh();
    expect(pb.estimate('gpt-4.1', 0, 0)).toBe(12.34); // not an OR model → static fallback
    expect(pb.estimate('mystery/model', 0, 0)).toBe(null); // unknown everywhere
  });

  it('never throws when the model list fetch fails (stays on the fallback)', async () => {
    const pb = new PriceBook(
      async () => {
        throw new Error('network down');
      },
      (m) => (m === 'deepseek/deepseek-v4-flash' ? 0.5 : null),
    );
    await pb.refresh(); // swallows the error
    expect(pb.estimate('deepseek/deepseek-v4-flash', 0, 0)).toBe(0.5);
  });
});

describe('estimateCost static table (Anthropic first-party list prices)', () => {
  const M = 1_000_000;
  it.each([
    ['claude-opus-5', 5, 25],
    ['claude-opus-4-8', 5, 25],
    ['claude-opus-4-7', 5, 25],
    ['claude-opus-4-6', 5, 25],
    ['claude-sonnet-5', 2, 10],
    ['claude-sonnet-4-6', 3, 15],
    ['claude-haiku-4-5', 1, 5],
    ['claude-haiku-4-5-20251001', 1, 5],
    ['claude-fable-5', 10, 50],
    ['claude-fable-5-1', 10, 50],
  ])('prices current model %s', (model, pin, pout) => {
    expect(estimateCost(model, M, 0)).toBeCloseTo(pin, 9);
    expect(estimateCost(model, 0, M)).toBeCloseTo(pout, 9);
  });

  it('keeps the legacy 3.x aliases (old runs stay priced)', () => {
    expect(estimateCost('claude-3-5-sonnet-latest', M, M)).toBeCloseTo(18, 9);
  });

  it('unknown models are explicitly unpriced (null), never 0', () => {
    expect(estimateCost('claude-some-future-model', M, M)).toBeNull();
  });
});
