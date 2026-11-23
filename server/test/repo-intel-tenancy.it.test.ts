import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('repo-intel routes are workspace-scoped (Testcontainers pg)', () => {
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

  const appWith = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({}) },
    });

  it('index-state and resync 404 for a repo that belongs to another workspace', async () => {
    const db = pg.handle.db;
    const app = await appWith();
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-tenant-ri' }).returning();
    const [foreign] = await db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'evil', name: 'corp', fullName: 'evil/corp' })
      .returning();
    const jobsBefore = (await db.select().from(t.jobs)).length;

    const state = await app.inject({ method: 'GET', url: `/repos/${foreign!.id}/index-state` });
    const resync = await app.inject({ method: 'POST', url: `/repos/${foreign!.id}/resync` });

    expect(state.statusCode).toBe(404);
    expect(resync.statusCode).toBe(404);
    // Rejected before enqueue: no job row was created for the foreign repo.
    expect((await db.select().from(t.jobs)).length).toBe(jobsBefore);
    await app.close();
  });

  it('index-state still works for a repo in the caller workspace', async () => {
    const db = pg.handle.db;
    const app = await appWith();
    const [own] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'own-repo', fullName: 'acme/own-repo' })
      .returning();

    const state = await app.inject({ method: 'GET', url: `/repos/${own!.id}/index-state` });
    expect(state.statusCode).toBe(200);
    await app.close();
  });
});
