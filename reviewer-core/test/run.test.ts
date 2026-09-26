import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest, sliceDiff, type PromptAssembledInfo } from '../src/index.js';

/** 12-hex-char sha256 fingerprint — same shape as the server's `fingerprintText`
 *  (`platform/prompt-log.ts`), used here so verbose-mode telemetry tests exercise
 *  a REAL hasher, not a stub that could mask a text leak. */
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 12);

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
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
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

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
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

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
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
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
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });
});

/**
 * L03 — prompt telemetry (`promptTelemetry.onPrompt`). The core guarantee:
 * metadata only, never section text, in both `detail` modes, and never able
 * to break the review itself (swallowed try/catch, no effect on the LLM call).
 */
describe('reviewPullRequest — L03 prompt telemetry', () => {
  const cleanReview = { verdict: 'approve' as const, summary: 'Nothing to flag.', score: 100, findings: [] };

  it('summary/single-pass: exactly one scope:"run" record, no verbose-only fields', async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient().diff(); // 1 file → single-pass
    const infos: PromptAssembledInfo[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'gpt-4.1',
      diff,
      llm,
      promptTelemetry: { detail: 'summary', onPrompt: (i) => infos.push(i) },
    });

    expect(outcome.mode).toBe('single-pass');
    expect(infos).toHaveLength(1);
    expect(infos[0]!.scope).toBe('run');
    expect(infos[0]!.mode).toBe('single-pass');
    expect(infos[0]!.chunk_count).toBe(1);
    expect(infos[0]!.model).toBe('gpt-4.1');
    expect(infos[0]!.diff_files).toBeUndefined();
    expect(infos[0]!.chunk_label).toBeUndefined();
    expect(infos[0]!.sections.every((s) => s.fingerprint === undefined)).toBe(true);
  });

  const RAW_DIFF_2FILES = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 a
+one
 c
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,3 @@
 x
+two
 z`;

  it('verbose/map-reduce: one run record + one chunk record per file, fingerprints on every section', async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient({ diff: RAW_DIFF_2FILES }).diff();
    const infos: PromptAssembledInfo[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      strategy: 'map-reduce',
      promptTelemetry: { detail: 'verbose', onPrompt: (i) => infos.push(i), fingerprint: sha256 },
    });

    expect(outcome.mode).toBe('map-reduce');
    expect(infos).toHaveLength(3);
    expect(infos.map((i) => i.scope)).toEqual(['run', 'chunk', 'chunk']);
    expect(infos[1]!.chunk_index).toBe(0);
    expect(infos[2]!.chunk_index).toBe(1);
    expect(infos[1]!.chunk_label).toBe('src/a.ts');
    expect(infos[2]!.chunk_label).toBe('src/b.ts');
    // diff_files (run scope, verbose only) matches sliceDiff's per-file char
    // count — the exact computation the § Contract specifies for this field.
    expect(infos[0]!.diff_files).toEqual([
      { path: 'src/a.ts', chars: sliceDiff(diff, 'src/a.ts').length },
      { path: 'src/b.ts', chars: sliceDiff(diff, 'src/b.ts').length },
    ]);
    for (const info of infos) {
      for (const s of info.sections) {
        expect(s.fingerprint).toMatch(/^[0-9a-f]{12}$/);
      }
    }
  });

  it('verbose/single-pass: still exactly one scope:"run" record (no duplicate chunk record)', async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient().diff();
    const infos: PromptAssembledInfo[] = [];
    await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      promptTelemetry: { detail: 'verbose', onPrompt: (i) => infos.push(i), fingerprint: sha256 },
    });
    expect(infos).toHaveLength(1);
    expect(infos[0]!.scope).toBe('run');
  });

  const CANARIES = [
    'CANARY_DIFF_7f3a',
    'sk_live_CANARY9',
    'CANARY_PRDESC_1',
    'CANARY_INTENT_SUMMARY_2',
    'CANARY_INSCOPE_3',
    'CANARY_OUTSCOPE_4',
    'CANARY_SKILL_5',
    'CANARY_MEMORY_6',
    'CANARY_SPEC_7',
    'CANARY_CALLERS_8',
    'CANARY_REPOMAP_9',
    'CANARY_TASK_10',
  ];
  const CANARY_DIFF = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,2 +1,3 @@
 a
+CANARY_DIFF_7f3a sk_live_CANARY9
 c`;

  it.each(['summary', 'verbose'] as const)(
    'carries no canary text in %s-mode telemetry, across every canary-laden input',
    async (detail) => {
      const llm = new MockLLMProvider('openai', { structured: cleanReview });
      const diff = await new MockGitClient({ diff: CANARY_DIFF }).diff();
      const infos: PromptAssembledInfo[] = [];
      await reviewPullRequest({
        systemPrompt: 'sys',
        model: 'm',
        diff,
        llm,
        task: 'CANARY_TASK_10',
        prDescription: 'CANARY_PRDESC_1',
        intent: {
          summary: 'CANARY_INTENT_SUMMARY_2',
          inScope: ['CANARY_INSCOPE_3'],
          outOfScope: ['CANARY_OUTSCOPE_4'],
          confidence: 'high',
        },
        skills: ['CANARY_SKILL_5'],
        memory: ['CANARY_MEMORY_6'],
        specs: ['CANARY_SPEC_7'],
        callers: 'CANARY_CALLERS_8',
        repoMap: 'CANARY_REPOMAP_9',
        promptTelemetry: { detail, onPrompt: (i) => infos.push(i), fingerprint: sha256 },
      });

      const json = JSON.stringify(infos);
      for (const canary of CANARIES) {
        expect(json).not.toContain(canary);
      }
    },
  );

  it('a throwing onPrompt does not change the review outcome', async () => {
    const fixture = {
      verdict: 'request_changes' as const,
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL' as const,
          category: 'security' as const,
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding' as const,
        },
      ],
    };

    const baselineLlm = new MockLLMProvider('openai', { structured: fixture });
    const baselineDiff = await new MockGitClient().diff();
    const baseline = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff: baselineDiff,
      llm: baselineLlm,
      task: 'Review PR #1',
    });

    const throwLlm = new MockLLMProvider('openai', { structured: fixture });
    const throwDiff = await new MockGitClient().diff();
    const withThrow = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff: throwDiff,
      llm: throwLlm,
      task: 'Review PR #1',
      promptTelemetry: {
        detail: 'summary',
        onPrompt: () => {
          throw new Error('telemetry boom');
        },
      },
    });

    expect(withThrow.review.verdict).toBe(baseline.review.verdict);
    expect(withThrow.review.findings.length).toBe(baseline.review.findings.length);
  });

  it('promptTelemetry has no effect on what the mock LLM receives', async () => {
    const diff = await new MockGitClient().diff();

    const llmPlain = new MockLLMProvider('openai', { structured: cleanReview });
    await reviewPullRequest({ systemPrompt: 'sys', model: 'm', diff, llm: llmPlain, task: 'Review PR #2' });

    const llmTelemetry = new MockLLMProvider('openai', { structured: cleanReview });
    await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm: llmTelemetry,
      task: 'Review PR #2',
      promptTelemetry: { detail: 'verbose', onPrompt: () => undefined, fingerprint: sha256 },
    });

    const reqPlain = llmPlain.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: unknown;
    };
    const reqTelemetry = llmTelemetry.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: unknown;
    };
    expect(reqTelemetry.messages).toEqual(reqPlain.messages);
  });
});
