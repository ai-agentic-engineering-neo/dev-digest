/**
 * GET /repos/:id/pulls — multi-agent SCORE + FINDINGS rollup on the PR list.
 * Each agent's LATEST review counts; the score is the lowest of those, findings
 * are the open (non-dismissed) per-severity counts across them,
 * latest_review_ids names exactly those reviews (for the list's popover), and
 * the cost is the total over ALL agent runs on the PR (re-runs included).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('PR list multi-agent rollup (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('scores by the worst agent, counts open findings per agent\'s latest review, sums cost over all runs', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'rollup', fullName: 'acme/rollup' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 9,
        title: 'Multi-agent PR',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc',
        status: 'open',
      })
      .returning();

    const [security, perf] = [randomUUID(), randomUUID()];
    const at = (s: number) => new Date(Date.UTC(2026, 10, 22, 18, 15, s));
    const review = async (agentId: string, score: number, createdAt: Date) =>
      (
        await db
          .insert(t.reviews)
          .values({ workspaceId: ws!.id, prId: pr!.id, agentId, kind: 'review', score, createdAt })
          .returning()
      )[0]!;
    const finding = (reviewId: string, severity: string, dismissed = false) => ({
      reviewId,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity,
      category: 'security',
      title: `${severity} finding`,
      rationale: 'r',
      confidence: 0.9,
      dismissedAt: dismissed ? new Date() : null,
    });

    const staleSecurity = await review(security, 5, at(1)); // superseded by the re-run below
    const secReview = await review(security, 0, at(5));
    const perfReview = await review(perf, 100, at(6)); // newest overall — must NOT win
    await db.insert(t.findings).values([
      finding(staleSecurity.id, 'CRITICAL'), // ignored: older review
      finding(secReview.id, 'CRITICAL'),
      finding(secReview.id, 'CRITICAL', true), // ignored: dismissed
      finding(secReview.id, 'WARNING'),
      finding(perfReview.id, 'SUGGESTION'),
    ]);

    // Every run counts toward cost — including the superseded security run;
    // the failed run recorded no cost and adds nothing.
    await db.insert(t.agentRuns).values([
      { workspaceId: ws!.id, prId: pr!.id, status: 'done', costUsd: 0.001, ranAt: at(1) },
      { workspaceId: ws!.id, prId: pr!.id, status: 'done', costUsd: 0.002, ranAt: at(5) },
      { workspaceId: ws!.id, prId: pr!.id, status: 'done', costUsd: 0.0005, ranAt: at(6) },
      { workspaceId: ws!.id, prId: pr!.id, status: 'failed', costUsd: null, ranAt: at(7) },
    ]);

    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const row = (res.json() as PrMeta[]).find((p) => p.number === 9)!;

    expect(row.score).toBe(0);
    expect(row.findings).toEqual({ critical: 1, warning: 1, suggestion: 1 });
    expect(row.cost_usd).toBeCloseTo(0.0035, 10);
    expect(new Set(row.latest_review_ids)).toEqual(new Set([secReview.id, perfReview.id]));
    await app.close();
  });
});
