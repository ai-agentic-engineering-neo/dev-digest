import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { Review } from '@devdigest/shared';

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
  summary: 'Two findings.',
  score: 50,
  findings: [
    { id: 'a', severity: 'CRITICAL', category: 'security', title: 'Key', file: 'src/config.ts', start_line: 11, end_line: 11, rationale: 'r', confidence: 0.9, kind: 'finding' },
    { id: 'b', severity: 'WARNING', category: 'bug', title: 'Also', file: 'src/config.ts', start_line: 11, end_line: 11, rationale: 'r', confidence: 0.7, kind: 'finding' },
  ],
};

/** Agent card stats: completed runs, accepted share of decided findings, mean cost. */
d('Agent.stats (Testcontainers pg)', () => {
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

  it('counts done runs, averages known costs, and rates accepted vs dismissed findings', async () => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW }) },
      },
    });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'stats-api', fullName: 'acme/stats-api' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: repo!.id, number: 9, title: 'Stats', author: 'dev', branch: 'b', base: 'main', headSha: 'abc', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review' })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,' });

    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: { name: 'Stats Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' } })).json();
    expect(agent.stats).toEqual({ runs: 0, accept_rate: null, avg_cost_usd: null });

    await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    let fresh = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(fresh.stats.runs).toBe(1);
    expect(fresh.stats.avg_cost_usd).toBeCloseTo(0.001, 6); // the mock prices every call at $0.001
    expect(fresh.stats.accept_rate).toBeNull(); // nothing decided yet

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/reviews` })).json();
    const [f1, f2] = reviews[0].findings as Array<{ id: string }>;
    await app.inject({ method: 'POST', url: `/findings/${f1!.id}/accept` });
    fresh = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(fresh.stats.accept_rate).toBe(1);
    await app.inject({ method: 'POST', url: `/findings/${f2!.id}/dismiss` });
    const list = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{ id: string; stats: { accept_rate: number | null } }>;
    expect(list.find((a) => a.id === agent.id)!.stats.accept_rate).toBe(0.5);
    await app.close();
  });
});
