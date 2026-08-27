import { describe, it, expect } from 'vitest';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  ModelInfo,
  UnifiedDiff,
} from '@devdigest/shared';
import type { AgentRow, PullRow } from '../../db/rows.js';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from './repository.js';
import { ReviewRunExecutor } from './run-executor.js';
import { RunBus } from '../../platform/sse.js';

/**
 * specs/13-multi-agent-review.md Phase A1 — the ONE scoped change (D16):
 * `run-executor.ts`'s per-agent job loop runs concurrently
 * (`Promise.allSettled`) instead of sequentially. Planner finding 3 claims
 * AC-19/AC-20 (run isolation) hold "by construction" because `RunLogger.forRun`
 * returns a NEW instance and `RunBus` keys everything by `runId` — this file
 * PROVES that claim against the real executor, plus AC-16/AC-17/AC-18, rather
 * than re-asserting it.
 *
 *   AC-16 — a batch of N agents each taking ~T completes in ~T, not ~N×T.
 *   AC-17 — one agent's provider throwing does not stop every OTHER agent
 *           from persisting its own run/review/findings.
 *   AC-18 — the diff is loaded exactly ONCE for the whole batch, never once
 *           per agent.
 *   AC-20 — each run's own event buffer contains only its own agent's events
 *           alongside the shared pre-work events — no cross-run leakage.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A completeStructured-only fake LLM with a controllable artificial delay.
 * `src/adapters/mocks.ts`'s `MockLLMProvider` has no delay knob (confirmed by
 * reading it before writing this) — rather than widen a shared test adapter
 * for one timing-sensitive test, this file builds its own local fake, same
 * posture as `MockLLMProvider` (fixture-driven `completeStructured`, no real
 * network).
 */
class DelayedLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  calls: { method: string }[] = [];
  constructor(
    id: 'openai' | 'anthropic',
    private delayMs: number,
    private opts: { fail?: string } = {},
  ) {
    this.id = id;
  }
  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'mock-model', provider: this.id }];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return { text: 'mock completion', model: req.model, tokensIn: 10, tokensOut: 10, costUsd: 0.001 };
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured' });
    await sleep(this.delayMs);
    if (this.opts.fail) throw new Error(this.opts.fail);
    const fixture = { verdict: 'approve', summary: 'ok', score: 90, findings: [] };
    const parsed = (req.schema as { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { message: string } } }).safeParse(
      fixture,
    );
    if (!parsed.success) throw new Error(`fixture failed schema: ${parsed.error?.message}`);
    return {
      data: parsed.data as T,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

const DIFF: UnifiedDiff = {
  raw: 'diff --git a/a.ts b/a.ts\n@@ -1 +1,2 @@\n+const x = 1;\n',
  files: [
    {
      path: 'a.ts',
      additions: 1,
      deletions: 0,
      hunks: [{ header: '@@ -1 +1,2 @@', newStart: 1, newLines: 2, lines: ['+const x = 1;'] }],
    },
  ],
} as unknown as UnifiedDiff;

const PULL = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Tidy up',
  author: 'octocat',
  base: 'main',
  headSha: 'deadbee',
  body: null,
} as unknown as PullRow;

const REPO_ROW = { owner: 'acme', name: 'api' } as never;

function agentRow(id: string, name: string, provider: string): AgentRow {
  return {
    id,
    name,
    provider,
    model: 'mock-model',
    systemPrompt: `You are ${name}.`,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    // repo-intel enrichment is entirely orthogonal to D16 (concurrency) — off
    // here so this test's mocks stay minimal (no repoIntel facade needed).
    repoIntel: false,
    version: 1,
  } as unknown as AgentRow;
}

type Persisted = {
  review: unknown;
  findings: unknown[];
  completed: (Record<string, unknown> & { status: string }) | null;
  trace: unknown;
};

/**
 * Real `ReviewRunExecutor`, a fake repo recording every per-run persistence
 * call keyed by `runId`, and a `container.git.diff` call counter (AC-18).
 * `providers` maps agent.provider -> the LLM instance that provider resolves
 * to — lets one batch mix a slow-but-succeeding provider with a
 * fails-immediately one (AC-17).
 */
