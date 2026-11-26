import { describe, it, expect } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ConfigError } from '../src/platform/errors.js';
import {
  featureModelCandidates,
  pickAvailableLLM,
} from '../src/modules/settings/feature-models.js';

/** A feature model whose provider has no key falls back to one that does (OpenRouter → OpenAI → Anthropic). */

type P = 'openai' | 'anthropic' | 'openrouter';

/** llmFor that has keys only for `available`; others throw like container.llm(). */
function keysFor(available: P[], calls: P[] = []) {
  return async (p: P): Promise<LLMProvider> => {
    calls.push(p);
    if (!available.includes(p)) throw new ConfigError(`${p.toUpperCase()}_API_KEY is not configured`);
    return new MockLLMProvider(p === 'openrouter' ? 'openai' : p);
  };
}

describe('feature model fallback', () => {
  it('orders the chosen model first, then the other providers cheapest first', () => {
    expect(featureModelCandidates({ provider: 'openai', model: 'gpt-5.4' })).toEqual([
      { provider: 'openai', model: 'gpt-5.4' },
      { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    ]);
    expect(featureModelCandidates({ provider: 'openrouter', model: 'x/y' }).map((c) => c.provider)).toEqual([
      'openrouter',
      'openai',
      'anthropic',
    ]);
  });

  it('keeps the chosen model when its provider has a key', async () => {
    const res = await pickAvailableLLM({ provider: 'openai', model: 'gpt-5.4' }, keysFor(['openai', 'openrouter']));
    expect(res.choice).toEqual({ provider: 'openai', model: 'gpt-5.4' });
  });

  it('falls back to OpenRouter when only it has a key', async () => {
    const calls: P[] = [];
    const res = await pickAvailableLLM({ provider: 'openai', model: 'gpt-5.4' }, keysFor(['openrouter'], calls));
    expect(res.choice).toEqual({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' });
    expect(calls).toEqual(['openai', 'openrouter']);
  });

  it('reaches Anthropic last', async () => {
    const res = await pickAvailableLLM({ provider: 'openai', model: 'gpt-5.4' }, keysFor(['anthropic']));
    expect(res.choice).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
  });

  it('fails with a clear ConfigError when no provider has a key', async () => {
    await expect(pickAvailableLLM({ provider: 'openai', model: 'gpt-5.4' }, keysFor([]))).rejects.toThrow(
      /No LLM provider key is configured/,
    );
  });

  it('does not swallow a non-config error', async () => {
    const boom = async (): Promise<LLMProvider> => {
      throw new Error('network down');
    };
    await expect(pickAvailableLLM({ provider: 'openrouter', model: 'x' }, boom)).rejects.toThrow('network down');
  });
});
