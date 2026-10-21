/**
 * PR list COST column — `GET /repos/:id/pulls` rolls up `agent_runs.cost_usd`
 * per PR: sum over DONE runs with a KNOWN cost. Null-cost runs (unpriced
 * model / rows that predate the column) and failed runs are excluded, a PR
 * with no priced run reports null (the UI renders "—", never "$0.00"), and
 * deleting a run drops it from the sum. Runs are inserted directly (no model
 * call). Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `costed-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function addPr(db: PgFixture['handle']['db'], workspaceId: string, repoId: string, number: number) {
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
      status: 'open',
    })
    .returning();
  return pr!;
}

async function addRun(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  status: 'done' | 'failed' | 'cancelled',
  costUsd: number | null,
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId,
      agentId: null,
      prId,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      status,
      source: 'local',
      durationMs: 1000,
      tokensIn: 100,
      tokensOut: 50,
      costUsd,
      findingsCount: 0,
      grounding: '0/0 passed',
    })
    .returning();
  return run!;
}

d('PR list cost rollup (Testcontainers pg)', () => {
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

  it('sums done runs with a known cost; ignores null-cost and failed runs; null when none', async () => {
    // No GitHub override → the route serves persisted PRs (no token configured).
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const priced = await addPr(pg.handle.db, workspaceId, repo.id, 1);
    const unpriced = await addPr(pg.handle.db, workspaceId, repo.id, 2);
    const untouched = await addPr(pg.handle.db, workspaceId, repo.id, 3);

    await addRun(pg.handle.db, workspaceId, priced.id, 'done', 0.0013);
    await addRun(pg.handle.db, workspaceId, priced.id, 'done', 0.0107);
    await addRun(pg.handle.db, workspaceId, priced.id, 'done', null); // pre-cost row / unknown model
    await addRun(pg.handle.db, workspaceId, priced.id, 'failed', 5); // never counted
    await addRun(pg.handle.db, workspaceId, unpriced.id, 'done', null);
    await addRun(pg.handle.db, workspaceId, unpriced.id, 'cancelled', null);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byNumber = new Map((res.json() as PrMeta[]).map((p) => [p.number, p]));

    expect(byNumber.get(1)!.cost_usd).toBeCloseTo(0.012, 6);
    expect(byNumber.get(1)!.cost_runs).toBe(2);
    // Runs exist but none is priced → null, not 0.
    expect(byNumber.get(2)!.cost_usd).toBeNull();
    expect(byNumber.get(2)!.cost_runs).toBeNull();
    expect(byNumber.get(3)!.cost_usd).toBeNull();
    expect(untouched.id).toBeTruthy();

    await app.close();
  });

  it('a free model prices at 0, which is a real cost (not null)', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 1);
    await addRun(pg.handle.db, workspaceId, pr.id, 'done', 0);

    const [row] = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as PrMeta[];
    expect(row!.cost_usd).toBe(0);
    expect(row!.cost_runs).toBe(1);
    await app.close();
  });

  it('deleting a run removes it from the PR total', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 1);
    const keep = await addRun(pg.handle.db, workspaceId, pr.id, 'done', 0.002);
    const drop = await addRun(pg.handle.db, workspaceId, pr.id, 'done', 0.003);

    const before = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as PrMeta[];
    expect(before[0]!.cost_usd).toBeCloseTo(0.005, 6);

    const del = await app.inject({ method: 'DELETE', url: `/runs/${drop.id}` });
    expect(del.statusCode).toBeLessThan(300);
    const [gone] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, drop.id));
    expect(gone).toBeUndefined();

    const after = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as PrMeta[];
    expect(after[0]!.cost_usd).toBeCloseTo(0.002, 6);
    expect(after[0]!.cost_runs).toBe(1);
    expect(keep.id).toBeTruthy();
    await app.close();
  });
});
