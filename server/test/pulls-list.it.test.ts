/**
 * GET /repos/:id/pulls — cross-run aggregation. The list shows the LOWEST
 * score, the WORST status, and the summed per-severity FINDINGS across each
 * AGENT's LATEST completed review on a PR — re-running an agent supersedes
 * its prior pass rather than stacking a stale run's findings/score on top of
 * a fresh one, while a different agent still contributes its own latest
 * review alongside it. Gated on Docker (needs Postgres), matching the other
 * integration tests.
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

let repoSeq = 0;
async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `agg-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function insertPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  repoId: string,
  number: number,
) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number,
      title: `PR #${number}`,
      author: 'marisa.koch',
      branch: `feat/pr-${number}`,
      base: 'main',
      headSha: 'headsha',
      lastReviewedSha: 'headsha',
      additions: 10,
      deletions: 2,
      filesCount: 1,
      status: 'open',
      updatedAt: new Date(),
    })
    .returning();
  return pr!;
}

async function insertReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  opts: { score: number; verdict: string; severities: string[]; agentId?: string | null; createdAt?: Date },
) {
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId: opts.agentId ?? null,
      runId: null,
      kind: 'review',
      verdict: opts.verdict,
      summary: 'summary',
      score: opts.score,
      model: 'gpt-4.1',
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning();
  for (const severity of opts.severities) {
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/foo.ts',
      startLine: 1,
      endLine: 1,
      severity,
      category: 'bug',
      title: `${severity} finding`,
      rationale: 'because',
      confidence: 0.9,
    });
  }
  return review!;
}

async function insertRun(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  opts: { status: 'done' | 'failed' | 'cancelled' | 'running'; costUsd: number | null },
) {
  await db.insert(t.agentRuns).values({
    workspaceId,
    agentId: null,
    prId,
    provider: 'openrouter',
    model: 'gpt-4.1',
    status: opts.status,
    costUsd: opts.costUsd,
  });
}

d('GET /repos/:id/pulls — cross-run aggregation (Testcontainers pg)', () => {
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

  it('score = lowest across runs, findings = summed across runs', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 1);

    await insertReview(pg.handle.db, workspaceId, pr.id, {
      score: 90,
      verdict: 'approve',
      severities: ['WARNING'],
    });
    await insertReview(pg.handle.db, workspaceId, pr.id, {
      score: 40,
      verdict: 'comment',
      severities: ['CRITICAL', 'WARNING', 'WARNING'],
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row).toBeTruthy();
    expect(row!.score).toBe(40);
    expect(row!.findings).toEqual({ critical: 1, warning: 3, suggestion: 0 });
  });

  it('re-running the SAME agent supersedes its prior review — only the latest counts, not both', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 7);
    const agentId = crypto.randomUUID();

    // First pass: bad score, 2 criticals, requested changes.
    await insertReview(pg.handle.db, workspaceId, pr.id, {
      agentId,
      score: 20,
      verdict: 'request_changes',
      severities: ['CRITICAL', 'CRITICAL'],
      createdAt: new Date('2026-06-01T00:00:00Z'),
    });
    // Re-run of the SAME agent, later: clean.
    await insertReview(pg.handle.db, workspaceId, pr.id, {
      agentId,
      score: 95,
      verdict: 'approve',
      severities: [],
      createdAt: new Date('2026-06-02T00:00:00Z'),
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    // The stale 20/request_changes/2-criticals pass must NOT be counted
    // alongside the fresh 95/approve/clean one.
    expect(row!.score).toBe(95);
    expect(row!.status).not.toBe('changes_requested');
    expect(row!.findings).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });

  it('re-running a DIFFERENT agent still contributes its own latest review alongside others', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 8);
    const agentA = crypto.randomUUID();
    const agentB = crypto.randomUUID();

    // Agent A re-run: stale bad pass superseded by a clean one.
    await insertReview(pg.handle.db, workspaceId, pr.id, {
      agentId: agentA,
      score: 10,
      verdict: 'request_changes',
      severities: ['CRITICAL'],
      createdAt: new Date('2026-06-01T00:00:00Z'),
    });
    await insertReview(pg.handle.db, workspaceId, pr.id, {
      agentId: agentA,
      score: 95,
      verdict: 'approve',
      severities: [],
      createdAt: new Date('2026-06-02T00:00:00Z'),
    });
    // Agent B: only ran once, with a warning — should still be counted.
    await insertReview(pg.handle.db, workspaceId, pr.id, {
      agentId: agentB,
      score: 80,
      verdict: 'comment',
      severities: ['WARNING'],
      createdAt: new Date('2026-06-01T12:00:00Z'),
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    // Lowest score across the two agents' LATEST reviews: min(95, 80) = 80.
    expect(row!.score).toBe(80);
    expect(row!.findings).toEqual({ critical: 0, warning: 1, suggestion: 0 });
  });

  it('status = changes_requested when any completed run requested changes, even with a fresh head', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 2);

    await insertReview(pg.handle.db, workspaceId, pr.id, {
      score: 95,
      verdict: 'approve',
      severities: [],
    });
    await insertReview(pg.handle.db, workspaceId, pr.id, {
      score: 20,
      verdict: 'request_changes',
      severities: ['CRITICAL'],
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row!.status).toBe('changes_requested');
  });

  it('cost = summed across every DONE run on the PR', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 4);

    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'done', costUsd: 0.014 });
    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'done', costUsd: 0.02 });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row!.cost_usd).toBeCloseTo(0.034, 10);
  });

  it('cost ignores failed/cancelled/running runs — only DONE runs count', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 5);

    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'done', costUsd: 0.05 });
    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'failed', costUsd: 999 });
    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'cancelled', costUsd: 999 });
    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'running', costUsd: null });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row!.cost_usd).toBeCloseTo(0.05, 10);
  });

  it('cost is null (unknown) if ANY done run has an unpriced/unknown cost, not silently undercounted', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 6);

    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'done', costUsd: 0.03 });
    await insertRun(pg.handle.db, workspaceId, pr.id, { status: 'done', costUsd: null });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row!.cost_usd).toBeNull();
  });

  it('a PR with no reviews has null score/findings and a needs_review status', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await insertPr(pg.handle.db, workspaceId, repo.id, 3);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row!.score).toBeNull();
    expect(row!.findings ?? null).toBeNull();
    expect(row!.status).toBe('reviewed'); // fresh head (lastReviewedSha === headSha), no verdict yet
  });
});
