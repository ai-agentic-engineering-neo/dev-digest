/**
 * PR list sync + PR detail (GET /repos/:id/pulls, /repos/:id/pulls/:number,
 * /pulls/:id) against a real Postgres. Covers the pulls service/repository:
 * multi-row upsert on re-sync, detail refresh replacing files/commits, the
 * offline fallback, and that a failed detail refresh is rolled back atomically.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrDetail, PrMeta, RepoRef } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function pr(number: number, title: string): PrMeta {
  return {
    number,
    title,
    author: 'marisa.koch',
    branch: `feat/${number}`,
    base: 'main',
    head_sha: `sha${number}`,
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: 'open',
    opened_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T03:00:00Z',
  };
}

/** GitHub that lists PRs fine but can't serve detail (offline / rate-limited). */
class DetailOfflineGitHub extends MockGitHubClient {
  override async getPullRequest(_repo: RepoRef, _n: number): Promise<PrDetail> {
    throw new Error('network down');
  }
}

let repoSeq = 0;

d('pulls list + detail (Testcontainers pg)', () => {
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

  async function newRepo() {
    const name = `detail-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  async function filesOf(prId: string) {
    return pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  it('re-sync upserts every PR in one go and updates titles', async () => {
    const repo = await newRepo();
    const first = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: [pr(1, 'one'), pr(2, 'two')] }) },
    });
    const a = await first.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(a.statusCode).toBe(200);
    expect(a.json().map((p: PrMeta) => p.number).sort()).toEqual([1, 2]);
    await first.close();

    const second = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: [pr(1, 'one (renamed)'), pr(2, 'two')] }) },
    });
    const b = await second.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const list = b.json() as PrMeta[];
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.number === 1)!.title).toBe('one (renamed)');
    await second.close();
  });

  it('GET /repos/:id/pulls/:number returns the detail and persists files once', async () => {
    const repo = await newRepo();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: [pr(482, 'rate limit')] }) },
    });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const prId = list[0]!.id as string;

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/482` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(prId);
    expect(res.json().files).toHaveLength(1);

    // Refreshing again replaces, never duplicates.
    await app.inject({ method: 'GET', url: `/pulls/${prId}` });
    expect(await filesOf(prId)).toHaveLength(1);
    await app.close();
  });

  it('GET /repos/:id/pulls/:number → 404 unknown number, 422 non-numeric', async () => {
    const repo = await newRepo();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
    const missing = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/999` });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/abc` });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('serves the persisted detail when GitHub detail is unavailable', async () => {
    const repo = await newRepo();
    const online = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: [pr(5, 'five')] }) },
    });
    await online.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const detail = (await online.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/5` })).json();
    await online.close();

    const offline = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new DetailOfflineGitHub({ pulls: [pr(5, 'five')] }) },
    });
    const res = await offline.inject({ method: 'GET', url: `/pulls/${detail.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().files.map((f: { path: string }) => f.path)).toEqual(['src/config.ts']);
    expect(res.json().body).toBe('Add rate limiting. Closes #471.');
    await offline.close();
  });

  it('a failed detail refresh rolls back — previously persisted files survive', async () => {
    const repo = await newRepo();
    const good = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: [pr(9, 'nine')] }) },
    });
    await good.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const { id: prId } = (await good.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/9` })).json();
    await good.close();
    expect(await filesOf(prId)).toHaveLength(1);

    // A detail payload whose file row violates NOT NULL (path) — the insert
    // fails AFTER the delete inside the same transaction.
    const broken = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient({
          pulls: [pr(9, 'nine')],
          detail: {
            files: [{ path: null as unknown as string, additions: 1, deletions: 0, patch: null }],
          },
        }),
      },
    });
    const res = await broken.inject({ method: 'GET', url: `/pulls/${prId}` });
    expect(res.statusCode).toBe(200); // falls back to the persisted detail
    expect(await filesOf(prId)).toHaveLength(1);
    expect(res.json().files.map((f: { path: string }) => f.path)).toEqual(['src/config.ts']);
    await broken.close();
  });
});
