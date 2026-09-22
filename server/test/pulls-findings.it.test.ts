import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * The PR list's FINDINGS column: a per-severity tally across EVERY review run
 * of the PR, with dismissed findings excluded (the column answers "what is
 * still outstanding"). `null` means never reviewed — the same "—" signal the
 * SCORE ring uses — and must stay distinguishable from a reviewed PR that has
 * nothing left, which is {0,0,0}.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

d('PR list findings breakdown (Testcontainers pg)', () => {
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

  /** A repo with `count` PRs; `number` keeps them distinct inside the repo. */
  async function repoWithPrs(count = 1) {
    const name = `findings-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const prs = [];
    for (let i = 0; i < count; i++) {
      const [pr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number: i + 1,
          title: 'Add rate limiting',
          author: 'marisa.koch',
          branch: `feat/rl-${i}`,
          base: 'main',
          headSha: 'a1b2c3d4',
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'open',
        })
        .returning();
      prs.push(pr!);
    }
    return { repo: repo!, prs, pr: prs[0]! };
  }

  async function insertReview(
    prId: string,
    kind: 'review' | 'summary' = 'review',
  ): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind, verdict: 'request_changes', score: 61 })
      .returning({ id: t.reviews.id });
    return row!.id;
  }

  async function insertFinding(
    reviewId: string,
    severity: string,
    values: Partial<typeof t.findings.$inferInsert> = {},
  ) {
    await pg.handle.db.insert(t.findings).values({
      reviewId,
      file: 'src/config.ts',
      startLine: 12,
      endLine: 12,
      severity,
      category: 'security',
      title: `A ${severity} finding`,
      rationale: 'because',
      confidence: 0.9,
      ...values,
    });
  }

  /** The single PR row the list returns for `repoId`. */
  async function listOne(a: Awaited<ReturnType<typeof app>>, repoId: string) {
    const rows = (await a.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    return rows[0];
  }

  it('sums the breakdown across every review run of the PR', async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const first = await insertReview(pr.id);
    await insertFinding(first, 'CRITICAL');
    await insertFinding(first, 'WARNING');
    // A second agent (or a re-run) adds to the same PR's tally.
    const second = await insertReview(pr.id);
    await insertFinding(second, 'CRITICAL');
    await insertFinding(second, 'SUGGESTION');

    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 2,
      warning: 1,
      suggestion: 1,
    });

    await a.close();
  });

  it('excludes dismissed findings, and drops the count rather than the PR', async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const review = await insertReview(pr.id);
    await insertFinding(review, 'CRITICAL');
    await insertFinding(review, 'CRITICAL', { dismissedAt: new Date() });
    await insertFinding(review, 'WARNING', { dismissedAt: new Date() });

    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 1,
      warning: 0,
      suggestion: 0,
    });

    await a.close();
  });

  it("counts a 'summary' review's findings too — GET /pulls/:id/reviews does not filter kind", async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const summary = await insertReview(pr.id, 'summary');
    await insertFinding(summary, 'WARNING');

    // Were the query to filter kind='review', the PR page would list a finding
    // the list column never counted.
    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 0,
      warning: 1,
      suggestion: 0,
    });

    await a.close();
  });

  it('a reviewed PR with nothing outstanding is {0,0,0}, not null', async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const review = await insertReview(pr.id);
    await insertFinding(review, 'CRITICAL', { dismissedAt: new Date() });

    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 0,
      warning: 0,
      suggestion: 0,
    });

    await a.close();
  });

  it('a PR that was never reviewed is null, so the cell reads "—"', async () => {
    const a = await app();
    const { repo } = await repoWithPrs();

    expect((await listOne(a, repo.id)).findings_counts).toBeNull();

    await a.close();
  });

  it("does not leak another PR's findings into the tally", async () => {
    const a = await app();
    const { repo, prs } = await repoWithPrs(2);
    const mine = await insertReview(prs[0]!.id);
    await insertFinding(mine, 'CRITICAL');
    const theirs = await insertReview(prs[1]!.id);
    await insertFinding(theirs, 'WARNING');
    await insertFinding(theirs, 'SUGGESTION');

    const rows = (await a.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const byNumber = new Map<number, { findings_counts: unknown }>(
      rows.map((r: { number: number }) => [r.number, r] as const),
    );
    expect(byNumber.get(1)!.findings_counts).toEqual({ critical: 1, warning: 0, suggestion: 0 });
    expect(byNumber.get(2)!.findings_counts).toEqual({ critical: 0, warning: 1, suggestion: 1 });

    await a.close();
  });
});
