import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// One shared fake for the OpenAI SDK client the provider builds internally.
const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { DEFAULT_REVIEW_MAX_TOKENS } from '../src/review/run.js';
import { OpenRouterProvider, TRUNCATION_TOKEN_CEILING, TRUNCATION_TOKEN_FACTOR } from '../src/llm/openrouter.js';

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

  it('a review-sized cap (DEFAULT_REVIEW_MAX_TOKENS) still gets a bigger retry on truncation', async () => {
    expect(DEFAULT_REVIEW_MAX_TOKENS * TRUNCATION_TOKEN_FACTOR).toBeLessThanOrEqual(TRUNCATION_TOKEN_CEILING);
    create
      .mockResolvedValueOnce(reply('', 'length'))
      .mockResolvedValueOnce(reply('{"intent":"Add rate limiting"}', 'stop'));
    const res = await new OpenRouterProvider('k').completeStructured({ ...req, maxTokens: DEFAULT_REVIEW_MAX_TOKENS });

    expect(res.data).toEqual({ intent: 'Add rate limiting' });
    expect(create.mock.calls[0]![0].max_tokens).toBe(8000);
    expect(create.mock.calls[1]![0].max_tokens).toBe(16000);
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

  it('blames the token limit only when the LAST attempt was cut off', async () => {
    create
      .mockResolvedValueOnce(reply('{"intent":"Add', 'length'))
      .mockResolvedValueOnce(reply('{"intent": 42}', 'stop'));
    const err = await new OpenRouterProvider('k').completeStructured(req).catch((e: Error) => e);
    expect((err as Error).message).toBe(
      'OpenRouter structured output failed schema validation for PrIntentClassification',
    );
  });

  it('never raises the cap above the ceiling', async () => {
    create.mockResolvedValue(reply('', 'length'));
    await new OpenRouterProvider('k')
      .completeStructured({ ...req, maxTokens: 12_000, maxRetries: 2 })
      .catch(() => undefined);
    expect(create.mock.calls.map((c) => c[0].max_tokens)).toEqual([12_000, TRUNCATION_TOKEN_CEILING, TRUNCATION_TOKEN_CEILING]);
  });

  it('without a cap of its own, a cut-off reply gets the repair prompt (no identical resend)', async () => {
    const { maxTokens: _omit, ...uncapped } = req;
    create
      .mockResolvedValueOnce(reply('{"intent":"Add', 'length'))
      .mockResolvedValueOnce(reply('{"intent":"Add rate limiting"}', 'stop'));
    const res = await new OpenRouterProvider('k').completeStructured(uncapped);
    expect(res.data).toEqual({ intent: 'Add rate limiting' });
    expect(create.mock.calls[1]![0].max_tokens).toBeUndefined();
    expect(create.mock.calls[1]![0].messages).toHaveLength(3);
  });
});
