import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { LLMProvider, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Data integrity of review runs:
 *  - the review + findings + markReviewed + terminal status land atomically,
 *    and a cancel that lands after the executor's last checkpoint wins;
 *  - cancel aborts an in-flight LLM call (AbortSignal);
 *  - SSE / cancel / trace for unknown or foreign runs answer instead of hanging.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 's',
  score: 40,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

type App = Awaited<ReturnType<typeof buildApp>>;

d('review run integrity (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setupPr(ws = workspaceId) {
    const name = `integrity-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'head-sha-1',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  function appWith(llm: LLMProvider): Promise<App> {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient({ pulls: [] }),
        llm: { openai: llm },
      },
    });
  }

  /** Wraps a MockLLMProvider, running `hook` around each structured call. */
  function wrapping(
    hook: (req: StructuredRequest<unknown>, next: () => Promise<StructuredResult<unknown>>) => Promise<StructuredResult<unknown>>,
  ): LLMProvider {
    const inner = new MockLLMProvider('openai', { structured: REVIEW });
    return {
      id: 'openai',
      listModels: () => inner.listModels(),
      complete: (req) => inner.complete(req),
      embed: (x) => inner.embed(x),
      completeStructured: <T>(req: StructuredRequest<T>) =>
        hook(req as StructuredRequest<unknown>, () =>
          inner.completeStructured(req as StructuredRequest<unknown>),
        ) as Promise<StructuredResult<T>>,
    };
  }

  async function startRun(app: App, prId: string): Promise<string> {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `I${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 's', strategy: 'single-pass' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    return res.json().runs[0].run_id as string;
  }

  /** The executor is finished once it has written the run trace. */
  async function waitForTrace(runId: string) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [trace] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
      if (trace) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('run did not finish');
  }

  async function loadRun(runId: string) {
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    return run!;
  }

  // ---- 1. atomic persist + cancel race -----------------------------------

  it('a cancel that lands after the last checkpoint rolls the review back and stays cancelled', async () => {
    const pr = await setupPr();
    // The LLM call returns normally; right after it the run row is flipped to
    // 'cancelled' in the DB only (the bus never sees it) — i.e. the cancel
    // lands in the window after the executor's last isCancelled checkpoint.
    const llm = wrapping(async (_req, next) => {
      const res = await next();
      await pg.handle.db
        .update(t.agentRuns)
        .set({ status: 'cancelled' })
        .where(eq(t.agentRuns.prId, pr.id));
      return res;
    });
    const app = await appWith(llm);
    const runId = await startRun(app, pr.id);
    await waitForTrace(runId);

    const run = await loadRun(runId);
    expect(run.status).toBe('cancelled');
    // Usage spent before the cancel is still recorded.
    expect(run.costUsd).toBeCloseTo(0.001);
    const reviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    expect(reviews).toHaveLength(0);
    const [pull] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(pull!.lastReviewedSha).toBeNull();
    await app.close();
  });

  it('a failure after a cancel leaves the run cancelled (not failed)', async () => {
    const pr = await setupPr();
    const llm = wrapping(async (req) => {
      req.onUsage?.({ tokensIn: 10, tokensOut: 5, costUsd: 0.002 });
      await pg.handle.db
        .update(t.agentRuns)
        .set({ status: 'cancelled' })
        .where(eq(t.agentRuns.prId, pr.id));
      throw new Error('upstream exploded');
    });
    const app = await appWith(llm);
    const runId = await startRun(app, pr.id);
    await waitForTrace(runId);

    const run = await loadRun(runId);
    expect(run.status).toBe('cancelled');
    expect(run.tokensIn).toBe(10);
    expect(run.costUsd).toBeCloseTo(0.002);
    await app.close();
  });

  it('a successful run persists review + findings + status done', async () => {
    const pr = await setupPr();
    const app = await appWith(wrapping((_req, next) => next()));
    const runId = await startRun(app, pr.id);
    await waitForTrace(runId);
    const run = await loadRun(runId);
    expect(run.status).toBe('done');
    expect(run.findingsCount).toBe(1);
    const reviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, runId));
    expect(reviews).toHaveLength(1);
    const [pull] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(pull!.lastReviewedSha).toBe('head-sha-1');
    await app.close();
  });

  it('DELETE /runs/:id removes the run and its review together', async () => {
    const pr = await setupPr();
    const app = await appWith(wrapping((_req, next) => next()));
    const runId = await startRun(app, pr.id);
    await waitForTrace(runId);
    const res = await app.inject({ method: 'DELETE', url: `/runs/${runId}` });
    expect(res.json()).toEqual({ ok: true });
    expect(await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, runId))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId))).toHaveLength(0);
    await app.close();
  });

  // ---- 2. AbortSignal ------------------------------------------------------

  it('cancel aborts an in-flight LLM call; the run ends cancelled with its usage', async () => {
    const pr = await setupPr();
    let sawSignal = false;
    let app!: App;
    const llm = wrapping(async (req) => {
      req.onUsage?.({ tokensIn: 7, tokensOut: 3, costUsd: 0.003 });
      const signal = req.signal;
      sawSignal = signal instanceof AbortSignal;
      const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
      // Cancel while this call is "in flight"; it only settles on abort.
      setTimeout(() => void app.inject({ method: 'POST', url: `/runs/${run!.id}/cancel` }), 10);
      return new Promise((_resolve, reject) => {
        if (!signal) return; // no signal → hangs → test times out
        signal.addEventListener('abort', () => reject(new Error('Request was aborted.')), { once: true });
      });
    });
    app = await appWith(llm);
    const runId = await startRun(app, pr.id);
    await waitForTrace(runId);

    expect(sawSignal).toBe(true);
    const run = await loadRun(runId);
    expect(run.status).toBe('cancelled');
    expect(run.error).toBe('Cancelled by user');
    expect(run.tokensIn).toBe(7);
    expect(run.costUsd).toBeCloseTo(0.003);
    await app.close();
  });

  // ---- 4. SSE / cancel / trace scoping -------------------------------------

  async function otherWorkspaceRun() {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const pr = await setupPr(ws!.id);
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId: ws!.id, prId: pr.id, status: 'running', source: 'local' })
      .returning();
    await pg.handle.db.insert(t.runTraces).values({
      runId: run!.id,
      trace: {
        config: { agent: 'a', provider: 'openai', model: 'm', pr: 1, source: 'local' },
        stats: { duration_ms: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, findings: 0, grounding: '0/0' },
        prompt_assembly: { system: '', skills: null, memory: null, specs: null, user: '' },
        tool_calls: [],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        log: [],
      },
    });
    return run!;
  }

  async function localRun(status: 'running' | 'done' | 'failed' | 'cancelled', error: string | null = null) {
    const pr = await setupPr();
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status, source: 'local', error })
      .returning();
    return run!;
  }

  it('SSE for a run unknown to the bus and the DB answers 404 instead of hanging', async () => {
    const app = await appWith(wrapping((_req, next) => next()));
    const res = await app.inject({ method: 'GET', url: `/runs/${randomUUID()}/events` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('SSE for a finished run the bus no longer knows sends a final status event and ends', async () => {
    const app = await appWith(wrapping((_req, next) => next()));
    const run = await localRun('failed', 'boom');
    const res = await app.inject({ method: 'GET', url: `/runs/${run.id}/events` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.payload).toContain('"status":"failed"');
    expect(res.payload).toContain('boom');
    await app.close();
  });

  it('SSE, cancel and trace are scoped to the workspace (404 for a foreign run)', async () => {
    const app = await appWith(wrapping((_req, next) => next()));
    const foreign = await otherWorkspaceRun();
    expect((await app.inject({ method: 'GET', url: `/runs/${foreign.id}/events` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/runs/${foreign.id}/cancel` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/runs/${foreign.id}/trace` })).statusCode).toBe(404);
    const [still] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, foreign.id));
    expect(still!.status).toBe('running');
    await app.close();
  });

  it('a stored trace that fails the schema returns a generic 500', async () => {
    const app = await appWith(wrapping((_req, next) => next()));
    const run = await localRun('done');
    await pg.handle.db.insert(t.runTraces).values({ runId: run.id, trace: { nope: true } });
    const res = await app.inject({ method: 'GET', url: `/runs/${run.id}/trace` });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.message).toBe('Internal error');
    expect(res.payload).not.toContain('nope');
    await app.close();
  });

  // ---- 5. body schema --------------------------------------------------------

  it('POST /pulls/:id/review validates the body at the route schema', async () => {
    const app = await appWith(wrapping((_req, next) => next()));
    const pr = await setupPr();
    const bad = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: 'yes' } });
    expect(bad.statusCode).toBe(422);
    const empty = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review` });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('invalid_run_request');
    await app.close();
  });
});
