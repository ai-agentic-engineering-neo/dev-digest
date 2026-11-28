import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { StructuredOutputError } from '@devdigest/shared';
import { CONFIG_DIFF, stubLLM } from './stubs.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses a stub LLM and a fixed diff (test/stubs.ts) so we exercise
 * the real assemble → completeStructured → reduce → grounding pipeline with no
 * DB/SSE and no import from server/.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in CONFIG_DIFF) + one
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
    const llm = stubLLM(fixture);
    const diff = CONFIG_DIFF;

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

  it('a model-labelled secret_leak finding off the diff is dropped (no full-file exemption)', async () => {
    const leak = {
      verdict: 'request_changes',
      summary: 'secret',
      score: 10,
      findings: [{ ...fixture.findings[0]!, id: 'leak', start_line: 1, end_line: 1, kind: 'secret_leak' }],
    };
    const outcome = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: CONFIG_DIFF,
      llm: stubLLM(leak),
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.dropped[0]!.reason).toMatch(/do not intersect/);
    expect(outcome.review.score).toBe(100);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = stubLLM(clean);
    const diff = CONFIG_DIFF;

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
    const llm = stubLLM(fixture);
    const diff = CONFIG_DIFF;
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
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
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
    const diff = CONFIG_DIFF;
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  it('forwards the abort signal, and a failed chunk reports the usage of the chunks before it', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    let call = 0;
    const llm: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        signals.push(req.signal);
        call++;
        if (call === 2) {
          throw new StructuredOutputError('bad output', { tokensIn: 7, tokensOut: 3, costUsd: 0.02 }, 'oops', 3);
        }
        return {
          data: { verdict: 'approve', summary: 'ok', score: 100, findings: [] } as unknown as T,
          model: req.model,
          tokensIn: 100,
          tokensOut: 50,
          costUsd: 0.01,
          raw: '{"first":true}',
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
    const twoFiles = {
      raw: `${CONFIG_DIFF.raw}\ndiff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,2 @@\n a\n+b`,
      files: [
        ...CONFIG_DIFF.files,
        { path: 'src/b.ts', additions: 1, deletions: 0, hunks: [] },
      ],
    };
    const controller = new AbortController();

    const err = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: twoFiles,
      llm,
      strategy: 'map-reduce',
      signal: controller.signal,
    }).catch((e: unknown) => e);

    expect(signals).toEqual([controller.signal, controller.signal]);
    expect(err).toBeInstanceOf(StructuredOutputError);
    const failed = err as StructuredOutputError;
    expect(failed.usage.tokensIn).toBe(107);
    expect(failed.usage.tokensOut).toBe(53);
    expect(failed.usage.costUsd).toBeCloseTo(0.03);
    expect(failed.raw).toContain('oops');
  });
});