function buildHarness(providers: Record<string, LLMProvider>) {
  const runBus = new RunBus();
  const gitDiffCalls: unknown[] = [];
  const container = {
    runBus,
    git: {
      diff: async (...args: unknown[]) => {
        gitDiffCalls.push(args);
        return DIFF;
      },
    },
    llm: async (provider: string) => {
      const p = providers[provider];
      if (!p) throw new Error(`no mock provider configured for "${provider}"`);
      return p;
    },
    tokenizer: { count: (t: string) => t.length },
    // specs/09 — nothing attached in this harness; irrelevant to D16.
    projectContextService: { resolveForRun: async () => ({ documents: [], entries: [] }) },
    // L03 — resolved once per BATCH (shared pre-work, before the concurrent
    // loop) — this test asserts the LOOP's concurrency, not intent
    // resolution, so a trivial no-op stub is enough.
    intentService: {
      resolve: async () => ({
        rendered: undefined,
        inScope: undefined,
        outOfScope: undefined,
        provider: null,
        model: null,
        userMessageText: undefined,
        contextGaps: [],
      }),
    },
  } as unknown as Container;

  const persisted = new Map<string, Persisted>();
  const forRun = (runId: string): Persisted => {
    let p = persisted.get(runId);
    if (!p) {
      p = { review: null, findings: [], completed: null, trace: null };
      persisted.set(runId, p);
    }
    return p;
  };

  const repo = {
    insertReview: async (input: { runId: string } & Record<string, unknown>) => {
      const review = { id: `review-${input.runId}`, ...input };
      forRun(input.runId).review = review;
      return review;
    },
    insertFindings: async (_reviewId: string, findings: unknown[]) => findings,
    markReviewed: async () => undefined,
    completeAgentRun: async (runId: string, input: Record<string, unknown> & { status: string }) => {
      forRun(runId).completed = input;
    },
    saveRunTrace: async (runId: string, trace: unknown) => {
      forRun(runId).trace = trace;
    },
    recordRunSkills: async () => undefined,
  } as unknown as ReviewRepository;

  const agents = { enabledSkills: async () => [] } as unknown as Container['agentsRepo'];

  const executor = new ReviewRunExecutor(container, repo, agents);
  return { executor, runBus, gitDiffCalls, persisted };
}

