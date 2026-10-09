/**
 * Deleting a review (from the PR detail page's "Review runs" section) and
 * deleting a run (from the "Timeline") both represent the SAME underlying
 * agent run, seen from two different tables (`reviews` vs `agent_runs`,
 * linked only by an unenforced `reviews.run_id` column — no FK). Either
 * delete path must remove BOTH sides, or the two views go out of sync: a
 * user deletes an entry from one section and it keeps showing up in the
 * other. Gated on Docker (needs Postgres), matching the other integration
 * tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `del-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'PR',
      author: 'marisa.koch',
      branch: 'feat/x',
      base: 'main',
      headSha: 'headsha',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return pr!;
}

/** One agent run + its matching review + a finding + a trace — the full
 *  "same run seen two ways" fixture. */
async function setupRunAndReview(db: PgFixture['handle']['db'], workspaceId: string, prId: string) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({ workspaceId, agentId: null, prId, provider: 'openrouter', model: 'gpt-4.1', status: 'done' })
    .returning();
  await db.insert(t.runTraces).values({ runId: run!.id, trace: { hello: 'world' } });
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId: null,
      runId: run!.id,
      kind: 'review',
      verdict: 'approve',
      summary: 'summary',
      score: 90,
      model: 'gpt-4.1',
    })
    .returning();
  await db.insert(t.findings).values({
    reviewId: review!.id,
    file: 'src/foo.ts',
    startLine: 1,
    endLine: 1,
    severity: 'WARNING',
    category: 'bug',
    title: 'a finding',
    rationale: 'because',
    confidence: 0.9,
  });
  return { run: run!, review: review! };
}

d('DELETE /reviews/:id and DELETE /runs/:id — keep both tables in sync (Testcontainers pg)', () => {
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

  it('DELETE /reviews/:id also removes the matching agent_runs row (and its trace)', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: new MockGitHubClient({ pulls: [] }) } });
    const pr = await setupPr(pg.handle.db, workspaceId);
    const { run, review } = await setupRunAndReview(pg.handle.db, workspaceId, pr.id);

    const res = await app.inject({ method: 'DELETE', url: `/reviews/${review.id}` });
    expect(res.statusCode).toBe(200);

    const [runRow] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, run.id));
    expect(runRow).toBeUndefined(); // Timeline's tile for this run is gone too.
    const traceRows = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, run.id));
    expect(traceRows).toHaveLength(0); // cascades via agent_runs → run_traces FK.
    const findingRows = await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, review.id));
    expect(findingRows).toHaveLength(0);
  });

  it('DELETE /runs/:id also removes the matching review + its findings (regression guard)', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: new MockGitHubClient({ pulls: [] }) } });
    const pr = await setupPr(pg.handle.db, workspaceId);
    const { run, review } = await setupRunAndReview(pg.handle.db, workspaceId, pr.id);

    const res = await app.inject({ method: 'DELETE', url: `/runs/${run.id}` });
    expect(res.statusCode).toBe(200);

    const [reviewRow] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.id, review.id));
    expect(reviewRow).toBeUndefined(); // Review-runs section's card for this run is gone too.
    const findingRows = await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, review.id));
    expect(findingRows).toHaveLength(0);
  });
});
