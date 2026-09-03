import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { AGENT_CONCURRENCY, ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository, PullRow } from '../src/modules/reviews/repository.js';
import type { AgentRow } from '../src/db/rows.js';
import type * as schema from '../src/db/schema.js';

/**
 * Hermetic unit test — no Postgres. `ReviewRunExecutor` is constructed
 * directly with a hand-built `Container`/`ReviewRepository` stand-in covering
 * only the surface `executeRuns`/`runOneAgent` actually touch (see
 * server/CLAUDE.md "Mock the outside world" + TESTING.md). `repoIntel: false`
 * on every queued agent skips the repo-intel-gated digest builders, keeping
 * the fake container small.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "FAKE_SECRET_FOR_TESTING_ONLY",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 95,
  findings: [],
};

function fakePull(): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 482,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rl',
    base: 'main',
    headSha: 'a1b2c3d4',
    lastReviewedSha: null,
    additions: 1,
    deletions: 0,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
  } as PullRow;
}

function fakeRepoRow(): typeof schema.repos.$inferSelect {
  return {
    id: 'repo-1',
    workspaceId: 'ws-1',
    owner: 'acme',
    name: 'payments-api',
    fullName: 'acme/payments-api',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: new Date(),
  } as typeof schema.repos.$inferSelect;
}

function fakeAgent(id: string, name: string): AgentRow {
  return {
    id,
    workspaceId: 'ws-1',
    name,
    description: '',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'You are a reviewer.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    // Skips the repo-intel-gated digest builders so the fake container
    // doesn't need a `repoIntel` facade.
    repoIntel: false,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
  } as AgentRow;
}

function buildFakeRepo(getIntent: ReturnType<typeof vi.fn>) {
  return {
    getIntent,
    insertReview: vi.fn().mockResolvedValue({ id: 'review-1' }),
    insertFindings: vi.fn().mockResolvedValue([]),
    markReviewed: vi.fn().mockResolvedValue(undefined),
    completeAgentRun: vi.fn().mockResolvedValue(undefined),
    saveRunTrace: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReviewRepository;
}

function buildFakeContainer(llm: MockLLMProvider, runBus: RunBus): Container {
  const agentsRepoStub = {
    enabledSkillsForPrompt: vi.fn().mockResolvedValue([]),
    linkedSkills: vi.fn().mockResolvedValue([]),
  };
  return {
    runBus,
    git: new MockGitClient({ diff: DIFF }),
    llm: async () => llm,
    agentsRepo: agentsRepoStub,
    tokenizer: { count: vi.fn().mockReturnValue(0) },
    // The persist step now runs inside `db.transaction()` (insertReview →
    // insertFindings → markReviewed as one unit of work) — the fake `repo`
    // above is a full mock that ignores the `tx` handle it's given, so this
    // only needs to invoke the callback, not simulate real transactionality.
    db: { transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  } as unknown as Container;
}

/**
 * Same shape as `buildFakeContainer`, but accepts any `LLMProvider` (not just
 * `MockLLMProvider`) — needed for tests 7/9 below that inject a hand-written
 * provider or a distinguishable `db.transaction` fake.
 */
function buildContainerWithLLM(llm: LLMProvider, runBus: RunBus): Container {
  const agentsRepoStub = {
    enabledSkillsForPrompt: vi.fn().mockResolvedValue([]),
    linkedSkills: vi.fn().mockResolvedValue([]),
  };
  return {
    runBus,
    git: new MockGitClient({ diff: DIFF }),
    llm: async () => llm,
    agentsRepo: agentsRepoStub,
    tokenizer: { count: vi.fn().mockReturnValue(0) },
    db: { transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  } as unknown as Container;
}

describe('ReviewRunExecutor.executeRuns — intent digest hoisting', () => {
  it('loads the PR intent once per executeRuns() call, not once per queued agent', async () => {
    const getIntent = vi.fn().mockResolvedValue(undefined);
    const repo = buildFakeRepo(getIntent);
    const runBus = new RunBus();
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = buildFakeContainer(llm, runBus);
    const agentsRepo = container.agentsRepo;

    const executor = new ReviewRunExecutor(container, repo, agentsRepo);
    const jobs = [
      { agent: fakeAgent('agent-1', 'First Agent'), runId: 'run-1' },
      { agent: fakeAgent('agent-2', 'Second Agent'), runId: 'run-2' },
      { agent: fakeAgent('agent-3', 'Third Agent'), runId: 'run-3' },
    ];

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow(), jobs);

    expect(getIntent).toHaveBeenCalledTimes(1);
    // All three queued agents still completed (persisted a review each) —
    // the hoisted intent digest reached every run, it just wasn't refetched.
    expect(repo.insertReview).toHaveBeenCalledTimes(3);
  });
});