describe('ReviewRunExecutor.executeRuns — concurrency (Phase A1, D16)', () => {
  it('AC-16: a batch of N agents each taking ~T completes the batch in ~T, not ~N×T', async () => {
    const DELAY_MS = 150;
    const N = 4;
    const provider = new DelayedLLMProvider('openai', DELAY_MS);
    const { executor } = buildHarness({ openai: provider });

    const jobs = Array.from({ length: N }, (_, i) => ({
      agent: agentRow(`agent-${i}`, `Agent ${i}`, 'openai'),
      runId: `run-${i}`,
    }));

    const start = Date.now();
    await executor.executeRuns('ws1', PULL, REPO_ROW, jobs);
    const elapsed = Date.now() - start;

    // Sequential would take ~N * DELAY_MS (600ms); concurrent should land
    // close to one DELAY_MS. Generous bounds to stay stable under CI load:
    // well under half of the sequential total, and not suspiciously instant.
    expect(elapsed).toBeLessThan((N * DELAY_MS) / 2);
    expect(elapsed).toBeGreaterThanOrEqual(DELAY_MS * 0.7);
    expect(provider.calls).toHaveLength(N);
  });

  it('AC-18: the diff is loaded exactly ONCE for a batch of N agents, never once per agent', async () => {
    const provider = new DelayedLLMProvider('openai', 5);
    const { executor, gitDiffCalls } = buildHarness({ openai: provider });

    const jobs = Array.from({ length: 5 }, (_, i) => ({
      agent: agentRow(`agent-${i}`, `Agent ${i}`, 'openai'),
      runId: `run-${i}`,
    }));

    await executor.executeRuns('ws1', PULL, REPO_ROW, jobs);

    expect(gitDiffCalls).toHaveLength(1);
  });

  it('AC-17: one agent\'s provider throwing does not stop every OTHER agent from persisting its own run/review/findings', async () => {
    const goodProvider = new DelayedLLMProvider('openai', 20);
    const badProvider = new DelayedLLMProvider('anthropic', 5, { fail: 'Provider exploded' });
    const { executor, persisted } = buildHarness({ openai: goodProvider, anthropic: badProvider });

    const jobs = [
      { agent: agentRow('agent-a', 'Security Reviewer', 'openai'), runId: 'run-a' },
      { agent: agentRow('agent-b', 'Style Reviewer', 'openai'), runId: 'run-b' },
      { agent: agentRow('agent-c', 'Broken Reviewer', 'anthropic'), runId: 'run-c' },
    ];

    await executor.executeRuns('ws1', PULL, REPO_ROW, jobs);

    const runA = persisted.get('run-a')!;
    const runB = persisted.get('run-b')!;
    const runC = persisted.get('run-c')!;

    expect(runA.completed?.status).toBe('done');
    expect(runA.review).not.toBeNull();
    expect(runB.completed?.status).toBe('done');
    expect(runB.review).not.toBeNull();

    // The failing agent's own run is marked failed with its recorded reason —
    // and, unlike the two good runs, never reaches insertReview.
    expect(runC.completed?.status).toBe('failed');
    expect(runC.completed?.error).toContain('Provider exploded');
    expect(runC.review).toBeNull();
  });

  it('AC-20: each run\'s event buffer contains only its own agent\'s events alongside the shared pre-work events', async () => {
    const goodProvider = new DelayedLLMProvider('openai', 20);
    const badProvider = new DelayedLLMProvider('anthropic', 5, { fail: 'Provider exploded' });
    const { executor, runBus } = buildHarness({ openai: goodProvider, anthropic: badProvider });

    const jobs = [
      { agent: agentRow('agent-a', 'Security Reviewer', 'openai'), runId: 'run-a' },
      { agent: agentRow('agent-b', 'Style Reviewer', 'openai'), runId: 'run-b' },
      { agent: agentRow('agent-c', 'Broken Reviewer', 'anthropic'), runId: 'run-c' },
    ];

    await executor.executeRuns('ws1', PULL, REPO_ROW, jobs);

    const bufferA = runBus.buffer('run-a').map((e) => e.msg);
    const bufferB = runBus.buffer('run-b').map((e) => e.msg);
    const bufferC = runBus.buffer('run-c').map((e) => e.msg);

    // Shared pre-work (fanned out BEFORE the loop) reaches every run's buffer.
    for (const buffer of [bufferA, bufferB, bufferC]) {
      expect(buffer.some((msg) => msg.includes('Diff ready'))).toBe(true);
    }

    // Run A's own per-agent events mention ONLY Security Reviewer — never
    // Style Reviewer's or Broken Reviewer's name.
    expect(bufferA.some((msg) => msg.includes('Security Reviewer'))).toBe(true);
    expect(bufferA.some((msg) => msg.includes('Style Reviewer'))).toBe(false);
    expect(bufferA.some((msg) => msg.includes('Broken Reviewer'))).toBe(false);

    // Run B's own per-agent events mention ONLY Style Reviewer.
    expect(bufferB.some((msg) => msg.includes('Style Reviewer'))).toBe(true);
    expect(bufferB.some((msg) => msg.includes('Security Reviewer'))).toBe(false);
    expect(bufferB.some((msg) => msg.includes('Broken Reviewer'))).toBe(false);

    // Run C's own per-agent events (including its failure) mention ONLY
    // Broken Reviewer.
    expect(bufferC.some((msg) => msg.includes('Broken Reviewer'))).toBe(true);
    expect(bufferC.some((msg) => msg.includes('Security Reviewer'))).toBe(false);
    expect(bufferC.some((msg) => msg.includes('Style Reviewer'))).toBe(false);
  });
});
