import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** GitHub unreachable — exercises the detail route's offline (persisted) branch
 *  and keeps the list route from syncing anything. */
function offlineGithub(): MockGitHubClient {
  const gh = new MockGitHubClient();
  gh.listPullRequests = () => Promise.reject(new Error('offline'));
  gh.getPullRequest = () => Promise.reject(new Error('offline'));
  return gh;
}

// The PR list derives a REVIEW status (needs_review / reviewed / stale); the
// detail page used to return GitHub's raw MERGE state ("open"), so the same PR
// read "Reviewed" in the list and "Needs review" on its own page.
d('PR review status — list and detail agree (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setupPr(opts: { lastReviewedSha: string | null; headSha?: string }) {
    const name = `detail-status-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 700 + seq,
        title: 'Status PR',
        author: 'tester',
        branch: 'feat/x',
        base: 'main',
        headSha: opts.headSha ?? 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open', // GitHub merge state, as the list sync persists it
        lastReviewedSha: opts.lastReviewedSha,
        updatedAt: new Date(), // recent → not stale
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function statuses(app: Awaited<ReturnType<typeof buildApp>>, repoId: string, prId: string) {
    const detail = (await app.inject({ method: 'GET', url: `/pulls/${prId}` })).json();
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    const listed = list.find((p: { id: string }) => p.id === prId);
    return { detail: detail.status as string, list: listed.status as string };
  }

  it('offline: a PR reviewed at its current head reads "reviewed" on BOTH screens (the reported bug)', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: offlineGithub() } });
    const { repo, pr } = await setupPr({ lastReviewedSha: 'a1b2c3d4' });
    expect(await statuses(app, repo.id, pr.id)).toEqual({ detail: 'reviewed', list: 'reviewed' });
    await app.close();
  });

  it('offline: a never-reviewed PR reads "needs_review" on both screens — never the raw "open"', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: offlineGithub() } });
    const { repo, pr } = await setupPr({ lastReviewedSha: null });
    expect(await statuses(app, repo.id, pr.id)).toEqual({ detail: 'needs_review', list: 'needs_review' });
    await app.close();
  });

  it('GitHub refresh: reviewed head → "reviewed" on both screens', async () => {
    // MockGitHubClient's detail reports head_sha 'a1b2c3d4', matching the review.
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: new MockGitHubClient() } });
    const { repo, pr } = await setupPr({ lastReviewedSha: 'a1b2c3d4' });
    expect(await statuses(app, repo.id, pr.id)).toEqual({ detail: 'reviewed', list: 'reviewed' });
    await app.close();
  });

  it('GitHub refresh: head moved since the review → "needs_review", and the list agrees afterwards', async () => {
    const gh = new MockGitHubClient({ detail: { head_sha: 'new-head-sha' } });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { repo, pr } = await setupPr({ lastReviewedSha: 'a1b2c3d4' });
    // The detail refresh persists the fresh head, so the list (read after it)
    // derives from the same data instead of the stale reviewed head.
    expect(await statuses(app, repo.id, pr.id)).toEqual({ detail: 'needs_review', list: 'needs_review' });
    await app.close();
  });
});
