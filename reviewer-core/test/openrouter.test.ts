/**
 * OpenRouterProvider against a fake OpenAI client: the request carries the
 * caller's abort signal and deadline as SDK request options, and output that
 * never validates throws a StructuredOutputError with every attempt's usage.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import { StructuredOutputError } from '@devdigest/shared';
import { OpenRouterProvider } from '../src/index.js';

const Schema = z.object({ answer: z.string() });

function fakeClient(contents: string[]) {
  const calls: { body: unknown; options: unknown }[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: unknown, options: unknown) => {
          calls.push({ body, options });
          const content = contents[Math.min(calls.length - 1, contents.length - 1)];
          return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.5 },
          };
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, calls };
}

const base = {
  model: 'm',
  schema: Schema,
  schemaName: 'Answer',
  messages: [{ role: 'user' as const, content: 'q' }],
};

describe('OpenRouterProvider.completeStructured', () => {
  it('passes the abort signal and deadline to the SDK request', async () => {
    const { client, calls } = fakeClient(['{"answer":"42"}']);
    const provider = new OpenRouterProvider('key', { client });
    const controller = new AbortController();

    const res = await provider.completeStructured({ ...base, signal: controller.signal, timeoutMs: 1234 });

    expect(res.data).toEqual({ answer: '42' });
    expect(calls[0]!.options).toEqual({ signal: controller.signal, timeout: 1234 });
  });

  it('a schema failure on every attempt throws with the accumulated usage and raw output', async () => {
    const { client, calls } = fakeClient(['not json']);
    const provider = new OpenRouterProvider('key', { client });

    const err = await provider.completeStructured({ ...base, maxRetries: 1 }).catch((e: unknown) => e);

    expect(calls).toHaveLength(2);
    expect(err).toBeInstanceOf(StructuredOutputError);
    const failed = err as StructuredOutputError;
    expect(failed.usage).toEqual({ tokensIn: 20, tokensOut: 8, costUsd: 1 });
    expect(failed.raw).toBe('not json');
    expect(failed.attempts).toBe(2);
  });
});