describe('ReviewRunExecutor.executeRuns — bounded concurrency (PQueue over AGENT_CONCURRENCY)', () => {
  it('completes N > AGENT_CONCURRENCY agents, isolating one failing agent from the rest', async () => {
    const getIntent = vi.fn().mockResolvedValue(undefined);
    const repo = buildFakeRepo(getIntent);
    const runBus = new RunBus();

    // sessionId is `${owner}/${name}#${number}:${agent.name}` (see runOneAgent) —
    // key off it to fail exactly one agent's LLM call, isolating that failure
    // from the other 5 which must still complete under the bounded queue.
    const FAILING_AGENT = 'Agent 3';
    const llm: LLMProvider = {
      id: 'openai',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        if (req.sessionId?.endsWith(`:${FAILING_AGENT}`)) {
          throw new Error('simulated provider failure');
        }
        return {
          data: REVIEW_FIXTURE as unknown as T,
          model: req.model,
          tokensIn: 10,
          tokensOut: 5,
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

    const container = buildContainerWithLLM(llm, runBus);
    const executor = new ReviewRunExecutor(container, repo, container.agentsRepo);

    const names = Array.from({ length: 6 }, (_, i) => `Agent ${i + 1}`);
    expect(names.length).toBeGreaterThan(AGENT_CONCURRENCY); // 6 > 4
    const jobs = names.map((name, i) => ({
      agent: fakeAgent(`agent-${i + 1}`, name),
      runId: `run-${i + 1}`,
    }));

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow(), jobs);

    // 5 of 6 agents succeeded — the one deliberately-failing agent didn't
    // prevent the others from completing under the bounded queue.
    expect(repo.insertReview).toHaveBeenCalledTimes(5);
    expect(repo.completeAgentRun).toHaveBeenCalledTimes(6);
    expect(repo.completeAgentRun).toHaveBeenCalledWith(
      'run-3', // Agent 3 → jobs[2] → run-3
      expect.objectContaining({ status: 'failed', error: 'simulated provider failure' }),
    );
  });
});

describe('ReviewRunExecutor.executeRuns — transaction failure aborts the unit of work', () => {
  it('a rejected insertFindings stops before markReviewed and marks the run failed', async () => {
    const getIntent = vi.fn().mockResolvedValue(undefined);
    const repo = {
      getIntent,
      insertReview: vi.fn().mockResolvedValue({ id: 'review-1' }),
      insertFindings: vi.fn().mockRejectedValue(new Error('boom')),
      markReviewed: vi.fn().mockResolvedValue(undefined),
      completeAgentRun: vi.fn().mockResolvedValue(undefined),
      saveRunTrace: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReviewRepository;
    const runBus = new RunBus();
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = buildFakeContainer(llm, runBus);

    const executor = new ReviewRunExecutor(container, repo, container.agentsRepo);
    const jobs = [{ agent: fakeAgent('agent-1', 'First Agent'), runId: 'run-1' }];

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow(), jobs);

    // insertReview → insertFindings → markReviewed run in sequence inside one
    // db.transaction(); insertFindings rejecting must stop the unit of work
    // before markReviewed is ever reached.
    expect(repo.insertReview).toHaveBeenCalledTimes(1);
    expect(repo.insertFindings).toHaveBeenCalledTimes(1);
    expect(repo.markReviewed).not.toHaveBeenCalled();

    expect(repo.completeAgentRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: null,
        findingsCount: 0,
        grounding: '0/0 passed',
        error: 'boom',
      }),
    );
  });
});

