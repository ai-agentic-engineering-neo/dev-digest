import { describe, it, expect } from 'vitest';
import type {
  Finding,
  FindingRecord,
  LLMProvider,
  Review,
  RunEvent,
  RunTrace,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { RunBus } from '../src/platform/sse.js';
import { ReviewService } from '../src/modules/reviews/application/review-service.js';
import { ReviewRunExecutor } from '../src/modules/reviews/application/run-executor.js';
import type { AgentDirectory, ReviewStore } from '../src/modules/reviews/application/ports.js';
import type { StoredReview } from '../src/modules/reviews/domain/review.js';
import type {
  NewAgentRun,
  NewReview,
  ReviewAgent,
  RunCompletion,
  RunState,
} from '../src/modules/reviews/domain/types.js';

/**
 * Reviews use cases against in-memory fakes of their ports (no Postgres).
 * The executor tests pin the cancel semantics of parallel map-reduce: a cancel
 * aborts every in-flight chunk via its AbortSignal and no further chunk starts.
 */

const WS = 'ws-1';
const PR = { id: 'pr-1', workspaceId: WS, repoId: 'repo-1', number: 7, title: 't', author: 'a', base: 'main', headSha: 'abc', body: null };
const AGENT: ReviewAgent = {
  id: 'ag-1',
  name: 'Sec',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 's',
  strategy: 'map-reduce',
  ciFailOn: 'critical',
  repoIntel: false,
  version: 1,
};
const REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

/** Four changed files ⇒ a map-reduce agent makes one LLM call per file. */
const DIFF = parseUnifiedDiff(
  ['a', 'b', 'c', 'd']
    .map((f) => `diff --git a/${f}.ts b/${f}.ts\n--- a/${f}.ts\n+++ b/${f}.ts\n@@ -1,1 +1,2 @@\n x\n+y`)
    .join('\n'),
);

class FakeStore implements ReviewStore {
  runs = new Map<string, RunState & { workspaceId: string; completion?: RunCompletion }>();
  reviews: NewReview[] = [];
  traces = new Map<string, unknown>();
  findingWs = new Map<string, string>();
  private seq = 0;

  async getPull(ws: string, id: string) {
    return ws === PR.workspaceId && id === PR.id ? PR : undefined;
  }
  async getRepo() {
    return { id: 'repo-1', owner: 'acme', name: 'api' };
  }
  async storedDiff() {
    return DIFF;
  }
  async insertReview(values: NewReview) {
    this.reviews.push(values);
    return { id: `rv-${this.reviews.length}` };
  }
  async insertFindings(reviewId: string, findings: Finding[]): Promise<FindingRecord[]> {
    return findings.map((f) => ({ ...f, review_id: reviewId, accepted_at: null, dismissed_at: null }));
  }
  async markReviewed() {}
  async recordRunSkills() {}
  async completeAgentRunIfRunning(runId: string, completion: RunCompletion) {
    const run = this.runs.get(runId);
    if (run?.status !== 'running') return false;
    Object.assign(run, { status: 'done', completion });
    return true;
  }
  async reviewsForPull(): Promise<StoredReview[]> {
    return [];
  }
  async deleteReview() {
    return false;
  }
  async findingWorkspaceId(id: string) {
    return this.findingWs.get(id);
  }
  async setFindingAccepted(id: string, at: Date) {
    return { ...finding(id), accepted_at: at.toISOString() };
  }
  async setFindingDismissed(id: string, at: Date) {
    return { ...finding(id), dismissed_at: at.toISOString() };
  }
  async createAgentRun(v: NewAgentRun) {
    const id = `run-${++this.seq}`;
    this.runs.set(id, { id, status: 'running', error: null, workspaceId: v.workspaceId });
    return id;
  }
  async activeRunsForPull() {
    return [];
  }
  async listRunsForPull() {
    return [];
  }
  async usageForRuns() {
    return new Map();
  }
  async getRunInWorkspace(ws: string, id: string) {
    const run = this.runs.get(id);
    return run && run.workspaceId === ws ? { id, status: run.status, error: run.error } : undefined;
  }
  async deleteAgentRun() {
    return false;
  }
  async cancelRunIfRunning(ws: string, id: string) {
    const run = this.runs.get(id);
    if (run?.workspaceId !== ws || run.status !== 'running') return false;
    Object.assign(run, { status: 'cancelled', error: 'Cancelled by user' });
    return true;
  }
  async failAgentRun(id: string, status: 'failed' | 'cancelled', completion: RunCompletion) {
    const run = this.runs.get(id)!;
    if (run.status === 'running') Object.assign(run, { status, error: completion.error ?? null });
    run.completion = completion;
    return run.status;
  }
  async reapStaleRunningRuns() {
    return 0;
  }
  async saveRunTrace(id: string, trace: RunTrace) {
    this.traces.set(id, trace);
  }
  async getRunTraceInWorkspace(ws: string, id: string) {
    return this.runs.get(id)?.workspaceId === ws && this.traces.has(id) ? { trace: this.traces.get(id) } : undefined;
  }
}

function finding(id: string): FindingRecord {
  return {
    id,
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    suggestion: null,
    confidence: 0.5,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'rv',
    accepted_at: null,
    dismissed_at: null,
  };
}

const agents: AgentDirectory = {
  listEnabled: async () => [AGENT],
  getById: async (_ws, id) => (id === AGENT.id ? AGENT : undefined),
  namesByIds: async () => new Map(),
};

/** An LLM whose every structured call is scripted by `onCall(index, req)`. */
function scriptedLlm(onCall: (i: number, req: StructuredRequest<unknown>) => Promise<void>) {
  const signals: AbortSignal[] = [];
  const llm = {
    id: 'openai',
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const i = signals.push(req.signal!) - 1;
      req.onUsage?.({ tokensIn: 100, tokensOut: 50, costUsd: 0.001 });
      await onCall(i, req as StructuredRequest<unknown>);
      return { data: REVIEW as T, model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001, raw: '{}', attempts: 1 };
    },
  } as unknown as LLMProvider;
  return { llm, signals };
}

