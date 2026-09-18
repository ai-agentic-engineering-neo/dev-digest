import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('pulls list — findings_by_severity (Testcontainers pg)', () => {
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
  async function setupRepoAndPr() {
    const name = `findings-severity-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + repoSeq,
        title: 'Test PR',
        author: 'tester',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function insertReview(prId: string, createdAt: Date) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', verdict: 'comment', score: 80, createdAt })
      .returning();
    return review!;
  }

  async function insertFinding(reviewId: string, severity: string, opts: { dismissedAt?: Date } = {}) {
    await pg.handle.db.insert(t.findings).values({
      reviewId,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity,
      category: 'bug',
      title: `${severity} finding`,
      rationale: 'r',
      confidence: 0.9,
      dismissedAt: opts.dismissedAt ?? null,
    });
  }

  it('reflects only the PR\'s LATEST review\'s active findings, not older reviews', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, pr } = await setupRepoAndPr();

    const older = await insertReview(pr.id, new Date('2026-01-01T00:00:00Z'));
    await insertFinding(older.id, 'CRITICAL');
    await insertFinding(older.id, 'CRITICAL');

    const latest = await insertReview(pr.id, new Date('2026-01-02T00:00:00Z'));
    await insertFinding(latest.id, 'WARNING');

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.findings_by_severity).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });

    await app.close();
  });

  it('is all-zero (not absent) when the latest review exists but found nothing', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, pr } = await setupRepoAndPr();
    await insertReview(pr.id, new Date());

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.findings_by_severity).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });

    await app.close();
  });

  it('is absent (not present at all) when the PR has no review yet', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, pr } = await setupRepoAndPr();

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect('findings_by_severity' in listedPr).toBe(false);

    await app.close();
  });

  it('excludes dismissed findings from the count', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, pr } = await setupRepoAndPr();
    const review = await insertReview(pr.id, new Date());
    await insertFinding(review.id, 'CRITICAL', { dismissedAt: new Date() });
    await insertFinding(review.id, 'CRITICAL');

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });

    await app.close();
  });

  it('a summary-kind review never counts toward the score or the findings breakdown', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, pr } = await setupRepoAndPr();
    const review = await insertReview(pr.id, new Date('2026-01-01T00:00:00Z'));
    await insertFinding(review.id, 'CRITICAL');

    // A newer 'summary' row must not shadow the 'review' row above.
    await pg.handle.db.insert(t.reviews).values({
      workspaceId,
      prId: pr.id,
      kind: 'summary',
      score: null,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(listedPr.score).toBe(80);

    await app.close();
  });
});
