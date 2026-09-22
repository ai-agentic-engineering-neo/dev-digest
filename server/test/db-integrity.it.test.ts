/**
 * Schema integrity (migration 0011): CHECK constraints on enum-like columns,
 * the reviews → agents / agent_runs FKs, exact-decimal cost_usd and the
 * NULLS NOT DISTINCT settings key. Runs against a freshly migrated Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** drizzle wraps driver errors (DrizzleQueryError) — the pg code sits on `cause`. */
async function pgErrorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
}

d('DB integrity constraints (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [pr] = await db.select().from(t.pullRequests);
    prId = pr!.id;
    const [agent] = await db.select().from(t.agents);
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function insertReview(values: { runId?: string | null; agentId?: string | null }) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', ...values })
      .returning();
    return review!;
  }

  async function insertRun() {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, agentId, status: 'done', costUsd: 0.123456 })
      .returning();
    return run!;
  }

  it('CHECK rejects an unknown finding severity (23514) and accepts a valid one', async () => {
    const review = await insertReview({});
    const base = {
      reviewId: review.id,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      category: 'bug' as const,
      title: 't',
      rationale: 'r',
      confidence: 0.5,
    };
    const bad = pg.handle.db.execute(
      sql`INSERT INTO findings (review_id, file, start_line, end_line, severity, category, title, rationale, confidence)
          VALUES (${review.id}, 'a.ts', 1, 1, 'BLOCKER', 'bug', 't', 'r', 0.5)`,
    );
    expect(await pgErrorCode(bad)).toBe('23514');
    await expect(
      pg.handle.db.insert(t.findings).values({ ...base, severity: 'WARNING' }),
    ).resolves.toBeDefined();
  });

  it('CHECK rejects an unknown agent_runs.status and pull_requests.status', async () => {
    const run = await insertRun();
    expect(
      await pgErrorCode(
        pg.handle.db.execute(sql`UPDATE agent_runs SET status = 'exploded' WHERE id = ${run.id}`),
      ),
    ).toBe('23514');
    expect(
      await pgErrorCode(
        pg.handle.db.execute(sql`UPDATE pull_requests SET status = 'weird' WHERE id = ${prId}`),
      ),
    ).toBe('23514');
  });

  it('deleting an agent_run cascades to the review it produced (and its findings)', async () => {
    const run = await insertRun();
    const review = await insertReview({ runId: run.id });
    await pg.handle.db.insert(t.findings).values({
      reviewId: review.id,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'CRITICAL',
      category: 'security',
      title: 't',
      rationale: 'r',
      confidence: 0.9,
    });

    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.id, run.id));

    expect(await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.id, review.id))).toEqual([]);
    expect(
      await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, review.id)),
    ).toEqual([]);
  });

  it('a review cannot point at a non-existent run or agent (23503)', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect(await pgErrorCode(insertReview({ runId: missing }))).toBe('23503');
    expect(await pgErrorCode(insertReview({ agentId: missing }))).toBe('23503');
  });

  it('deleting an agent keeps its reviews with agent_id set to NULL', async () => {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: 'Temp', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const review = await insertReview({ agentId: agent!.id });

    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent!.id));

    const [after] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.id, review.id));
    expect(after).toBeDefined();
    expect(after!.agentId).toBeNull();
  });

  it('cost_usd is exact numeric(12,6) but still reads back as a JS number', async () => {
    const run = await insertRun();
    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, run.id));
    expect(row!.costUsd).toBe(0.123456);
    expect(typeof row!.costUsd).toBe('number');
    const [col] = (await pg.handle.db.execute(
      sql`SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
          WHERE table_name = 'agent_runs' AND column_name = 'cost_usd'`,
    )) as unknown as Array<{ data_type: string; numeric_precision: number; numeric_scale: number }>;
    expect(col).toMatchObject({ data_type: 'numeric', numeric_precision: 12, numeric_scale: 6 });
  });

  it('settings key is unique even for workspace-level rows (user_id NULL)', async () => {
    const db = pg.handle.db;
    const upsert = (value: unknown) =>
      db
        .insert(t.settings)
        .values({ workspaceId, userId: null, key: 'ws_level', value })
        .onConflictDoUpdate({
          target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
          set: { value },
        });
    await upsert(1);
    await upsert(2);
    const rows = await db.select().from(t.settings).where(eq(t.settings.key, 'ws_level'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe(2);
  });

  it('pr_files is unique per (pr_id, path)', async () => {
    const dup = pg.handle.db.insert(t.prFiles).values([
      { prId, path: 'dup.ts' },
      { prId, path: 'dup.ts' },
    ]);
    expect(await pgErrorCode(dup)).toBe('23505');
  });
});
