/**
 * PR-list COST column — GET /repos/:id/pulls → PrMeta.cost_usd.
 * The list shows what the PR has cost so far: every completed run, summed. A run
 * the provider never priced adds nothing rather than zeroing the total; a PR with
 * no priced run stays null so the UI can render "—" instead of "$0.00".
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

  it('sums every completed run on the PR, and reports null for a PR nobody has run', async () => {
    const server = await app();
    const { repo, reviewed, unreviewed } = await seedRepoWithTwoPrs();
    const first = 0.5;
    const second = 0.0013;
    await doneRunWithReview(reviewed.id, first, 40);
    await doneRunWithReview(reviewed.id, second, 80);

    const res = await server.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const list = res.json() as PrMeta[];

    const a = list.find((p) => p.id === reviewed.id)!;
    expect(a.cost_usd).toBeCloseTo(first + second, 10);
    expect(a.score).toBe(80);

    const b = list.find((p) => p.id === unreviewed.id)!;
    expect(b.cost_usd).toBeNull();
    expect(b.score).toBeNull();

    await server.close();
  });

  it('a run the provider never priced adds nothing rather than zeroing the total', async () => {
    const server = await app();
    const { repo, reviewed } = await seedRepoWithTwoPrs();
    const priced = 0.02;
    await doneRunWithReview(reviewed.id, priced, 60);
    await doneRunWithReview(reviewed.id, null, 70);

    const list = (await server.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as PrMeta[];
    const pr = list.find((p) => p.id === reviewed.id)!;
    expect(pr.cost_usd).toBe(priced);

    await server.close();
  });

  it('a PR whose only runs are unpriced reports null, never 0 — "—" and "free" differ', async () => {
    const server = await app();
    const { repo, reviewed } = await seedRepoWithTwoPrs();
    await doneRunWithReview(reviewed.id, null, 70);

    const list = (await server.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as PrMeta[];
    const pr = list.find((p) => p.id === reviewed.id)!;
    expect(pr.cost_usd).toBeNull();
    expect(pr.score).toBe(70);

    await server.close();
  });
});
