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

  /** Runs one agent; the user hits POST /runs/:id/cancel during LLM call #1. */
  async function runAndCancel(strategy: 'map-reduce' | 'single-pass') {
    const pr = await setupPr();
    const inner = new MockLLMProvider('openai', { structured: REVIEW });
    let calls = 0;
    let app!: Awaited<ReturnType<typeof buildApp>>;
    const cancelling: LLMProvider = {
      id: 'openai',
      listModels: () => inner.listModels(),
      complete: (req) => inner.complete(req),
      embed: (x) => inner.embed(x),
      async completeStructured<T>(req: StructuredRequest<T>) {
        if (++calls === 1) {
          const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
          const res = await app.inject({ method: 'POST', url: `/runs/${run!.id}/cancel` });
          expect(res.statusCode).toBe(200);
        }
        return inner.completeStructured(req);
      },
    };
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: cancelling },
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
    return { run: run!, reviews, calls };
  }

  it('map-reduce: stops before the next chunk and stays cancelled', async () => {
    const { run, reviews, calls } = await runAndCancel('map-reduce');
    expect(calls).toBe(1);
    expect(run.status).toBe('cancelled');
    expect(reviews).toHaveLength(0);
  });

  it('single-pass: a cancel during the only LLM call still wins', async () => {
    const { run, reviews, calls } = await runAndCancel('single-pass');
    expect(calls).toBe(1);
    expect(run.status).toBe('cancelled');
    expect(reviews).toHaveLength(0);
  });
});
