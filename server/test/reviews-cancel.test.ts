/**
 * Run cancellation against in-memory ports (BE-2, BE-9): a cancel that arrives
 * while the model is still answering must stop the run — no review is saved and
 * the run stays `cancelled` — and it aborts the request in flight. A run whose
 * output never validates is `failed` with the usage it consumed. The happy path
 * saves one review through `saveReviewOutcome` and marks the commit reviewed.
 */
import { describe, it, expect } from 'vitest';
import type {
  Agent,
  LLMProvider,
  Review,
  RunTrace,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { StructuredOutputError } from '@devdigest/reviewer-core';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { ReviewOutcome, ReviewPull, ReviewStore, RunCompletion } from '../src/modules/reviews/ports.js';
import { RunBus } from '../src/platform/sse.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret.',
  score: 40,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

const agent: Agent = {
  id: 'agent-1',
  name: 'Sec',
  description: '',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'sec',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: false,
  skill_count: 0,
};

const pull: ReviewPull = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Add config',
  author: 'octocat',
  base: 'main',
  headSha: 'abc123',
  body: null,
};

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** An LLM that answers only when the test releases it. */
class SlowLLM implements Partial<LLMProvider> {
  readonly id = 'openai' as const;
  readonly called = deferred();
  readonly release = deferred();
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.called.resolve();
    await this.release.promise;
    return {
      data: req.schema.parse(REVIEW),
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.001,
      raw: JSON.stringify(REVIEW),
      attempts: 1,
    };
  }
}

/** An LLM that answers only when its request is aborted — and then rejects, like the SDK. */
class AbortableLLM implements Partial<LLMProvider> {
  readonly id = 'openai' as const;
  readonly called = deferred();
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.called.resolve();
    return new Promise((_, reject) => {
      req.signal?.addEventListener('abort', () => reject(new Error('Request was aborted.')));
    });
  }
}

/** An LLM whose output never validates. */
class InvalidOutputLLM implements Partial<LLMProvider> {
  readonly id = 'openai' as const;
  async completeStructured<T>(): Promise<StructuredResult<T>> {
    throw new StructuredOutputError(
      'structured output failed schema validation',
      { tokensIn: 300, tokensOut: 120, costUsd: 0.004 },
      '{"bad":true}',
      3,
    );
  }
}

function setup<L extends Partial<LLMProvider> = SlowLLM>(llm: L = new SlowLLM() as unknown as L) {
  const runs = new Map<string, { status: string; completion?: RunCompletion }>();
  const reviews: ReviewOutcome[] = [];
  const traces = new Map<string, unknown>();
  const exited = deferred();
  const marked: string[] = [];
  const save = { calls: 0 };

  const store: ReviewStore = {
    createAgentRun: async () => {
      const id = `run-${runs.size + 1}`;
      runs.set(id, { status: 'running' });
      return id;
    },
    getRunStatus: async (_ws, runId) => {
      const run = runs.get(runId);
      return run && { status: run.status };
    },
    cancelRunIfRunning: async (runId) => {
      const run = runs.get(runId);
      if (run?.status !== 'running') return false;
      run.status = 'cancelled';
      return true;
    },
    completeAgentRun: async (runId, values) => {
      const run = runs.get(runId);
      if (run?.status === 'running') Object.assign(run, { status: values.status, completion: values });
    },
    saveReviewOutcome: async (outcome) => {
      save.calls++;
      const run = runs.get(outcome.runId);
      if (run?.status !== 'running') return null;
      Object.assign(run, { status: 'done', completion: outcome.completion });
      reviews.push(outcome);
      traces.set(outcome.runId, outcome.trace);
      exited.resolve();
      return { reviewId: `review-${reviews.length}` };
    },
    saveRunTrace: async (runId, trace) => {
      traces.set(runId, trace);
      exited.resolve();
    },
    getRunTrace: async () => undefined,
    reviewsForPull: async () => [],
    deleteReview: async () => false,
    findingWorkspace: async () => undefined,
    setFindingAccepted: async () => undefined,
    setFindingDismissed: async () => undefined,
    activeRunsForPull: async () => [],
    listRunsForPull: async () => [],
    deleteAgentRun: async () => false,
  };

  const bus = new RunBus();
  const service = new ReviewService({
    store,
    pulls: {
      getById: async () => pull,
      filesAndCommits: async () => ({ files: [] }),
      markReviewed: async (id) => void marked.push(id),
    },
    repos: { getById: async () => ({ owner: 'acme', name: 'widgets' }) },
    agents: { listEnabled: async () => [agent], getById: async () => agent },
    llm: async () => llm as unknown as LLMProvider,
    git: { diff: async () => parseUnifiedDiff(DIFF) },
    parseDiff: parseUnifiedDiff,
    repoIntel: {
      getCallerSignatures: async () => [],
      getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }),
      getFileRank: async () => [],
    } as never,
    events: bus,
    skills: { effectiveSkills: async () => [] },
    tokens: { count: (s: string) => Math.ceil(s.length / 4) },
  });

  return { service, store, runs, reviews, traces, exited, marked, llm, bus, save };
}

