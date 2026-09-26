/**
 * PR list FINDINGS column — the per-severity tally over each agent's LATEST
 * review, against a real Postgres.
 *
 * For every agent that ever ran on the PR only its newest review counts, and the
 * agents are then summed: re-running one agent replaces that agent's
 * contribution instead of stacking on it. This is deliberately NOT the COST
 * column's lifetime model. Reviews and findings are inserted directly (no LLM, no
 * executor), so the arithmetic is exact and the route's own aggregation is what
 * is under test.
 *
 * The distinction that keeps mattering here is the mirror image of cost's:
 * a reviewed PR with no findings is a real all-zero tally, while a PR that was
 * never reviewed is null — "nothing is known".
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
async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `findings-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

let prSeq = 0;
async function addPr(db: PgFixture['handle']['db'], workspaceId: string, repoId: string) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number: 400 + prSeq++,
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
  return pr!;
}

d('PR list findings rollup (Testcontainers pg)', () => {
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

  let agentA: string;
  let agentB: string;
  beforeAll(async () => {
    const rows = await pg.handle.db
      .insert(t.agents)
      .values(
        ['Findings Agent A', 'Findings Agent B'].map((name) => ({
          workspaceId,
          name,
          provider: 'openai' as const,
          model: 'test',
          systemPrompt: 'test',
        })),
      )
      .returning();
    agentA = rows[0]!.id;
    agentB = rows[1]!.id;
  });

  /** Reviews are inserted oldest-first; an explicit, increasing timestamp keeps "latest" deterministic. */
  let clock = Date.UTC(2026, 0, 1);

  /** One review with the given findings; `extra` patches every finding row. */
  async function addReview(
    prId: string,
    severities: string[],
    agentId: string | null,
    extra: Partial<typeof t.findings.$inferInsert> = {},
  ) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'seeded by the test',
        score: 61,
        model: 'test',
        createdAt: new Date((clock += 60_000)),
      })
      .returning();
    if (severities.length > 0) {
      await pg.handle.db.insert(t.findings).values(
        severities.map((severity, i) => ({
          reviewId: review!.id,
          file: 'src/config.ts',
          startLine: i + 1,
          endLine: i + 1,
          severity,
          category: 'security',
          title: `finding ${i}`,
          rationale: 'because',
          confidence: 0.9,
          ...extra,
        })),
      );
    }
    return review!;
  }

  async function listedCounts(repoId: string, prId: string) {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    await app.close();
    return list.find((p: { id: string }) => p.id === prId).findings_by_severity;
  }

  it('counts only the latest review of an agent that ran several times', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(pr.id, ['CRITICAL', 'WARNING'], agentA);
    await addReview(pr.id, ['CRITICAL', 'SUGGESTION', 'SUGGESTION'], agentA);

    expect(await listedCounts(repo.id, pr.id)).toEqual({
      CRITICAL: 1,
      WARNING: 0,
      SUGGESTION: 2,
    });
  });

  it('sums each agent\'s latest review: 1 run of A (3) + 3 runs of B (last 4) = 7', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(pr.id, ['WARNING', 'WARNING', 'SUGGESTION'], agentA);
    await addReview(pr.id, ['CRITICAL'], agentB);
    await addReview(pr.id, ['CRITICAL', 'CRITICAL'], agentB);
    await addReview(pr.id, ['CRITICAL', 'WARNING', 'SUGGESTION', 'SUGGESTION'], agentB);

    const counts = await listedCounts(repo.id, pr.id);
    expect(counts).toEqual({ CRITICAL: 1, WARNING: 3, SUGGESTION: 3 });
    expect(counts.CRITICAL + counts.WARNING + counts.SUGGESTION).toBe(7);
  });

  it('re-running one agent replaces only its own contribution', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    // Round 1: both agents. Round 2: only agent B again.
    await addReview(pr.id, ['CRITICAL', 'CRITICAL'], agentA);
    await addReview(pr.id, ['WARNING', 'WARNING', 'WARNING'], agentB);
    await addReview(pr.id, ['SUGGESTION'], agentB);

    // A keeps its round-1 result; B is replaced by its round-2 result.
    expect(await listedCounts(repo.id, pr.id)).toEqual({
      CRITICAL: 2,
      WARNING: 0,
      SUGGESTION: 1,
    });
  });

  it('an agent whose latest RUN failed still counts its last review', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(pr.id, ['CRITICAL', 'WARNING'], agentA);
    // A later run of the same agent failed: an agent_run row, but no review.
    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId,
      agentId: agentA,
      prId: pr.id,
      status: 'failed',
      error: 'boom',
      ranAt: new Date((clock += 60_000)),
    });

    expect(await listedCounts(repo.id, pr.id)).toEqual({
      CRITICAL: 1,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });

  it('collapses reviews with no agent into one bucket, newest wins', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(pr.id, ['CRITICAL', 'CRITICAL'], null);
    await addReview(pr.id, ['WARNING'], null);

    expect(await listedCounts(repo.id, pr.id)).toEqual({
      CRITICAL: 0,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });

  it('counts accepted and dismissed findings too — it reports what was FOUND', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(pr.id, ['CRITICAL'], agentA, { dismissedAt: new Date() });
    await addReview(pr.id, ['WARNING'], agentB, { acceptedAt: new Date() });

    expect(await listedCounts(repo.id, pr.id)).toEqual({
      CRITICAL: 1,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });

  it('is all-zero for a PR that was reviewed and came back clean', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(pr.id, [], agentA);

    expect(await listedCounts(repo.id, pr.id)).toEqual({
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
    });
  });

  it('is all-zero when the agent\'s latest review is clean, even if an older one was not', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(pr.id, ['CRITICAL'], agentA);
    await addReview(pr.id, [], agentA);

    expect(await listedCounts(repo.id, pr.id)).toEqual({
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
    });
  });

  it('is null — not all-zero — for a PR that was never reviewed', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id);

    expect(await listedCounts(repo.id, pr.id)).toBeNull();
  });

  it('keeps two PRs in the same repo apart, even for the same agent', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const loud = await addPr(pg.handle.db, workspaceId, repo.id);
    const quiet = await addPr(pg.handle.db, workspaceId, repo.id);
    await addReview(loud.id, ['CRITICAL', 'CRITICAL', 'WARNING'], agentA);
    await addReview(quiet.id, ['SUGGESTION'], agentA);

    expect(await listedCounts(repo.id, loud.id)).toEqual({
      CRITICAL: 2,
      WARNING: 1,
      SUGGESTION: 0,
    });
    expect(await listedCounts(repo.id, quiet.id)).toEqual({
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 1,
    });
  });
});
