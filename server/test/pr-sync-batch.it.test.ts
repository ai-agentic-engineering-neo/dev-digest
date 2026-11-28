/**
 * DB-5: the PR-list sync and settings save are one statement each; opened_at is
 * kept once set; saveDetail rewrites files only when the head moved.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { PullsRepository } from '../src/modules/pulls/repository.js';
import { SettingsRepository } from '../src/modules/settings/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

function meta(number: number, over: Partial<PrMeta> = {}): PrMeta {
  return {
    number,
    title: `pr ${number}`,
    author: 'a',
    branch: 'feat',
    base: 'main',
    head_sha: 'sha1',
    additions: 0,
    deletions: 0,
    files_count: 0,
    status: 'needs_review',
    opened_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...over,
  } as PrMeta;
}

function detail(sha: string, paths: string[]): PrDetail {
  return {
    ...meta(1, { head_sha: sha }),
    id: 'ignored',
    body: 'body',
    files: paths.map((path) => ({ path, additions: 1, deletions: 0, patch: '@@' })),
    commits: [{ sha, message: 'm', author: 'a', committed_at: null }],
  } as PrDetail;
}

d('PR-list sync and detail save', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'sync', fullName: 'acme/sync' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('upserts many PRs at once, updates base, and keeps the first opened_at', async () => {
    const repo = new PullsRepository(pg.handle.db);
    await repo.upsertFromGitHub(workspaceId, repoId, [meta(1), meta(2), meta(3)]);
    await repo.upsertFromGitHub(workspaceId, repoId, [
      meta(1, { title: 'renamed', base: 'develop', head_sha: 'sha2', opened_at: '2030-01-01T00:00:00.000Z' }),
      meta(4),
    ]);
    const rows = await repo.listForRepo(repoId);
    expect(rows).toHaveLength(4);
    const one = rows.find((r) => r.number === 1)!;
    expect(one.title).toBe('renamed');
    expect(one.base).toBe('develop');
    expect(one.headSha).toBe('sha2');
    expect(one.openedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('fills a null opened_at from a later sync', async () => {
    const repo = new PullsRepository(pg.handle.db);
    await repo.upsertFromGitHub(workspaceId, repoId, [meta(9, { opened_at: null })]);
    await repo.upsertFromGitHub(workspaceId, repoId, [meta(9)]);
    const row = (await repo.listForRepo(repoId)).find((r) => r.number === 9)!;
    expect(row.openedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('saveDetail loads files first, skips them on the same head, rewrites on a force-push', async () => {
    const db = pg.handle.db;
    const repo = new PullsRepository(db);
    await repo.upsertFromGitHub(workspaceId, repoId, [meta(20, { head_sha: 'a1' })]);
    const pr = (await repo.listForRepo(repoId)).find((r) => r.number === 20)!;
    const ids = async () =>
      (await db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id))).map((f) => f.id).sort();

    await repo.saveDetail(pr.id, detail('a1', ['x.ts', 'y.ts']));
    const first = await ids();
    expect(first).toHaveLength(2);

    await repo.saveDetail(pr.id, { ...detail('a1', ['x.ts', 'y.ts']), body: 'edited' });
    expect(await ids()).toEqual(first);
    expect((await repo.getById(workspaceId, pr.id))!.body).toBe('edited');

    // force-push: the list sync moves head_sha first, then the detail arrives
    await repo.upsertFromGitHub(workspaceId, repoId, [meta(20, { head_sha: 'b2' })]);
    await repo.saveDetail(pr.id, detail('b2', ['z.ts']));
    const files = await repo.filesAndCommits(pr.id);
    expect(files.files.map((f) => f.path)).toEqual(['z.ts']);
    expect(files.commits.map((c) => c.sha)).toEqual(['b2']);
  });
});

d('settings put', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('writes several keys in one call and overwrites existing ones', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [user] = await db.select().from(t.users);
    const repo = new SettingsRepository(db);
    await repo.put(ws!.id, user!.id, { a: 1, b: 'x' });
    await repo.put(ws!.id, user!.id, { b: 'y', c: { k: true } });
    expect(await repo.get(ws!.id)).toMatchObject({ a: 1, b: 'y', c: { k: true } });
  });
});
