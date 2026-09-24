import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import type { LlmUsage } from '@devdigest/shared';
import { OpenRouterProvider, supportsTemperature, type OpenRouterProviderOptions } from '../src/index.js';

const Schema = z.object({ ok: z.boolean() });
const ok = { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
const req = {
  model: 'deepseek/deepseek-v4-flash',
  schema: Schema,
  schemaName: 'Ok',
  messages: [{ role: 'user' as const, content: 'hello world' }],
  maxRetries: 2,
};

function withCreate(create: ReturnType<typeof vi.fn>, opts: OpenRouterProviderOptions = {}) {
  const p = new OpenRouterProvider('k', opts);
  (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
  return p;
}

/** A create() that hangs until its signal aborts (what the real SDK does). */
function hangingCreate() {
  return vi.fn((_body: unknown, o: { signal: AbortSignal }) => {
    return new Promise((_res, rej) => {
      o.signal.addEventListener('abort', () => rej(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' })));
    });
  });
}

describe('OpenRouterProvider — total call budget', () => {
  it('rejects with a budget error once the total deadline elapses (SDK retries share it)', async () => {
    const create = hangingCreate();
    const p = withCreate(create, { totalTimeoutMs: 30 });
    await expect(p.completeStructured(req)).rejects.toThrow(/exceeded its total budget of 30ms/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('the per-request SDK timeout never exceeds the remaining budget', async () => {
    const create = vi.fn().mockResolvedValue(ok);
    const p = withCreate(create, { timeoutMs: 90_000, totalTimeoutMs: 5_000 });
    await p.completeStructured(req);
    const o = create.mock.calls[0]![1] as { timeout: number };
    expect(o.timeout).toBeLessThanOrEqual(5_000);
    expect(o.timeout).toBeGreaterThan(0);
  });

  it('the caller signal aborts the in-flight call and surfaces the abort (not a budget error)', async () => {
    const create = hangingCreate();
    const p = withCreate(create, { totalTimeoutMs: 60_000 });
    const c = new AbortController();
    const pending = p.completeStructured({ ...req, signal: c.signal });
    c.abort();
    await expect(pending).rejects.toThrow(/aborted/i);
    await expect(pending).rejects.not.toThrow(/budget/);
  });

  it('an already-aborted caller signal makes no SDK call at all', async () => {
    const create = vi.fn().mockResolvedValue(ok);
    const p = withCreate(create);
    const c = new AbortController();
    c.abort();
    await expect(p.completeStructured({ ...req, signal: c.signal })).rejects.toThrow(/abort/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not start another reprompt attempt once the budget is spent', async () => {
    let t = 0;
    const create = vi.fn(async () => {
      t += 100;
      return { choices: [{ message: { content: 'nope' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    });
    const p = withCreate(create, { totalTimeoutMs: 150, now: () => t });
    await expect(p.completeStructured(req)).rejects.toThrow(/budget/);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('OpenRouterProvider — diagnosable final error', () => {
  it('includes the last Zod issues and a truncated raw snippet', async () => {
    const big = JSON.stringify({ ok: 'yes', pad: 'x'.repeat(5_000) });
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: big } }], usage: ok.usage });
    const p = withCreate(create);
    const err = await p.completeStructured(req).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain('schema validation for Ok after 3 attempt(s)');
    expect(msg).toContain('- ok:');
    expect(msg).toContain('{"ok":"yes"');
    expect(msg.length).toBeLessThan(1_500);
    expect(msg).toMatch(/…/);
  });
});

describe('OpenRouterProvider — missing usage is not silently zero', () => {
  it('estimates tokens from text length, prices the estimate, and warns', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] });
    const warnings: string[] = [];
    const p = withCreate(create, { estimateCost: (_m, i, o) => (i + o) / 1000, onWarning: (w) => warnings.push(w) });
    const seen: LlmUsage[] = [];
    const res = await p.completeStructured({ ...req, onUsage: (u) => seen.push(u) });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.tokensIn).toBeGreaterThan(0);
    expect(seen[0]!.tokensOut).toBeGreaterThan(0);
    expect(res.tokensIn).toBe(seen[0]!.tokensIn);
    expect(res.costUsd).toBeCloseTo((seen[0]!.tokensIn + seen[0]!.tokensOut) / 1000);
    expect(warnings.join()).toMatch(/no usage.*estimated/i);
  });

  it('no estimator → cost is unknown (null), never a fake 0', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] });
    const p = withCreate(create);
    const res = await p.completeStructured(req);
    expect(res.costUsd).toBeNull();
  });
});

describe('OpenRouterProvider — temperature', () => {
  it('omits temperature when the caller does not set one', async () => {
    const create = vi.fn().mockResolvedValue(ok);
    await withCreate(create).completeStructured(req);
    expect(create.mock.calls[0]![0]).not.toHaveProperty('temperature');
  });
  it('sends an explicit temperature for regular models', async () => {
    const create = vi.fn().mockResolvedValue(ok);
    await withCreate(create).completeStructured({ ...req, temperature: 0 });
    expect(create.mock.calls[0]![0]).toHaveProperty('temperature', 0);
  });
  it('never sends temperature to reasoning models', async () => {
    const create = vi.fn().mockResolvedValue(ok);
    await withCreate(create).completeStructured({ ...req, model: 'openai/o3-mini', temperature: 0 });
    expect(create.mock.calls[0]![0]).not.toHaveProperty('temperature');
  });
  it.each([
    ['o1', false],
    ['openai/o3-mini', false],
    ['o4-mini', false],
    ['gpt-5', false],
    ['openai/gpt-5.1-mini', false],
    ['deepseek/deepseek-reasoner', false],
    ['deepseek/deepseek-r1', false],
    ['gpt-4.1', true],
    ['deepseek/deepseek-v4-flash', true],
    ['anthropic/claude-sonnet-5', true],
  ])('supportsTemperature(%s) = %s', (m, expected) => {
    expect(supportsTemperature(m)).toBe(expected);
  });
});

describe('OpenRouterProvider.listModels', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('bounds the /models fetch with a timeout signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await new OpenRouterProvider('k').listModels();
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});
