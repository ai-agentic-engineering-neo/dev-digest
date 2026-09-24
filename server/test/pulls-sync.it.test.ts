/**
 * PR import/sync routes against a MockGitHubClient:
 *   GET /repos/:id/pulls — one multi-row upsert of GitHub's list + diff-stat
 *                          backfill (bounded concurrency), response shape intact.
 *   GET /pulls/:id       — files/commits mirrored transactionally (upsert +
 *                          delete-missing), no duplicates on repeated reads.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function listed(number: number, title: string): PrMeta {
  return {
    number,
    title,
    author: 'dev',
    branch: `b${number}`,
    base: 'main',
    head_sha: `sha${number}`,
    additions: 0,
    deletions: 0,
    files_count: 0,
    status: 'open',
    opened_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
  };
}

d('pulls sync routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRepo() {
    const name = `sync-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  it('GET /repos/:id/pulls upserts every listed PR, backfills stats, updates on resync', async () => {
    const repo = await newRepo();
    const pulls = Array.from({ length: 12 }, (_, i) => listed(i + 1, `PR ${i + 1}`));
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls }) },
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(12);
    expect(Object.keys(body[0]!).sort()).toEqual(
      [
        'id', 'number', 'title', 'author', 'branch', 'base', 'head_sha', 'additions', 'deletions',
        'files_count', 'status', 'opened_at', 'updated_at', 'score', 'cost_usd',
        'latest_review_id', 'findings_counts',
      ].sort(),
    );
    // Backfill is capped at 10 detail fetches per request (mock detail: 247/38/9).
    expect(body.filter((p) => p.additions === 247 && p.files_count === 9)).toHaveLength(10);
    await app.close();

    // Resync: GitHub-authoritative fields are refreshed on conflict, no dupes.
    const renamed = pulls.map((p) => ({ ...p, title: `${p.title} (edited)`, status: 'merged' as const }));
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: renamed }) },
    });
    await app2.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const rows = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.title.endsWith('(edited)') && r.status === 'merged')).toBe(true);
    // All 12 now have stats (the remaining 2 were backfilled on the second call).
    expect(rows.every((r) => r.additions === 247)).toBe(true);
    await app2.close();
  });

  it('GET /pulls/:id mirrors files/commits: updates kept rows, drops missing ones', async () => {
    const repo = await newRepo();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 5,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'h',
        status: 'open',
      })
      .returning();

    const detailV1 = {
      files: [
        { path: 'a.ts', additions: 1, deletions: 0, patch: '@@ v1' },
        { path: 'b.ts', additions: 2, deletions: 0, patch: '@@ v1' },
      ],
      commits: [
        { sha: 'c1', message: 'one', author: 'a', committed_at: null },
        { sha: 'c2', message: 'two', author: 'a', committed_at: null },
      ],
    };
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ detail: detailV1 }) },
    });
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr!.id}` })).statusCode).toBe(200);
    // A repeated read is idempotent (no duplicate rows).
    await app.inject({ method: 'GET', url: `/pulls/${pr!.id}` });
    expect(await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id))).toHaveLength(2);
    await app.close();

    const detailV2 = {
      files: [{ path: 'a.ts', additions: 5, deletions: 1, patch: '@@ v2' }],
      commits: [{ sha: 'c2', message: 'two (amended)', author: 'a', committed_at: null }],
    };
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ detail: detailV2 }) },
    });
    const res = await app2.inject({ method: 'GET', url: `/pulls/${pr!.id}` });
    expect(res.json().files).toEqual(detailV2.files);

    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    expect(files.map((f) => [f.path, f.additions, f.patch])).toEqual([['a.ts', 5, '@@ v2']]);
    const commits = await pg.handle.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr!.id));
    expect(commits.map((c) => [c.sha, c.message])).toEqual([['c2', 'two (amended)']]);
    await app2.close();
  });
});
