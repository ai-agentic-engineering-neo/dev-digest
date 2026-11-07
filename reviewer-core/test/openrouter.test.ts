import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// One shared fake for the OpenAI SDK client the provider builds internally.
const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { OpenRouterProvider, TRUNCATION_TOKEN_FACTOR } from '../src/llm/openrouter.js';

const Schema = z.object({ intent: z.string() });
const req = {
  model: 'deepseek/deepseek-v4-flash',
  schema: Schema,
  schemaName: 'PrIntentClassification',
  messages: [{ role: 'user' as const, content: 'derive the intent' }],
  maxTokens: 800,
  maxRetries: 1,
};
const reply = (content: string, finish_reason: string) => ({
  choices: [{ message: { content }, finish_reason }],
  usage: { prompt_tokens: 10, completion_tokens: 800 },
});

beforeEach(() => create.mockReset());

describe('OpenRouterProvider.completeStructured — truncated replies', () => {
  it('retries a reply cut off at max_tokens with a doubled cap and no repair prompt', async () => {
    create
      .mockResolvedValueOnce(reply('', 'length')) // all tokens went to hidden reasoning
      .mockResolvedValueOnce(reply('{"intent":"Add rate limiting"}', 'stop'));
    const res = await new OpenRouterProvider('k').completeStructured(req);

    expect(res.data).toEqual({ intent: 'Add rate limiting' });
    expect(res.attempts).toBe(2);
    expect(create.mock.calls[0]![0].max_tokens).toBe(800);
    expect(create.mock.calls[1]![0].max_tokens).toBe(800 * TRUNCATION_TOKEN_FACTOR);
    // Same conversation — the cut-off reply is not fed back as something to repair.
    expect(create.mock.calls[1]![0].messages).toEqual(req.messages);
  });

  it('says the response was cut off when every attempt is truncated', async () => {
    create.mockResolvedValue(reply('{"intent":"Add rate', 'length'));
    await expect(new OpenRouterProvider('k').completeStructured(req)).rejects.toThrow(
      'OpenRouter structured output failed schema validation for PrIntentClassification (the response was cut off at the token limit)',
    );
  });

  it('still asks the model to repair malformed JSON that was not truncated', async () => {
    create
      .mockResolvedValueOnce(reply('{"intent": 42}', 'stop'))
      .mockResolvedValueOnce(reply('{"intent":"Fix login"}', 'stop'));
    const res = await new OpenRouterProvider('k').completeStructured(req);

    expect(res.data).toEqual({ intent: 'Fix login' });
    const retryMessages = create.mock.calls[1]![0].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1]).toEqual({ role: 'assistant', content: '{"intent": 42}' });
    expect(create.mock.calls[1]![0].max_tokens).toBe(800);
  });
});
