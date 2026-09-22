import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { CallBudgetExceededError } from '@devdigest/reviewer-core';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

/**
 * Server LLM adapters (OpenAI / Anthropic): one wall-clock budget per
 * structured call covering SDK retries AND schema reprompts, a response without
 * `usage` is estimated (~4 chars/token) with a warning instead of booked as 0,
 * and the final schema failure carries the last issues + truncated raw output.
 * The SDK clients are swapped for scripted fakes.
 */
const Ok = z.object({ ok: z.boolean() });
const baseReq = {
  model: 'gpt-4.1',
  schema: Ok,
  schemaName: 'Ok',
  messages: [{ role: 'user' as const, content: 'x'.repeat(400) }],
};

type Create = (body: unknown, opts: { signal?: AbortSignal; timeout?: number }) => Promise<unknown>;

/** A fake SDK call that never answers on its own — it rejects only when its signal aborts. */
const hangingCreate: Create = (_body, opts) =>
  new Promise((_, reject) => {
    const signal = opts.signal!;
    const fail = () => reject(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' }));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });

function openai(create: Create, opts: ConstructorParameters<typeof OpenAIProvider>[1] = {}) {
  const p = new OpenAIProvider('k', opts);
  (p as unknown as { client: unknown }).client = { chat: { completions: { create: vi.fn(create) } } };
  return p;
}

function anthropic(create: Create, opts: ConstructorParameters<typeof AnthropicProvider>[1] = {}) {
  const p = new AnthropicProvider('k', opts);
  (p as unknown as { client: unknown }).client = { messages: { create: vi.fn(create) } };
  return p;
}

const openaiText = (content: string, usage?: object) => async () => ({
  choices: [{ message: { content } }],
  ...(usage ? { usage } : {}),
});
const anthropicTool = (input: unknown, usage?: object) => async () => ({
  content: [{ type: 'tool_use', id: 't', name: 'Ok', input }],
  ...(usage ? { usage } : {}),
});

describe.each([
  ['OpenAI', openai, openaiText('{"ok":"nope"}', { prompt_tokens: 1, completion_tokens: 1 })],
  ['Anthropic', anthropic, anthropicTool({ ok: 'nope' }, { input_tokens: 1, output_tokens: 1 })],
] as const)('%s adapter', (_name, make, invalidAnswer) => {
  it('stops at the call budget even with many reprompts left (no unbounded retries × reprompts)', async () => {
    const p = make(hangingCreate, { totalTimeoutMs: 80 });
    const started = Date.now();
    await expect(p.completeStructured({ ...baseReq, maxRetries: 50 })).rejects.toBeInstanceOf(
      CallBudgetExceededError,
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('a caller abort mid-call rejects promptly and is not turned into a budget error', async () => {
    const p = make(hangingCreate, { totalTimeoutMs: 60_000 });
    const c = new AbortController();
    const call = p.completeStructured({ ...baseReq, signal: c.signal });
    setTimeout(() => c.abort(), 20);
    const err = await call.catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(CallBudgetExceededError);
    expect(String((err as Error).message)).toMatch(/abort/i);
  });

  it('the final schema failure reports the last issues and the (truncated) raw output', async () => {
    const p = make(invalidAnswer as Create);
    const err = (await p.completeStructured({ ...baseReq, maxRetries: 1 }).catch((e: unknown) => e)) as Error & {
      details?: { issues?: string; raw?: string; attempts?: number };
    };
    expect(err.message).toMatch(/after 2 attempt\(s\)/);
    expect(err.message).toContain('ok: Expected boolean');
    expect(err.message).toContain('"ok":"nope"');
    expect(err.details?.issues).toContain('ok: Expected boolean');
    expect(err.details?.attempts).toBe(2);
  });
});

describe('missing usage is estimated, not booked as 0', () => {
  it('OpenAI: estimates ~4 chars/token and warns', async () => {
    const warnings: string[] = [];
    const usage: Array<{ tokensIn: number; tokensOut: number }> = [];
    const p = openai(openaiText('{"ok":true}'), { onWarning: (m) => warnings.push(m) });
    const res = await p.completeStructured({ ...baseReq, onUsage: (u) => usage.push(u) });
    expect(res.tokensIn).toBe(100); // 400 chars of prompt
    expect(res.tokensOut).toBe(Math.ceil('{"ok":true}'.length / 4));
    expect(usage).toEqual([expect.objectContaining({ tokensIn: 100, tokensOut: res.tokensOut })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/no usage/);
  });

  it('Anthropic: estimates instead of crashing on a response without usage', async () => {
    const warnings: string[] = [];
    const p = anthropic(anthropicTool({ ok: true }), { onWarning: (m) => warnings.push(m) });
    const res = await p.completeStructured(baseReq);
    expect(res.data).toEqual({ ok: true });
    expect(res.tokensIn).toBe(100);
    expect(res.tokensOut).toBeGreaterThan(0);
    expect(warnings).toHaveLength(1);
  });

  it('OpenAI complete(): same estimate + warning', async () => {
    const warnings: string[] = [];
    const p = openai(openaiText('hello world!'), { onWarning: (m) => warnings.push(m) });
    const res = await p.complete({ model: 'gpt-4.1', messages: baseReq.messages });
    expect(res.tokensIn).toBe(100);
    expect(res.tokensOut).toBe(3);
    expect(warnings).toHaveLength(1);
  });
});
