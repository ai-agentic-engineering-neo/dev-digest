import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

/**
 * M1 run cost — the stored cost flows from a finished run into every read:
 * run history, trace, reviews and the per-PR sum on the PR list.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 90,
  findings: [],
};

let seq = 0;
async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `cost-repo-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function insertPr(db: PgFixture['handle']['db'], workspaceId: string, repoId: string, number: number) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number,
      title: `PR ${number}`,
      author: 'marisa.koch',
      branch: `feat/${number}`,
      base: 'main',
      headSha: `sha${number}`,
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('M1 run cost (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const appWith = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW }) },
      },
    });

  it('a finished run stores its cost and every read returns it', async () => {
    const app = await appWith();
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 482);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Cost Rev', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // MockLLMProvider reports costUsd 0.001 per structured call.
    expect(run!.status).toBe('done');
    expect(run!.costUsd).toBeCloseTo(0.001, 9);

    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].cost_usd).toBeCloseTo(0.001, 9);

    const trace = (await app.inject({ method: 'GET', url: `/runs/${run!.id}/trace` })).json();
    expect(trace.stats.cost_usd).toBeCloseTo(0.001, 9);

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews[0].cost_usd).toBeCloseTo(0.001, 9);
    expect(reviews[0].tokens_in).toBe(run!.tokensIn);
    expect(reviews[0].tokens_out).toBe(run!.tokensOut);

    await app.close();
  });

  it('a pre-M1 trace (no stats.cost_usd, null column) returns cost_usd null', async () => {
    const app = await appWith();
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 483);
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done', model: 'gpt-4.1', tokensIn: 100, tokensOut: 10 })
      .returning();
    await pg.handle.db.insert(t.runTraces).values({
      runId: run!.id,
      trace: {
        config: { agent: 'Old', model: 'gpt-4.1', source: 'local' },
        stats: { duration_ms: 1, tokens_in: 100, tokens_out: 10, findings: 0, grounding: '0/0 passed' },
        prompt_assembly: { system: '', skills: null, memory: null, specs: null, user: '' },
        tool_calls: [],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        log: [],
      },
    });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${run!.id}/trace` })).json();
    expect(trace.stats.cost_usd).toBeNull();
    expect(trace.stats.tokens_in).toBe(100);
    await app.close();
  });

  it('PR list sums the priced runs per PR, null when none is priced', async () => {
    const app = await appWith();
    const db = pg.handle.db;
    const repo = await setupRepo(db, workspaceId);
    const prA = await insertPr(db, workspaceId, repo.id, 501); // 3 runs, one unpriced
    const prB = await insertPr(db, workspaceId, repo.id, 502); // runs, none priced
    const prC = await insertPr(db, workspaceId, repo.id, 503); // no runs

    await db.insert(t.agentRuns).values([
      { workspaceId, prId: prA.id, status: 'done', costUsd: 0.001 },
      { workspaceId, prId: prA.id, status: 'done', costUsd: 0.002 },
      { workspaceId, prId: prA.id, status: 'failed', costUsd: null },
      { workspaceId, prId: prB.id, status: 'failed', costUsd: null },
    ]);
    // A run in ANOTHER workspace pointing at prA must not be counted.
    const [other] = await db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    await db.insert(t.agentRuns).values({ workspaceId: other!.id, prId: prA.id, status: 'done', costUsd: 5 });

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as Array<{
      id: string;
      cost_usd: number | null;
    }>;
    const byId = new Map(list.map((p) => [p.id, p.cost_usd]));
    expect(byId.get(prA.id)).toBeCloseTo(0.003, 9);
    expect(byId.get(prB.id)).toBeNull();
    expect(byId.get(prC.id)).toBeNull();

    // Unpriced rows stay null in the table itself.
    const rows = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prB.id));
    expect(rows.every((r) => r.costUsd == null)).toBe(true);
    await app.close();
  });
});
