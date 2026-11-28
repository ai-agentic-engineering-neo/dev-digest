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
import { StructuredOutputError } from '@devdigest/reviewer-core';
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
    // No timeoutMs: the client's own default deadline applies.
    expect(options[0]).toEqual({ signal: controller.signal });
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

describe('AnthropicProvider repair turn', () => {
  it('answers the tool_use with an is_error tool_result carrying the repair text', async () => {
    const bodies: { messages: Anthropic.MessageParam[] }[] = [];
    const inputs: unknown[] = [{ wrong: 1 }, { answer: '42' }];
    const client = {
      messages: {
        create: async (body: { messages: Anthropic.MessageParam[] }) => {
          bodies.push({ messages: structuredClone(body.messages) });
          return {
            content: [{ type: 'tool_use', id: `t${bodies.length}`, name: 'Answer', input: inputs.shift() }],
            usage: { input_tokens: 10, output_tokens: 4 },
          };
        },
      },
    } as unknown as Anthropic;

    const res = await new AnthropicProvider('key', client).completeStructured({
      ...base,
      model: 'claude-sonnet-4',
    });

    expect(res.attempts).toBe(2);
    const second = bodies[1]?.messages ?? [];
    expect(second).toHaveLength(3);
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second[1]?.content).toEqual([expect.objectContaining({ type: 'tool_use', id: 't1' })]);
    expect(second[2]?.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 't1',
        is_error: true,
        content: expect.stringContaining('answer'),
      },
    ]);
  });
});

describe('default SDK clients', () => {
  // These replaced the withRetry/withTimeout wrappers: falling back to the SDK
  // defaults (10 min timeout) must fail here.
  it('are built with a 60 s timeout and 2 retries', () => {
    const openai = new OpenAIProvider('key')['client'];
    const anthropic = new AnthropicProvider('key')['client'];

    expect({ timeout: openai.timeout, maxRetries: openai.maxRetries }).toEqual({ timeout: 60_000, maxRetries: 2 });
    expect({ timeout: anthropic.timeout, maxRetries: anthropic.maxRetries }).toEqual({
      timeout: 60_000,
      maxRetries: 2,
    });
  });
});
