/**
 * PR-list FINDINGS column — GET /repos/:id/pulls → PrMeta.findings.
 * The list shows the latest completed review's severity counts and every one of
 * its findings, previewed and bounded only by description length. An earlier
 * run's findings never leak once the latest run is clean or unreviewed.
 * Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('PR list FINDINGS column (Testcontainers pg)', () => {
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

  let repoSeq = 0;
  async function seedRepoWithPr() {
    const db = pg.handle.db;
    const name = `findings-list-${repoSeq++}`;
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
        title: 'PR 1',
        author: 'marisa.koch',
        branch: 'feat/1',
        base: 'main',
        headSha: 'sha-1',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function doneReview(prId: string, score: number) {
    const db = pg.handle.db;
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, status: 'done', tokensIn: 100, tokensOut: 50, costUsd: 0.01 })
      .returning();
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId, runId: run!.id, kind: 'review', verdict: 'approve', score })
      .returning();
    return review!;
  }

  async function addFinding(
    reviewId: string,
    overrides: Partial<{
      severity: string;
      category: string;
      title: string;
      file: string;
      startLine: number;
      confidence: number;
      rationale: string;
    }> = {},
  ) {
    const db = pg.handle.db;
    await db.insert(t.findings).values({
      reviewId,
      file: overrides.file ?? 'src/config.ts',
      startLine: overrides.startLine ?? 12,
      endLine: overrides.startLine ?? 12,
      severity: overrides.severity ?? 'WARNING',
      category: overrides.category ?? 'bug',
      title: overrides.title ?? 'A finding',
      rationale: overrides.rationale ?? 'Because of something.',
      confidence: overrides.confidence ?? 0.5,
    });
  }

  function app() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient() },
    });
  }

  async function findingsRow(server: Awaited<ReturnType<typeof app>>, repoId: string, prId: string) {
    const res = await server.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(res.statusCode).toBe(200);
    return (res.json() as PrMeta[]).find((p) => p.id === prId)!;
  }

  it("a PR carries its latest review's severity counts and total, not an earlier run's", async () => {
    const server = await app();
    const { repo, pr } = await seedRepoWithPr();
    const earlier = await doneReview(pr.id, 40);
    await addFinding(earlier.id, { severity: 'CRITICAL' });
    const latest = await doneReview(pr.id, 60);
    await addFinding(latest.id, { severity: 'CRITICAL' });
    await addFinding(latest.id, { severity: 'WARNING' });
    await addFinding(latest.id, { severity: 'WARNING' });

    const row = await findingsRow(server, repo.id, pr.id);
    expect(row.findings?.counts).toEqual({ CRITICAL: 1, WARNING: 2 });
    expect(row.findings?.total).toBe(3);

    await server.close();
  });

  it('carries every finding of the run, ordered by descending severity then confidence', async () => {
    const server = await app();
    const { repo, pr } = await seedRepoWithPr();
    const review = await doneReview(pr.id, 20);
    for (let i = 0; i < 12; i++) {
      await addFinding(review.id, {
        severity: i < 4 ? 'CRITICAL' : i < 9 ? 'WARNING' : 'SUGGESTION',
        confidence: 0.5 + (i % 5) / 100,
        title: `Finding ${i}`,
      });
    }

    const row = await findingsRow(server, repo.id, pr.id);
    expect(row.findings?.total).toBe(12);
    expect(row.findings?.previews).toHaveLength(12);
    expect(row.findings?.previews[0]?.severity).toBe('CRITICAL');
    expect(row.findings?.previews.at(-1)?.severity).toBe('SUGGESTION');

    await server.close();
  });

  it('a PR whose latest review found nothing carries no findings member', async () => {
    const server = await app();
    const { repo, pr } = await seedRepoWithPr();
    await doneReview(pr.id, 95);

    const row = await findingsRow(server, repo.id, pr.id);
    expect(row.findings ?? null).toBeNull();

    await server.close();
  });

  it('an earlier run that found problems does not surface once the latest run is clean', async () => {
    const server = await app();
    const { repo, pr } = await seedRepoWithPr();
    const earlier = await doneReview(pr.id, 30);
    await addFinding(earlier.id, { severity: 'CRITICAL' });
    await doneReview(pr.id, 95);

    const row = await findingsRow(server, repo.id, pr.id);
    expect(row.findings ?? null).toBeNull();

    await server.close();
  });

  it('abbreviates a description past 160 characters with an ellipsis', async () => {
    const server = await app();
    const { repo, pr } = await seedRepoWithPr();
    const review = await doneReview(pr.id, 50);
    await addFinding(review.id, { rationale: 'x'.repeat(200) });

    const row = await findingsRow(server, repo.id, pr.id);
    const description = row.findings?.previews[0]?.description ?? '';
    expect(description).toHaveLength(161);
    expect(description.endsWith('…')).toBe(true);

    await server.close();
  });
});