describe('ReviewService run cancellation', () => {
  it('a cancel during the LLM call leaves the run cancelled with no review', async () => {
    const { service, runs, reviews, traces, exited, marked, llm, bus, save } = setup(new SlowLLM());

    const { runs: started } = await service.runReview('ws-1', pull.id, [agent]);
    const runId = started[0]!.run_id;

    await llm.called.promise;
    await service.cancelRun(runId);
    llm.release.resolve();
    await exited.promise;
    // The executor clears the flag in `finally`, just after the trace save.
    await new Promise((r) => setTimeout(r, 0));

    expect(runs.get(runId)?.status).toBe('cancelled');
    expect(reviews).toHaveLength(0);
    // Stopped by the executor's own check after the LLM, not by the store guard.
    expect(save.calls).toBe(0);
    expect(marked).toHaveLength(0);
    expect(traces.has(runId)).toBe(true); // the log-so-far survives
    expect(bus.isCancelled(runId)).toBe(false); // cleared when the run exited
  });

  it('without a cancel the run saves one review and marks the commit reviewed', async () => {
    const { service, runs, reviews, exited, marked, llm } = setup(new SlowLLM());

    const { runs: started } = await service.runReview('ws-1', pull.id, [agent]);
    const runId = started[0]!.run_id;

    llm.release.resolve();
    await exited.promise;
    // markReviewed runs after the save resolves; let the executor reach it.
    await new Promise((r) => setTimeout(r, 0));

    expect(runs.get(runId)?.status).toBe('done');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.findings).toHaveLength(1);
    expect(reviews[0]!.completion.findingsCount).toBe(1);
    expect(marked).toEqual([pull.id]);
  });

  it('a cancel aborts the LLM request in flight', async () => {
    const { service, runs, reviews, exited, llm, bus } = setup(new AbortableLLM());

    const { runs: started } = await service.runReview('ws-1', pull.id, [agent]);
    const runId = started[0]!.run_id;

    await llm.called.promise;
    await service.cancelRun(runId);
    // The LLM never answers on its own: only the abort lets the run exit.
    await exited.promise;
    await new Promise((r) => setTimeout(r, 0));

    expect(runs.get(runId)?.status).toBe('cancelled');
    expect(runs.get(runId)?.completion).toBeUndefined();
    expect(reviews).toHaveLength(0);
    expect(bus.isCancelled(runId)).toBe(false);
  });

  it('output that never validates fails the run and keeps its usage and cost', async () => {
    const { service, runs, traces, exited } = setup(new InvalidOutputLLM());

    const { runs: started } = await service.runReview('ws-1', pull.id, [agent]);
    const runId = started[0]!.run_id;
    await exited.promise;

    const run = runs.get(runId);
    expect(run?.status).toBe('failed');
    expect(run?.completion).toMatchObject({ tokensIn: 300, tokensOut: 120, costUsd: 0.004 });
    const trace = traces.get(runId) as RunTrace;
    expect(trace.stats).toMatchObject({ tokens_in: 300, tokens_out: 120, cost_usd: 0.004 });
    expect(trace.raw_output).toBe('{"bad":true}');
  });
});