/** Resolves when `signal` aborts (rejects like an SDK call would). */
function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((_, reject) => {
    const fail = () => reject(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' }));
    if (signal.aborted) fail();
    signal.addEventListener('abort', fail, { once: true });
    setTimeout(() => reject(new Error('test: signal was never aborted')), 2_000).unref();
  });
}

function setup(llm: LLMProvider, mapConcurrency?: number) {
  const store = new FakeStore();
  const runBus = new RunBus();
  const clock = () => new Date();
  const executor = new ReviewRunExecutor({
    reviews: store,
    tx: { run: (work) => work({ reviews: store }) },
    runBus,
    llm: async () => llm,
    git: { diff: async () => DIFF },
    repoIntel: {
      getCallerSignatures: async () => [],
      getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }) as never,
      getFileRank: async () => [],
    },
    skills: { enabledForAgent: async () => [] },
    clock,
    ...(mapConcurrency !== undefined ? { mapConcurrency } : {}),
  });
  const service = new ReviewService({ reviews: store, agents, runBus, executor, clock });
  return { store, runBus, service, executor };
}

async function runAgent(s: ReturnType<typeof setup>): Promise<string> {
  const store = s.store;
  const runId = await store.createAgentRun({ workspaceId: WS, agentId: AGENT.id, prId: PR.id, provider: 'openai', model: 'm' });
  await s.executor.executeRuns(WS, PR, { id: 'repo-1', owner: 'acme', name: 'api' }, [{ agent: AGENT, runId }]);
  return runId;
}

