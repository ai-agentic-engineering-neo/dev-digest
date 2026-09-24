import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { StubLLM } from './fixtures/llm.js';
import { configDiff, twoFileDiff as twoFiles } from './fixtures/diff.js';
import { reviewPullRequest, type PromptAssembledEvent } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses local stub LLM + pre-parsed diff fixtures so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the fixture diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new StubLLM({ data: fixture });
    const diff = configDiff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new StubLLM({ data: clean });
    const diff = configDiff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new StubLLM({ data: fixture });
    const diff = configDiff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = configDiff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  describe('onPrompt (safe structured logging sink)', () => {
    it('single-pass: fires once, with the assembled sections and chunkCount=1', async () => {
      const llm = new StubLLM({ data: fixture });
      const diff = configDiff();
      const events: PromptAssembledEvent[] = [];

      const outcome = await reviewPullRequest({
        systemPrompt: 'security reviewer',
        model: 'gpt-4.1',
        diff,
        llm,
        task: 'Review PR #482',
        onPrompt: (e) => events.push(e),
      });

      expect(outcome.mode).toBe('single-pass');
      expect(events).toHaveLength(1);
      expect(events[0]!.chunkIndex).toBe(0);
      expect(events[0]!.chunkCount).toBe(1);
      expect(events[0]!.mode).toBe('single-pass');
      expect(events[0]!.model).toBe('gpt-4.1');
      expect(events[0]!.sections.length).toBeGreaterThan(0);
      expect(events[0]!.sections.map((s) => s.name)).toContain('diff');
    });

    it('map-reduce over 2 files: fires once per chunk, chunkCount=2', async () => {
      const llm = new StubLLM({ data: fixture });
      const diff = twoFiles();
      const events: PromptAssembledEvent[] = [];

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff,
        llm,
        strategy: 'map-reduce',
        onPrompt: (e) => events.push(e),
      });

      expect(outcome.mode).toBe('map-reduce');
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.chunkCount === 2)).toBe(true);
      expect(events.map((e) => e.chunkIndex).sort()).toEqual([0, 1]);
    });

    it('a throwing onPrompt hook never breaks the review', async () => {
      const llm = new StubLLM({ data: fixture });
      const diff = configDiff();

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff,
        llm,
        onPrompt: () => {
          throw new Error('boom');
        },
      });

      expect(outcome.review).toBeDefined();
    });
  });

  describe('onUsage (per-response usage for failed/cancelled runs)', () => {
    // Two changed files + map-reduce ⇒ one LLM call per file.
    const twoFileDiff = async () => twoFiles();

    /** Fake provider: every call reports 100/50 tokens at $0.001 via onUsage,
     *  like a real one; from call `failFrom` on it throws AFTER reporting. */
    function usageLlm(failFrom = Infinity): LLMProvider {
      let n = 0;
      return {
        id: 'openrouter',
        async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
          req.onUsage?.({ tokensIn: 100, tokensOut: 50, costUsd: 0.001 });
          if (++n >= failFrom) throw new Error('structured output failed schema validation');
          return {
            data: fixture as unknown as T,
            model: req.model,
            tokensIn: 100,
            tokensOut: 50,
            costUsd: 0.001,
            raw: '',
            attempts: 1,
          };
        },
        async listModels() {
          return [];
        },
        async complete() {
          throw new Error('not used');
        },
        async embed() {
          return [];
        },
      };
    }

    it('forwards onUsage to every LLM call; the deltas sum to the outcome totals', async () => {
      const usage: { tokensIn: number; tokensOut: number; costUsd: number | null }[] = [];
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff: await twoFileDiff(),
        llm: usageLlm(),
        strategy: 'map-reduce',
        onUsage: (u) => usage.push(u),
      });
      expect(outcome.mode).toBe('map-reduce');
      expect(usage).toHaveLength(2);
      expect(usage.reduce((n, u) => n + u.tokensIn, 0)).toBe(outcome.tokensIn);
      expect(usage.reduce((n, u) => n + u.tokensOut, 0)).toBe(outcome.tokensOut);
      expect(usage.reduce((n, u) => n + (u.costUsd ?? 0), 0)).toBeCloseTo(outcome.costUsd!);
    });

    it('map-reduce: chunk 2 throws → chunk 1 usage was still reported', async () => {
      const usage: number[] = [];
      await expect(
        reviewPullRequest({
          systemPrompt: 's',
          model: 'm',
          diff: await twoFileDiff(),
          llm: usageLlm(2),
          strategy: 'map-reduce',
          onUsage: (u) => usage.push(u.tokensIn),
        }),
      ).rejects.toThrow('schema validation');
      // chunk 1 (ok) + chunk 2 (spent, then failed)
      expect(usage).toEqual([100, 100]);
    });
  });
});