describe('ReviewRunExecutor.executeRuns — transaction handle propagation', () => {
  it('passes the tx handle from db.transaction() (not the pooled db) to insertReview/insertFindings/markReviewed', async () => {
    const SENTINEL_TX = { marker: 'tx' };
    const getIntent = vi.fn().mockResolvedValue(undefined);
    const repo = buildFakeRepo(getIntent);
    const runBus = new RunBus();
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = buildFakeContainer(llm, runBus);
    // Override the default `(fn) => fn({})` with a distinguishable sentinel so
    // we can assert the EXACT handle the repository methods receive.
    (container as unknown as { db: { transaction: unknown } }).db = {
      transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(SENTINEL_TX),
    };

    const executor = new ReviewRunExecutor(container, repo, container.agentsRepo);
    const pull = fakePull();
    const jobs = [{ agent: fakeAgent('agent-1', 'First Agent'), runId: 'run-1' }];

    await executor.executeRuns('ws-1', pull, fakeRepoRow(), jobs);

    expect(repo.insertReview).toHaveBeenCalledWith(expect.any(Object), SENTINEL_TX);
    expect(repo.insertFindings).toHaveBeenCalledWith('review-1', expect.any(Array), SENTINEL_TX);
    expect(repo.markReviewed).toHaveBeenCalledWith(pull.id, pull.headSha, SENTINEL_TX);
  });
});

describe('ReviewRunExecutor.executeRuns — empty jobs array', () => {
  it('resolves without throwing and never calls insertReview when there are no jobs', async () => {
    const getIntent = vi.fn().mockResolvedValue(undefined);
    const repo = buildFakeRepo(getIntent);
    const runBus = new RunBus();
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = buildFakeContainer(llm, runBus);
    const executor = new ReviewRunExecutor(container, repo, container.agentsRepo);

    await expect(
      executor.executeRuns('ws-1', fakePull(), fakeRepoRow(), []),
    ).resolves.toBeUndefined();
    expect(repo.insertReview).not.toHaveBeenCalled();
  });
});

describe('ReviewRunExecutor.executeRuns — PQueue concurrency bound is actually enforced', () => {
  it('never runs more than AGENT_CONCURRENCY agents at once', async () => {
    // The isolation test above (N > AGENT_CONCURRENCY completes, one failure
    // isolated) proves the queue doesn't deadlock or drop jobs — it does NOT
    // prove the queue is actually bounded, since an unbounded Promise.all
    // would pass that same assertion just as well. This test tracks peak
    // in-flight LLM calls directly.
    const getIntent = vi.fn().mockResolvedValue(undefined);
    const repo = buildFakeRepo(getIntent);
    const runBus = new RunBus();

    let inFlight = 0;
    let maxInFlight = 0;
    const tracking: LLMProvider = {
      id: 'openai',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return {
          data: REVIEW_FIXTURE as unknown as T,
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

    const container = buildContainerWithLLM(tracking, runBus);
    const executor = new ReviewRunExecutor(container, repo, container.agentsRepo);

    const jobCount = AGENT_CONCURRENCY + 4; // comfortably over the bound
    const jobs = Array.from({ length: jobCount }, (_, i) => ({
      agent: fakeAgent(`agent-${i + 1}`, `Agent ${i + 1}`),
      runId: `run-${i + 1}`,
    }));

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow(), jobs);

    expect(maxInFlight).toBeLessThanOrEqual(AGENT_CONCURRENCY);
    // With more jobs than the bound, the bound should actually be reached —
    // not accidentally serialized down to 1.
    expect(maxInFlight).toBe(AGENT_CONCURRENCY);
    expect(repo.insertReview).toHaveBeenCalledTimes(jobCount);
  });
});
