import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest, sliceDiff, numberDiff, type PromptAssembledInfo } from '../src/index.js';

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
    // diff_files (run scope, verbose only) measures the NUMBERED text that
    // actually reaches the LLM (L03 § Contract "the verbose telemetry
    // diffFiles[].chars measures the numbered text") — not the raw slice.
    // Each file's slice is 7 lines (diff --git/---/+++/@@/3 body lines), each
    // gutter is a fixed 7 chars, so numbering adds exactly 7*7 = 49 chars.
    expect(infos[0]!.diff_files).toEqual([
      { path: 'src/a.ts', chars: numberDiff(sliceDiff(diff, 'src/a.ts')).length },
      { path: 'src/b.ts', chars: numberDiff(sliceDiff(diff, 'src/b.ts')).length },
    ]);
    expect(infos[0]!.diff_files![0]!.chars).toBe(sliceDiff(diff, 'src/a.ts').length + 49);
    // sliceDiff itself stays gutter-free — only the prompt-bound copy is numbered.
    expect(sliceDiff(diff, 'src/a.ts').startsWith('diff --git a/src/a.ts')).toBe(true);
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

/**
 * L03 — the diff the LLM actually sees is numbered (AC-6), in both single-pass
 * and map-reduce, and the trusted line-number rule sits before the untrusted
 * diff wrapper. Oracle: spec § Contract "Prompt" + plan Test brief WP3.tests.
 */
describe('reviewPullRequest — numbered diff reaches the LLM (L03)', () => {
  const B = ' '.repeat(7);
  const G = (n: number) => String(n).padStart(6) + ' ';
  const cleanReview = { verdict: 'approve' as const, summary: 'ok', score: 100, findings: [] };

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

  function messageOf(call: { method: string; req: unknown }): string {
    return (call.req as { messages: { content: string }[] }).messages[1]!.content;
  }

  it('single-pass: the one user message carries numbered gutters, never the raw diff line', async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient({ diff: RAW_DIFF_2FILES }).diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      task: 'Review PR #9',
    });

    expect(outcome.mode).toBe('single-pass');
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const user = messageOf(calls[0]!);

    expect(user).toContain(G(2) + '+one');
    expect(user).toContain(G(2) + '+two');
    expect(user).toContain(B + '@@ -1,2 +1,3 @@');
    expect(user.split('\n')).not.toContain('+one');
    expect(outcome.assembly.user).toBe(user);
  });

  it('map-reduce: each chunk is numbered against its own file, not the neighbour\'s', async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient({ diff: RAW_DIFF_2FILES }).diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      strategy: 'map-reduce',
      task: 'Review PR #9',
    });

    expect(outcome.mode).toBe('map-reduce');
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(2);
    const user0 = messageOf(calls[0]!);
    const user1 = messageOf(calls[1]!);

    expect(user0).toContain(G(1) + ' a');
    expect(user0).toContain(G(2) + '+one');
    expect(user0).not.toContain('+two');
    expect(user1).toContain(G(2) + '+two');
    expect(user1).not.toContain('+one');
    expect(outcome.assembly.user).toContain('+one');
    expect(outcome.assembly.user).toContain('+two');
  });

  it('the line-number rule sits before the untrusted diff wrapper, in single-pass AND map-reduce', async () => {
    const diff = await new MockGitClient({ diff: RAW_DIFF_2FILES }).diff();

    const llmSingle = new MockLLMProvider('openai', { structured: cleanReview });
    await reviewPullRequest({ systemPrompt: 'sys', model: 'm', diff, llm: llmSingle, task: 'x' });

    const llmMap = new MockLLMProvider('openai', { structured: cleanReview });
    await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm: llmMap,
      strategy: 'map-reduce',
      task: 'x',
    });

    for (const llm of [llmSingle, llmMap]) {
      for (const call of llm.calls.filter((c) => c.method === 'completeStructured')) {
        const user = messageOf(call);
        const ruleIdx = user.indexOf('Never count lines from the @@ hunk header');
        const wrapperIdx = user.indexOf('<untrusted source="diff">');
        expect(ruleIdx).toBeGreaterThan(-1);
        expect(ruleIdx).toBeLessThan(wrapperIdx);
      }
    }
  });
});

