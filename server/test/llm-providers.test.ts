/**
 * The OpenAI and Anthropic providers against fake SDK clients (BE-9): the
 * caller's abort signal and deadline go to the SDK as request options (the SDK
 * owns timeout and retries), and output that never validates throws a
 * StructuredOutputError carrying every attempt's usage and the last raw output.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';
import { StructuredOutputError } from '@devdigest/shared';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

const Schema = z.object({ answer: z.string() });
const base = {
  model: 'gpt-4.1',
  schema: Schema,
  schemaName: 'Answer',
  messages: [{ role: 'user' as const, content: 'q' }],
};

function fakeOpenAI(content: string) {
  const options: unknown[] = [];
  const client = {
    chat: {
      completions: {
        create: async (_body: unknown, opts: unknown) => {
          options.push(opts);
          return { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 4 } };
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, options };
}

function fakeAnthropic(input: unknown) {
  const options: unknown[] = [];
  const client = {
    messages: {
      create: async (_body: unknown, opts: unknown) => {
        options.push(opts);
        return {
          content: [{ type: 'tool_use', id: 't1', name: 'Answer', input }],
          usage: { input_tokens: 10, output_tokens: 4 },
        };
      },
    },
  };
  return { client: client as unknown as Anthropic, options };
}

describe('OpenAIProvider.completeStructured', () => {
  it('passes the abort signal and deadline to the SDK request', async () => {
    const { client, options } = fakeOpenAI('{"answer":"42"}');
    const controller = new AbortController();

    const res = await new OpenAIProvider('key', client).completeStructured({
      ...base,
      signal: controller.signal,
      timeoutMs: 1234,
    });

    expect(res.data).toEqual({ answer: '42' });
    expect(options[0]).toEqual({ timeout: 1234, signal: controller.signal });
  });

  it('a schema failure on every attempt throws with the accumulated usage', async () => {
    const { client, options } = fakeOpenAI('{"wrong":1}');

    const err = await new OpenAIProvider('key', client)
      .completeStructured({ ...base, maxRetries: 1 })
      .catch((e: unknown) => e);

    expect(options).toHaveLength(2);
    expect(err).toBeInstanceOf(StructuredOutputError);
    const failed = err as StructuredOutputError;
    expect(failed.usage.tokensIn).toBe(20);
    expect(failed.usage.tokensOut).toBe(8);
    expect(failed.usage.costUsd).toBeGreaterThan(0);
    expect(failed.raw).toBe('{"wrong":1}');
  });
});

describe('AnthropicProvider.completeStructured', () => {
  it('passes the abort signal to the SDK request', async () => {
    const { client, options } = fakeAnthropic({ answer: '42' });
    const controller = new AbortController();

    const res = await new AnthropicProvider('key', client).completeStructured({
      ...base,
      model: 'claude-sonnet-4',
      signal: controller.signal,
    });

    expect(res.data).toEqual({ answer: '42' });
    expect(options[0]).toEqual({ timeout: 60_000, signal: controller.signal });
  });

  it('a schema failure on every attempt throws with the accumulated usage', async () => {
    const { client } = fakeAnthropic({ wrong: 1 });

    const err = await new AnthropicProvider('key', client)
      .completeStructured({ ...base, model: 'claude-sonnet-4', maxRetries: 1 })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StructuredOutputError);
    expect((err as StructuredOutputError).usage).toMatchObject({ tokensIn: 20, tokensOut: 8 });
    expect((err as StructuredOutputError).attempts).toBe(2);
  });
});
