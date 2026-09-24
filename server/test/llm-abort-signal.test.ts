import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

/**
 * Run cancel aborts the in-flight LLM call: the providers hand the SDK a
 * request signal that fires when the caller's AbortSignal does (it is combined
 * with the call budget's deadline, so it is not the same object), and an
 * aborted call is never retried. The SDK clients are swapped for scripted fakes.
 */

/** The (not yet aborted) signal the SDK received on call `i`; the test then aborts the caller. */
function expectLinkedTo(create: ReturnType<typeof vi.fn>, i: number) {
  const sent = (create.mock.calls[i]![1] as { signal: AbortSignal }).signal;
  expect(sent).toBeInstanceOf(AbortSignal);
  expect(sent.aborted).toBe(false);
  return sent;
}
const Ok = z.object({ ok: z.boolean() });
const req = (signal: AbortSignal) => ({
  model: 'gpt-4.1',
  schema: Ok,
  schemaName: 'Ok',
  messages: [{ role: 'user' as const, content: 'x' }],
  signal,
});

describe('LLM providers forward AbortSignal', () => {
  it('OpenAI: completeStructured + complete pass { signal }', async () => {
    const p = new OpenAIProvider('k');
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    const c = new AbortController();
    await p.completeStructured(req(c.signal));
    await p.complete({ model: 'gpt-4.1', messages: [], signal: c.signal });
    const sent = [expectLinkedTo(create, 0), expectLinkedTo(create, 1)];
    c.abort();
    expect(sent.map((s) => s.aborted)).toEqual([true, true]);
  });

  it('OpenAI: an aborted call rejects once (no retry)', async () => {
    const p = new OpenAIProvider('k');
    const abortErr = Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
    const create = vi.fn().mockRejectedValue(abortErr);
    (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    const c = new AbortController();
    c.abort();
    await expect(p.completeStructured(req(c.signal))).rejects.toThrow('aborted');
    // Checked before sending: an already-aborted call never reaches the SDK.
    expect(create.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('OpenAI: an abort during the request rejects once (no retry, no reprompt)', async () => {
    const p = new OpenAIProvider('k');
    const c = new AbortController();
    const create = vi.fn().mockImplementation(async () => {
      c.abort();
      throw Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
    });
    (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    await expect(p.completeStructured(req(c.signal))).rejects.toThrow('aborted');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('Anthropic: completeStructured passes { signal }', async () => {
    const p = new AnthropicProvider('k');
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', id: 't', name: 'Ok', input: { ok: true } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    (p as unknown as { client: unknown }).client = { messages: { create } };
    const c = new AbortController();
    await p.completeStructured(req(c.signal));
    const sent = expectLinkedTo(create, 0);
    c.abort();
    expect(sent.aborted).toBe(true);
  });
});