/**
 * WP2.tests / AC-11 (AM-1) — map-reduce over the WP1 golden fixture. A file
 * whose hunks carry no new-side lines (here, the deleted `gone.ts`) gets no
 * map-reduce chunk and no LLM call, and doesn't count towards the auto-mode
 * size threshold — because no line of it could ever ground a finding. Oracle:
 * plan-amendments.md AM-1 + AC-11 (4 calls, not 5; per-file line counts from
 * the plan's own hunk-math walkthrough, not from running the engine).
 */
describe('reviewPullRequest — map-reduce on the WP1 golden fixture (AM-1 / AC-11)', () => {
  const GOLDEN_DIFF = [
    'diff --git a/x.ts b/x.ts',
    'index 1111111..2222222 100644',
    '--- a/x.ts',
    '+++ b/x.ts',
    '@@ -1 +1,3 @@',
    ' a',
    '+++ i',
    '+b',
    'diff --git a/y.ts b/y.ts',
    'index 3333333..4444444 100644',
    '--- a/y.ts',
    '+++ b/y.ts',
    '@@ -1,2 +1 @@',
    '--- old comment',
    ' keep',
    'diff --git "a/\\321\\204.ts" "b/\\321\\204.ts"',
    'index 5555555..6666666 100644',
    '--- "a/\\321\\204.ts"',
    '+++ "b/\\321\\204.ts"',
    '@@ -1 +1,2 @@',
    ' z',
    '+w',
    'diff --git a/sub/b/x.ts b/sub/b/x.ts',
    'index 7777777..8888888 100644',
    '--- a/sub/b/x.ts',
    '+++ b/sub/b/x.ts',
    '@@ -1 +1,2 @@',
    ' s',
    '+t',
    'diff --git a/gone.ts b/gone.ts',
    'deleted file mode 100644',
    'index 9999999..0000000 100644',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-g1',
    '-g2',
  ].join('\n');
  const cleanReview = { verdict: 'approve' as const, summary: 'ok', score: 100, findings: [] };

  function userMessages(llm: MockLLMProvider): string[] {
    return llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => (c.req as { messages: { content: string }[] }).messages[1]!.content);
  }

  it('AC-11: makes one completeStructured call per file except the deleted gone.ts (4, not 5)', async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient({ diff: GOLDEN_DIFF }).diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      strategy: 'map-reduce',
    });

    expect(outcome.mode).toBe('map-reduce');
    expect(outcome.chunks.map((c) => c.label).sort()).toEqual(
      ['x.ts', 'y.ts', 'sub/b/x.ts', 'ф.ts'].sort(),
    );
    expect(outcome.chunks.map((c) => c.label)).not.toContain('gone.ts');
    const messages = userMessages(llm);
    expect(messages).toHaveLength(4);
  });

  it("AC-11: x.ts's chunk carries its own numbered content and not sub/b/x.ts's", async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient({ diff: GOLDEN_DIFF }).diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      strategy: 'map-reduce',
    });

    const xIndex = outcome.chunks.findIndex((c) => c.label === 'x.ts');
    const xMessage = userMessages(llm)[xIndex]!;
    expect(xMessage).toContain('     3 +b');
    expect(xMessage).not.toContain('+t');
  });

  it('AC-11: no chunk user message contains the deleted gone.ts content ("-g1")', async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient({ diff: GOLDEN_DIFF }).diff();

    await reviewPullRequest({ systemPrompt: 'sys', model: 'm', diff, llm, strategy: 'map-reduce' });

    for (const message of userMessages(llm)) {
      expect(message).not.toContain('-g1');
    }
  });

  it("AC-11: the auto-mode size threshold excludes gone.ts's lines, so a threshold above the other 4 files' total (5) but below the fixture's real total (7) stays single-pass", async () => {
    const llm = new MockLLMProvider('openai', { structured: cleanReview });
    const diff = await new MockGitClient({ diff: GOLDEN_DIFF }).diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      strategy: 'auto',
      mapThresholdLines: 6,
    });

    // x.ts(2) + y.ts(1) + ф.ts(1) + sub/b/x.ts(1) = 5, not > 6 → single-pass.
    // Only if gone.ts's 2 deletions were (wrongly) counted would the total (7)
    // exceed the threshold and flip this to map-reduce.
    expect(outcome.mode).toBe('single-pass');
  });
});
