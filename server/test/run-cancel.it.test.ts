import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { LLMProvider, Review, StructuredRequest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * POST /runs/:id/cancel must stop a LIVE run. Regression: the route cancelled
 * and then completed the bus, and complete() cleared the cancel flag — the
 * runner never saw it, finished the review, and overwrote 'cancelled' with
 * 'done'. A cancel during the LAST LLM call must win too.
 *
 * Map-reduce chunks run in parallel (REVIEW_MAP_CONCURRENCY, reviewer-core
 * default 3). Cancel semantics: every IN-FLIGHT chunk call is aborted through
 * its AbortSignal, and chunks that have not started never start.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
 export const a = 1;
+export const b = 2;`;

/** Four changed files ⇒ four map-reduce chunks. */
const DIFF_FOUR = ['a', 'b', 'c', 'd']
  .map((f) => `diff --git a/src/${f}.ts b/src/${f}.ts\n--- a/src/${f}.ts\n+++ b/src/${f}.ts\n@@ -1,1 +1,2 @@\n x\n+y`)
  .join('\n');

const REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

d('run cancel (Testcontainers pg)', () => {
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

  async function setupPr() {
    const name = `cancel-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
        additions: 2,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  /** POST /runs/:id/cancel for the PR's (only) run, as the user would. */
  async function cancelViaRoute(app: Awaited<ReturnType<typeof buildApp>>, prId: string) {
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const res = await app.inject({ method: 'POST', url: `/runs/${run!.id}/cancel` });
    expect(res.statusCode).toBe(200);
  }

  /**
   * Runs one agent whose LLM calls are scripted by `onCall` (call index from 1,
   * the request, the app — to cancel through the route).
   */
  async function runScripted(
    strategy: 'map-reduce' | 'single-pass',
    opts: {
      diff: string;
      concurrency?: string;
      onCall: (n: number, req: StructuredRequest<unknown>, cancel: () => Promise<void>) => Promise<void>;
    },
  ) {
    const pr = await setupPr();
    const inner = new MockLLMProvider('openai', { structured: REVIEW });
    let calls = 0;
    const signals: AbortSignal[] = [];
    let app!: Awaited<ReturnType<typeof buildApp>>;
    const scripted: LLMProvider = {
      id: 'openai',
      listModels: () => inner.listModels(),
      complete: (req) => inner.complete(req),
      embed: (x) => inner.embed(x),
      async completeStructured<T>(req: StructuredRequest<T>) {
        const n = ++calls;
        if (req.signal) signals.push(req.signal);
        await opts.onCall(n, req as StructuredRequest<unknown>, () => cancelViaRoute(app, pr.id));
        return inner.completeStructured(req);
      },
    };
    // REVIEW_INTENT_ENABLED: 'false' — only openai is injected below; intent
    // defaults to openrouter, so leaving it on would make a real, paid call.
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      REVIEW_MAP_CONCURRENCY: opts.concurrency ?? '',
      REVIEW_INTENT_ENABLED: 'false',
    };
    app = await buildApp({
      config: loadConfig(env as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: opts.diff }),
        llm: { openai: scripted },
      },
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `C${seq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 's', strategy },
      })
    ).json();
    const runId = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id as string;

    // The route flips the row to 'cancelled' at once; the executor is finished
    // only once it has written the run trace.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [trace] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
      if (trace) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    const reviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    await app.close();
    return { run: run!, reviews, calls, signals };
  }

  /** The user cancels during LLM call #1; the call itself then completes. */
  const cancelOnFirst = async (n: number, _req: unknown, cancel: () => Promise<void>) => {
    if (n === 1) await cancel();
  };

  /** Rejects like an SDK call once `signal` aborts (fails the test if it never does). */
  const untilAborted = (signal: AbortSignal) =>
    new Promise<void>((_, reject) => {
      const fail = () => reject(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' }));
      if (signal.aborted) fail();
      signal.addEventListener('abort', fail, { once: true });
      setTimeout(() => reject(new Error('test: in-flight call was never aborted')), 5_000).unref();
    });

  it('map-reduce, concurrency 1: stops before the next chunk and stays cancelled', async () => {
    const { run, reviews, calls } = await runScripted('map-reduce', {
      diff: DIFF,
      concurrency: '1',
      onCall: cancelOnFirst,
    });
    expect(calls).toBe(1);
    expect(run.status).toBe('cancelled');
    expect(reviews).toHaveLength(0);
  });

  it('map-reduce, concurrency 2: cancel aborts the in-flight chunk and no further chunk starts', async () => {
    let secondStarted!: () => void;
    const second = new Promise<void>((r) => (secondStarted = r));
    const { run, reviews, calls, signals } = await runScripted('map-reduce', {
      diff: DIFF_FOUR,
      concurrency: '2',
      onCall: async (n, req, cancel) => {
        if (n === 1) {
          await second; // chunks 1 and 2 are both in flight
          await cancel();
          return;
        }
        secondStarted();
        await untilAborted(req.signal!);
      },
    });
    expect(calls).toBe(2); // chunks 3 and 4 never reached the LLM
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(run.status).toBe('cancelled');
    expect(reviews).toHaveLength(0);
  });

  it('single-pass: a cancel during the only LLM call still wins', async () => {
    const { run, reviews, calls } = await runScripted('single-pass', { diff: DIFF, onCall: cancelOnFirst });
    expect(calls).toBe(1);
    expect(run.status).toBe('cancelled');
    expect(reviews).toHaveLength(0);
  });
});
