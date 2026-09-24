import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { LLMProvider, StructuredRequest } from '@devdigest/shared';
import { StubLLM } from './fixtures/llm.js';
import { configDiff } from './fixtures/diff.js';
import { OpenRouterProvider, reviewPullRequest } from '../src/index.js';

/** A caller's AbortSignal (run cancel) must reach every LLM SDK call. */
describe('AbortSignal threading', () => {
  it('reviewPullRequest forwards input.signal to every completeStructured call', async () => {
    const inner = new StubLLM({ data: { verdict: 'approve', summary: 's', score: 100, findings: [] } });
    const seen: (AbortSignal | undefined)[] = [];
    const llm: LLMProvider = {
      id: 'openai',
      listModels: () => inner.listModels(),
      complete: (r) => inner.complete(r),
      embed: (x) => inner.embed(x),
      completeStructured: <T>(req: StructuredRequest<T>) => {
        seen.push(req.signal);
        return inner.completeStructured(req);
      },
    };
    const controller = new AbortController();
    await reviewPullRequest({
      systemPrompt: 's',
      model: 'gpt-4.1',
      diff: configDiff(),
      llm,
      signal: controller.signal,
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === controller.signal)).toBe(true);
  });

  it('OpenRouterProvider passes the signal as the SDK request option', async () => {
    const p = new OpenRouterProvider('k');
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    const controller = new AbortController();
    await p.completeStructured({
      model: 'm',
      schema: z.object({ ok: z.boolean() }),
      schemaName: 'Ok',
      messages: [{ role: 'user', content: 'x' }],
      signal: controller.signal,
    });
    // The SDK gets ONE signal combining the caller's cancel and the call budget.
    const passed = (create.mock.calls[0]![1] as { signal: AbortSignal }).signal;
    expect(passed).toBeInstanceOf(AbortSignal);
    expect(passed.aborted).toBe(false);
    controller.abort();
    expect(passed.aborted).toBe(true);
  });
});
