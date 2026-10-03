import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { extractJson, parseWithRepair, toJsonSchema } from '../src/llm/structured.js';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

/**
 * Direct coverage for the structured-output parsing core, exercised against
 * the REAL functions (not through MockLLMProvider, which bypasses all of this
 * by returning `structured: fixture` directly). Covers: malformed JSON,
 * JSON fenced in markdown code blocks, and OpenRouterProvider's
 * retry-and-repair reprompt loop.
 */

describe('extractJson', () => {
  it('extracts JSON fenced in a ```json code block', () => {
    const text = 'Sure, here you go:\n```json\n{"a": 1, "b": [1,2,3]}\n```\nThanks!';
    expect(extractJson(text)).toBe('{"a": 1, "b": [1,2,3]}');
  });

  it('extracts JSON fenced in a plain ``` code block (no "json" tag)', () => {
    const text = '```\n{"a": 1}\n```';
    expect(extractJson(text)).toBe('{"a": 1}');
  });

  it('extracts the first balanced object when there is no fence', () => {
    const text = 'blah blah {"a": {"b": 1}} trailing text';
    expect(extractJson(text)).toBe('{"a": {"b": 1}}');
  });

  it('extracts a balanced array', () => {
    const text = 'result: [1, [2, 3], 4] tail';
    expect(extractJson(text)).toBe('[1, [2, 3], 4]');
  });

  it('falls back to the raw trimmed text when no object/array delimiter exists', () => {
    expect(extractJson('  not json at all  ')).toBe('not json at all');
  });
});

describe('parseWithRepair', () => {
  const schema = z.object({ a: z.number(), b: z.string() });

  it('parses clean JSON directly', () => {
    const res = parseWithRepair(schema, '{"a": 1, "b": "x"}');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ a: 1, b: 'x' });
  });

  it('recovers JSON fenced in a markdown code block', () => {
    const res = parseWithRepair(schema, '```json\n{"a": 1, "b": "x"}\n```');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ a: 1, b: 'x' });
  });

  it('reports malformed JSON with a reprompt asking for pure JSON', () => {
    const res = parseWithRepair(schema, 'this is not json {');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/not valid JSON/);
      expect(res.repromptMessage).toMatch(/Return ONLY a single valid JSON object/);
    }
  });

  it('reports schema mismatches per-field with a reprompt listing the issues', () => {
    const res = parseWithRepair(schema, '{"a": "not-a-number"}');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/a:/);
      expect(res.repromptMessage).toMatch(/did not match the required schema/);
    }
  });
});

describe('toJsonSchema', () => {
  it('converts a Zod schema to a JSON schema under the given name', () => {
    const schema = z.object({ ok: z.boolean() });
    const result = toJsonSchema(schema, 'Thing');
    expect(result.name).toBe('Thing');
    expect(result.schema).toMatchObject({ type: 'object' });
  });
});

/**
 * OpenRouterProvider.completeStructured's retry loop, driven for real (not via
 * MockLLMProvider). We stub the OpenAI SDK's `chat.completions.create` — the
 * one network seam — directly on the provider's private client instance, so
 * no HTTP call is made and the actual parse/reprompt/retry code runs.
 */
describe('OpenRouterProvider.completeStructured — retry-and-repair loop', () => {
  const schema = z.object({ verdict: z.enum(['approve', 'reject']) });

  interface CreateCallArgs {
    model: string;
    messages: { role: string; content: string }[];
  }

  function chatCompletion(content: string) {
    return {
      id: 'chatcmpl-test',
      object: 'chat.completion' as const,
      created: 0,
      model: 'test-model',
      choices: [
        { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' as const, logprobs: null },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  }

  function stubClient(provider: OpenRouterProvider) {
    const create = vi.fn();
    (
      provider as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client.chat.completions.create = create;
    return create;
  }

  it('reprompts on malformed JSON, then succeeds on the repaired retry', async () => {
    const provider = new OpenRouterProvider('test-key');
    const create = stubClient(provider);
    create
      .mockResolvedValueOnce(chatCompletion('not json at all'))
      .mockResolvedValueOnce(chatCompletion('{"verdict": "approve"}'));

    const result = await provider.completeStructured({
      model: 'test-model',
      schema,
      schemaName: 'Verdict',
      messages: [{ role: 'user', content: 'go' }],
      maxRetries: 2,
    });

    expect(result.data).toEqual({ verdict: 'approve' });
    expect(result.attempts).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);

    // The retry reprompts with the bad output plus a fix-it instruction.
    const secondCallArgs = create.mock.calls[1]![0] as CreateCallArgs;
    expect(secondCallArgs.messages.at(-1)?.content).toMatch(/valid JSON/);
  });

  it('recovers JSON fenced in a markdown code block without needing a retry', async () => {
    const provider = new OpenRouterProvider('test-key');
    const create = stubClient(provider);
    create.mockResolvedValueOnce(chatCompletion('```json\n{"verdict": "reject"}\n```'));

    const result = await provider.completeStructured({
      model: 'test-model',
      schema,
      schemaName: 'Verdict',
      messages: [{ role: 'user', content: 'go' }],
    });

    expect(result.data).toEqual({ verdict: 'reject' });
    expect(result.attempts).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retries on persistently malformed output', async () => {
    const provider = new OpenRouterProvider('test-key');
    const create = stubClient(provider);
    create.mockResolvedValue(chatCompletion('still not json'));

    await expect(
      provider.completeStructured({
        model: 'test-model',
        schema,
        schemaName: 'Verdict',
        messages: [{ role: 'user', content: 'go' }],
        maxRetries: 1,
      }),
    ).rejects.toThrow(/failed schema validation/);
    expect(create).toHaveBeenCalledTimes(2); // 1 initial attempt + 1 retry
  });
});
