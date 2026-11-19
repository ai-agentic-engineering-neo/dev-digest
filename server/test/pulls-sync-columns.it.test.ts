/**
 * specs/18 AC-35: PR sync persists pull_requests.base_sha, pr_files.status and
 * pr_files.previous_path (migration 0027) — from both the list upsert and the
 * detail refresh. Docker-gated like the other .it tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('PR sync persists base_sha / file status / previous_path', () => {
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

  it('list upsert writes base_sha; detail refresh writes status + previous_path', async () => {
    const db = pg.handle.db;
    const gh = new MockGitHubClient({
      pulls: [
        {
          number: 31, title: 'rename', author: 'a', branch: 'feat/x', base: 'main',
          head_sha: 'head31', base_sha: 'base31', additions: 0, deletions: 0, files_count: 0,
          status: 'open', opened_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
        },
      ],
      detail: {
        base_sha: 'base31',
        files: [
          { path: 'src/new.ts', additions: 1, deletions: 1, patch: '@@', status: 'renamed', previous_filename: 'src/old.ts' },
          { path: 'src/added.ts', additions: 3, deletions: 0, patch: '@@', status: 'added', previous_filename: null },
        ],
      },
    });
    const app = await buildApp({ config: config(), db, overrides: { github: gh } });
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'sync-cols', fullName: 'acme/sync-cols' })
      .returning();

    const list = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(list.statusCode).toBe(200);
    const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo!.id));
    expect(pr!.baseSha).toBe('base31');

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}` });
    expect(res.statusCode).toBe(200);
    const files = await db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath['src/new.ts']).toMatchObject({ status: 'renamed', previousPath: 'src/old.ts' });
    expect(byPath['src/added.ts']).toMatchObject({ status: 'added', previousPath: null });
    const [after] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr!.id));
    expect(after!.baseSha).toBe('base31');
  });
});