describe('ReviewRunExecutor cancel (parallel map-reduce)', () => {
  it('concurrency 2: a cancel aborts the in-flight chunk and no further chunk starts', async () => {
    let secondStarted!: () => void;
    const second = new Promise<void>((r) => (secondStarted = r));
    let s!: ReturnType<typeof setup>;
    let runId = '';
    const { llm, signals } = scriptedLlm(async (i, req) => {
      if (i === 0) {
        await second; // both chunks are in flight now
        await s.service.cancelRun(WS, runId);
        return;
      }
      secondStarted();
      await untilAborted(req.signal!);
    });
    s = setup(llm, 2);
    runId = 'run-1';
    await runAgent(s);

    expect(signals).toHaveLength(2); // chunks 3 and 4 never reached the LLM
    expect(signals.every((sig) => sig.aborted)).toBe(true);
    const run = s.store.runs.get(runId)!;
    expect(run.status).toBe('cancelled');
    expect(run.completion?.tokensIn).toBe(200); // both started calls are billed
    expect(s.store.reviews).toHaveLength(0);
  });

  it('concurrency 1: stops before the next chunk', async () => {
    let s!: ReturnType<typeof setup>;
    const { llm, signals } = scriptedLlm(async (i) => {
      if (i === 0) await s.service.cancelRun(WS, 'run-1');
    });
    s = setup(llm, 1);
    await runAgent(s);

    expect(signals).toHaveLength(1);
    expect(s.store.runs.get('run-1')!.status).toBe('cancelled');
    expect(s.store.reviews).toHaveLength(0);
  });

  it('without a cancel every chunk runs and the review is persisted', async () => {
    const { llm, signals } = scriptedLlm(async () => undefined);
    const s = setup(llm, 3);
    const runId = await runAgent(s);
    expect(signals).toHaveLength(4);
    expect(s.store.runs.get(runId)!.status).toBe('done');
    expect(s.store.reviews).toHaveLength(1);
    expect(s.runBus.isComplete(runId)).toBe(true);
  });
});

describe('ReviewService', () => {
  const idle = scriptedLlm(async () => undefined).llm;

  it('startReview without agentId/all → invalid_run_request (400 kind)', async () => {
    const { service } = setup(idle);
    await expect(service.startReview(WS, PR.id, {})).rejects.toMatchObject({
      code: 'invalid_run_request',
      kind: 'invalid_input',
    });
  });

  it('startReview returns the runs at once (reviews come later)', async () => {
    const { service } = setup(idle);
    const res = await service.startReview(WS, PR.id, { agentId: AGENT.id });
    expect(res).toEqual({ pr_id: PR.id, runs: [{ run_id: 'run-1', agent_id: AGENT.id, agent_name: 'Sec' }], reviews: [] });
  });

  it('actOnFinding: a finding of another workspace is not found; other actions are invalid_action', async () => {
    const { service, store } = setup(idle);
    store.findingWs.set('f-1', 'other-ws');
    await expect(service.actOnFinding(WS, 'f-1', 'accept')).rejects.toMatchObject({ kind: 'not_found' });
    store.findingWs.set('f-2', WS);
    await expect(service.actOnFinding(WS, 'f-2', 'learn')).rejects.toMatchObject({
      code: 'invalid_action',
      kind: 'invalid_input',
    });
    const { finding: f } = await service.actOnFinding(WS, 'f-2', 'dismiss');
    expect(f.dismissed_at).not.toBeNull();
  });

  it('deleteReview of an unknown review → not_found', async () => {
    const { service } = setup(idle);
    await expect(service.deleteReview(WS, 'nope')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('getRunTrace: a corrupt stored trace → internal error, never echoed', async () => {
    const { service, store } = setup(idle);
    const runId = await store.createAgentRun({ workspaceId: WS, agentId: null, prId: PR.id, provider: null, model: null });
    store.traces.set(runId, { nope: true });
    await expect(service.getRunTrace(WS, runId)).rejects.toMatchObject({ kind: 'internal', message: 'Internal error' });
  });

  it('runEvents: a finished run the bus no longer holds yields one final event', async () => {
    const { service, store } = setup(idle);
    const runId = await store.createAgentRun({ workspaceId: WS, agentId: null, prId: PR.id, provider: null, model: null });
    await store.failAgentRun(runId, 'failed', { durationMs: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, findingsCount: 0, grounding: '', error: 'x' });
    const events: RunEvent[] = [];
    for await (const e of await service.runEvents(WS, runId)) events.push(e);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'info', data: { status: 'failed', error: 'x' } });
    await expect(service.runEvents('other-ws', runId)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('runEvents: a live run replays its buffer and ends on complete', async () => {
    const { service, store, runBus } = setup(idle);
    const runId = await store.createAgentRun({ workspaceId: WS, agentId: null, prId: PR.id, provider: null, model: null });
    runBus.publish(runId, 'info', 'one');
    const stream = await service.runEvents(WS, runId);
    const seen: string[] = [];
    const done = (async () => {
      for await (const e of stream) seen.push(e.msg);
    })();
    runBus.publish(runId, 'result', 'two');
    runBus.complete(runId);
    await done;
    expect(seen).toEqual(['one', 'two']);
  });
});
