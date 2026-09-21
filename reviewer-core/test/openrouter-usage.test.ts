import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { LlmUsage } from '@devdigest/shared';
import { OpenRouterProvider } from '../src/index.js';

/**
 * Per-attempt usage reporting (`StructuredRequest.onUsage`). The SDK client is
 * swapped for a scripted `create` so no network is touched.
 */
const Schema = z.object({ ok: z.boolean() });

function response(content: string, usage: { prompt_tokens: number; completion_tokens: number; cost?: number }) {
  return { choices: [{ message: { content } }], usage };
}

function providerWith(
  responses: unknown[],
  estimateCost?: (m: string, i: number, o: number) => number | null,
) {
  const p = new OpenRouterProvider('test-key', estimateCost ? { estimateCost } : {});
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
  return p;
}

const baseReq = {
  model: 'deepseek/deepseek-v4-flash',
  schema: Schema,
  schemaName: 'Ok',
  messages: [{ role: 'user' as const, content: 'x' }],
  maxRetries: 2,
};

describe('OpenRouterProvider onUsage', () => {
  it('1 invalid + 1 valid attempt → 2 per-attempt reports; result is their sum', async () => {
    const p = providerWith([
      response('not json', { prompt_tokens: 100, completion_tokens: 10, cost: 0.001 }),
      response('{"ok":true}', { prompt_tokens: 120, completion_tokens: 20, cost: 0.002 }),
    ]);
    const seen: LlmUsage[] = [];
    const res = await p.completeStructured({ ...baseReq, onUsage: (u) => seen.push(u) });
    expect(seen).toEqual([
      { tokensIn: 100, tokensOut: 10, costUsd: 0.001 },
      { tokensIn: 120, tokensOut: 20, costUsd: 0.002 },
    ]);
    expect(res.tokensIn).toBe(220);
    expect(res.tokensOut).toBe(30);
    expect(res.costUsd).toBeCloseTo(0.003);
  });

  it('all attempts invalid → every attempt reported, then throws', async () => {
    const bad = response('nope', { prompt_tokens: 50, completion_tokens: 5, cost: 0.0005 });
    const p = providerWith([bad, bad, bad]);
    const seen: LlmUsage[] = [];
    await expect(p.completeStructured({ ...baseReq, onUsage: (u) => seen.push(u) })).rejects.toThrow(
      'schema validation',
    );
    expect(seen).toHaveLength(3);
  });

  it('no usage.cost → falls back to the injected estimator per attempt', async () => {
    const p = providerWith(
      [response('{"ok":true}', { prompt_tokens: 1_000_000, completion_tokens: 0 })],
      (_m, i) => i / 1_000_000,
    );
    const seen: LlmUsage[] = [];
    const res = await p.completeStructured({ ...baseReq, onUsage: (u) => seen.push(u) });
    expect(seen[0]!.costUsd).toBe(1);
    expect(res.costUsd).toBe(1);
  });

  it('a throwing onUsage hook does not break the call', async () => {
    const p = providerWith([response('{"ok":true}', { prompt_tokens: 1, completion_tokens: 1, cost: 0 })]);
    const res = await p.completeStructured({
      ...baseReq,
      onUsage: () => {
        throw new Error('boom');
      },
    });
    expect(res.data).toEqual({ ok: true });
  });
});
