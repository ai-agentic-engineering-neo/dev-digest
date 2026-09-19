/**
 * PR-list COST column — GET /repos/:id/pulls → PrMeta.cost_usd.
 * The list shows the cost of the LATEST review's run, resolved exactly through
 * reviews.run_id → agent_runs.cost_usd (the same review the SCORE ring comes
 * from), not a time-window sum. Unreviewed or unpriced → null, never 0.
 * Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('PR list COST column (Testcontainers pg)', () => {
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

  let repoSeq = 0;
  async function seedRepoWithTwoPrs() {
    const db = pg.handle.db;
    const name = `cost-list-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const prValues = (number: number) => ({
      workspaceId,
      repoId: repo!.id,
      number,
      title: `PR ${number}`,
      author: 'marisa.koch',
      branch: `feat/${number}`,
      base: 'main',
      headSha: `sha-${number}`,
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    });
    const [reviewed] = await db.insert(t.pullRequests).values(prValues(1)).returning();
    const [unreviewed] = await db.insert(t.pullRequests).values(prValues(2)).returning();
    return { repo: repo!, reviewed: reviewed!, unreviewed: unreviewed! };
  }

  async function doneRunWithReview(prId: string, costUsd: number | null, score: number) {
    const db = pg.handle.db;
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, status: 'done', tokensIn: 100, tokensOut: 50, costUsd })
      .returning();
    await db
      .insert(t.reviews)
      .values({ workspaceId, prId, runId: run!.id, kind: 'review', verdict: 'approve', score });
    return run!;
  }

  function app() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient() },
    });
  }

  it('reports the cost of the LATEST review — the one the score comes from — and null for an unreviewed PR', async () => {
    const server = await app();
    const { repo, reviewed, unreviewed } = await seedRepoWithTwoPrs();
    const olderPricierRun = 0.5;
    const latestRun = 0.0013;
    await doneRunWithReview(reviewed.id, olderPricierRun, 40);
    await doneRunWithReview(reviewed.id, latestRun, 80);

    const res = await server.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const list = res.json() as PrMeta[];

    const a = list.find((p) => p.id === reviewed.id)!;
    expect(a.score).toBe(80);
    expect(a.cost_usd).toBe(latestRun);
    expect(a.cost_usd).not.toBe(olderPricierRun + latestRun);

    const b = list.find((p) => p.id === unreviewed.id)!;
    expect(b.score).toBeNull();
    expect(b.cost_usd).toBeNull();

    await server.close();
  });

  it('an unpriced latest run yields null, not 0 — the UI must be able to show "—"', async () => {
    const server = await app();
    const { repo, reviewed } = await seedRepoWithTwoPrs();
    await doneRunWithReview(reviewed.id, 0.02, 60);
    await doneRunWithReview(reviewed.id, null, 70);

    const list = (await server.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as PrMeta[];
    const pr = list.find((p) => p.id === reviewed.id)!;
    expect(pr.score).toBe(70);
    expect(pr.cost_usd).toBeNull();

    await server.close();
  });
});
