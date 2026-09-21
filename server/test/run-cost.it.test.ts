import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';
import { backfillRunCosts } from '../src/modules/reviews/repository/run.repo.js';
import * as t from '../src/db/schema.js';

/**
 * Run cost: the PR list's COST column (sum over every run of the PR) and the
 * boot-time backfill that prices runs finished before cost attribution existed.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

d('run cost (Testcontainers pg)', () => {
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

  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }) },
    });

  /** A repo with one PR; `number` keeps PRs distinct inside a shared repo row. */
  async function repoWithPr() {
    const name = `cost-repo-${seq++}`;
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
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function insertRun(
    prId: string,
    values: Partial<typeof t.agentRuns.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        prId,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'done',
        tokensIn: 1000,
        tokensOut: 500,
        ...values,
      })
      .returning({ id: t.agentRuns.id });
    return row!.id;
  }

  it('PR list COST is the sum of every run of the PR', async () => {
    const a = await app();
    const { repo, pr } = await repoWithPr();
    await insertRun(pr.id, { costUsd: 0.001 });
    await insertRun(pr.id, { costUsd: 0.0025 });

    const list = (await a.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    expect(list).toHaveLength(1);
    expect(list[0].cost_usd).toBeCloseTo(0.0035, 6);

    await a.close();
  });

  it('PR list COST is null (not 0) when no run of the PR has cost data', async () => {
    const a = await app();
    const { repo: r1, pr: withoutCost } = await repoWithPr();
    // A failed run stores no cost; the column must read "—", never "$0.00".
    await insertRun(withoutCost.id, { status: 'failed', costUsd: null, tokensIn: 0, tokensOut: 0 });
    const { repo: r2 } = await repoWithPr(); // a PR with no runs at all

    const listed = (await a.inject({ method: 'GET', url: `/repos/${r1.id}/pulls` })).json();
    expect(listed[0].cost_usd).toBeNull();
    const neverRun = (await a.inject({ method: 'GET', url: `/repos/${r2.id}/pulls` })).json();
    expect(neverRun[0].cost_usd).toBeNull();

    await a.close();
  });

  it('a genuine zero-cost run stays $0.00, i.e. 0 and not null', async () => {
    const a = await app();
    const { repo, pr } = await repoWithPr();
    await insertRun(pr.id, { model: 'z-ai/glm-4.7-flash', costUsd: 0 });

    const list = (await a.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    expect(list[0].cost_usd).toBe(0);

    await a.close();
  });

  it('run history exposes cost_usd per run', async () => {
    const a = await app();
    const { pr } = await repoWithPr();
    await insertRun(pr.id, { costUsd: 0.0013 });
    await insertRun(pr.id, { status: 'failed', costUsd: null });

    const runs = (await a.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs).toHaveLength(2);
    const costs = runs.map((r: { cost_usd: number | null }) => r.cost_usd);
    expect(costs).toContain(0.0013);
    expect(costs).toContain(null); // the failed run reports no cost

    await a.close();
  });

  it('backfill prices historical runs from their tokens, and is idempotent', async () => {
    const { pr } = await repoWithPr();
    // gpt-4.1 = $2/1M in, $8/1M out → 1000 * 2/1M + 500 * 8/1M = 0.006
    const priced = await insertRun(pr.id, { costUsd: null });
    const unpriced = await insertRun(pr.id, { model: 'who/knows-v9', costUsd: null });
    const failed = await insertRun(pr.id, {
      status: 'failed',
      costUsd: null,
      tokensIn: 0,
      tokensOut: 0,
    });
    const alreadyPriced = await insertRun(pr.id, { costUsd: 0.5 });

    const updated = await backfillRunCosts(pg.handle.db, estimateCost);
    expect(updated).toBe(1);

    const byId = async (id: string) =>
      (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, id)))[0]!;
    expect((await byId(priced)).costUsd).toBeCloseTo(0.006, 8);
    expect((await byId(unpriced)).costUsd).toBeNull(); // unknown model stays "—"
    expect((await byId(failed)).costUsd).toBeNull(); // failed runs are left alone
    expect((await byId(alreadyPriced)).costUsd).toBe(0.5); // never overwritten

    // Second pass finds nothing left to price.
    expect(await backfillRunCosts(pg.handle.db, estimateCost)).toBe(0);
  });
});
