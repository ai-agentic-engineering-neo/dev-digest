/**
 * Run cost surfaces on GET /repos/:id/pulls as the SUM of agent_runs.cost_usd
 * per PR; null (rendered "—") when no run is priced. Needs Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('PR list cost aggregation (Testcontainers pg)', () => {
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

  it('sums priced runs, ignores unpriced, null when none priced', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'cost', fullName: 'acme/cost' })
      .returning();
    const mkPr = async (number: number) =>
      (
        await db
          .insert(t.pullRequests)
          .values({
            workspaceId,
            repoId: repo!.id,
            number,
            title: `PR ${number}`,
            author: 'a',
            branch: 'b',
            base: 'main',
            headSha: 'abc',
            additions: 1,
            deletions: 0,
            filesCount: 1,
            status: 'open',
          })
          .returning()
      )[0]!;
    const [priced, unpriced, empty] = [await mkPr(1), await mkPr(2), await mkPr(3)];
    const run = (prId: string, costUsd: string | null) =>
      db.insert(t.agentRuns).values({ workspaceId, prId, status: 'done', costUsd });
    await run(priced.id, '0.001300');
    await run(priced.id, '0.001400');
    await run(priced.id, null);
    await run(unpriced.id, null);

    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient() },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byNumber = new Map((res.json() as PrMeta[]).map((p) => [p.number, p]));
    expect(byNumber.get(1)!.cost_usd).toBeCloseTo(0.0027, 6);
    expect(byNumber.get(2)!.cost_usd).toBeNull();
    expect(byNumber.get(3)!.cost_usd).toBeNull();
    expect(empty.id).toBeDefined();
  });
});
