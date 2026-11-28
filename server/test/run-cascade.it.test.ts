/**
 * DB-3: runs and reviews are deleted with their PR / repo, and the migration's
 * clean-up SQL is valid on a database that already holds orphans.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('run and review cascade (migration 0012)', () => {
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

  async function makePr(name: string) {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: repo!.id, number: 1, title: 'pr', author: 'a', branch: 'b', base: 'main', headSha: 'sha' })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  it('removing a repo removes its runs and reviews', async () => {
    const db = pg.handle.db;
    const { repo, pr } = await makePr('cascade');
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done' })
      .returning();
    await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, runId: run!.id, kind: 'review' });

    await db.delete(t.repos).where(eq(t.repos.id, repo.id));

    expect(await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, run!.id))).toHaveLength(0);
    expect(await db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id))).toHaveLength(0);
  });

  it('deleting a run removes the review it produced', async () => {
    const db = pg.handle.db;
    const { pr } = await makePr('run-delete');
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done' })
      .returning();
    await db.insert(t.reviews).values({ workspaceId, prId: pr.id, runId: run!.id, kind: 'review' });
    await db.delete(t.agentRuns).where(eq(t.agentRuns.id, run!.id));
    expect(await db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id))).toHaveLength(0);
  });

  it('the clean-up SQL removes orphans before the constraints are added', async () => {
    const db = pg.handle.db;
    const { pr } = await makePr('orphans');
    const ghost = '00000000-0000-0000-0000-00000000dead';

    // Put the schema back into its pre-0012 state.
    await db.execute(sql`ALTER TABLE reviews DROP CONSTRAINT reviews_agent_id_agents_id_fk`);
    await db.execute(sql`ALTER TABLE reviews DROP CONSTRAINT reviews_run_id_agent_runs_id_fk`);
    await db.execute(sql`ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_pr_id_pull_requests_id_fk`);
    await db.execute(
      sql`ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_pr_id_pull_requests_id_fk FOREIGN KEY (pr_id) REFERENCES pull_requests(id) ON DELETE SET NULL`,
    );

    const [detached] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: null, status: 'done' })
      .returning();
    const [kept] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done' })
      .returning();
    await db.insert(t.reviews).values([
      { workspaceId, prId: pr.id, runId: ghost, kind: 'review' }, // dangling run
      { workspaceId, prId: pr.id, runId: detached!.id, kind: 'review' }, // run deleted by clean-up
      { workspaceId, prId: pr.id, runId: kept!.id, agentId: ghost, kind: 'review' }, // dangling agent
    ]);

    const file = readFileSync(
      new URL('../src/db/migrations/0012_medical_vector.sql', import.meta.url),
      'utf8',
    );
    for (const stmt of file.split('--> statement-breakpoint')) await db.execute(sql.raw(stmt));

    const left = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    expect(left).toHaveLength(1);
    expect(left[0]!.runId).toBe(kept!.id);
    expect(left[0]!.agentId).toBeNull();
    expect(await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, detached!.id))).toHaveLength(0);
  });
});
