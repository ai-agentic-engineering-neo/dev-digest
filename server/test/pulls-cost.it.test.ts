/**
 * PR list COST column — the round total, against a real Postgres.
 *
 * The column is the PR's LIFETIME spend: every completed run it has ever had,
 * across every round. Rows are inserted directly (no LLM, no background
 * executor) so the arithmetic is exact and the test is deterministic — the
 * route's own SUM is what is under test here.
 *
 * The cases that keep mattering: unknown cost must never read as free, and a
 * free model must never read as unknown.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `costed-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
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

  /** Insert a completed run `minutesAgo` back, returning nothing. */
  async function addRun(
    prId: string,
    roundId: string | null,
    costUsd: number | null,
    minutesAgo: number,
    status = 'done',
  ) {
    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId,
      prId,
      roundId,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      ranAt: new Date(Date.now() - minutesAgo * 60_000),
      status,
      costUsd,
      durationMs: 1000,
      tokensIn: 100,
      tokensOut: 10,
      findingsCount: 0,
      grounding: '0/0 passed',
    });
  }

  async function listedCost(repoId: string, prId: string): Promise<number | null> {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    await app.close();
    return list.find((p: { id: string }) => p.id === prId).cost_usd;
  }

  it("totals every run the PR has ever had, across separate rounds", async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const rounds = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values([
        { workspaceId, prId: pr.id },
        { workspaceId, prId: pr.id },
      ])
      .returning();
    // An older review round...
    await addRun(pr.id, rounds[0]!.id, 0.0005, 30);
    await addRun(pr.id, rounds[0]!.id, 0.0004, 29);
    // ...and a newer one. The column bills the PR for both.
    await addRun(pr.id, rounds[1]!.id, 0.000034, 5);
    await addRun(pr.id, rounds[1]!.id, 0.00022, 4);
    await addRun(pr.id, rounds[1]!.id, 0.00015, 3);

    expect(await listedCost(repo.id, pr.id)).toBeCloseTo(0.001304, 9);
  });

  it('counts runs that predate round tracking alongside rounded ones', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [round] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId: pr.id })
      .returning();
    await addRun(pr.id, null, 0.0009, 30); // no round_id
    await addRun(pr.id, round!.id, 0.0013, 5);

    expect(await listedCost(repo.id, pr.id)).toBeCloseTo(0.0022, 9);
  });

  it('ignores failed runs, which never reached a model', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await addRun(pr.id, null, 0.002, 5);
    await addRun(pr.id, null, null, 4, 'failed');

    expect(await listedCost(repo.id, pr.id)).toBeCloseTo(0.002, 9);
  });

  it('sums the priced runs when some models have no known price', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await addRun(pr.id, null, 0.0013, 5);
    await addRun(pr.id, null, 0.00034, 4);
    await addRun(pr.id, null, null, 3); // unpriced model, still `done`

    expect(await listedCost(repo.id, pr.id)).toBeCloseTo(0.00164, 9);
  });

  it('reports an entirely unpriced PR as unknown, not zero', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await addRun(pr.id, null, null, 5);
    await addRun(pr.id, null, null, 4);

    expect(await listedCost(repo.id, pr.id)).toBeNull();
  });

  it('reports a free model as a real zero', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await addRun(pr.id, null, 0, 5);

    expect(await listedCost(repo.id, pr.id)).toBe(0);
  });

  it('leaves an unreviewed PR empty', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    expect(await listedCost(repo.id, pr.id)).toBeNull();
  });
});
