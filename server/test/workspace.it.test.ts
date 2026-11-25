import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// Route → service → repository against real Postgres: the response shape of
// GET /workspace and GET/PUT /settings is unchanged by the repository split.
d('Workspace + settings routes (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('GET /workspace lists the seeded repo in the summary shape', async () => {
    const cfg = config();
    const app = await buildApp({ config: cfg, db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'GET', url: '/workspace' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cloneDir).toBe(cfg.cloneDir);
    expect(typeof body.workspaceId).toBe('string');
    const repo = body.repos.find((r: { full_name: string }) => r.full_name === 'acme/payments-api');
    expect(repo).toBeDefined();
    expect(Object.keys(repo).sort()).toEqual(['clone_path', 'cloned', 'full_name', 'id', 'last_polled_at']);
    expect(repo.cloned).toBe(Boolean(repo.clone_path));
    await app.close();
  });

  it('PUT /settings upserts and GET /settings returns the stored keys', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const put = await app.inject({ method: 'PUT', url: '/settings', payload: { theme: 'light', polling_interval_min: 7 } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ theme: 'light', polling_interval_min: 7 });
    // Second write to the same key updates in place (no duplicate row).
    await app.inject({ method: 'PUT', url: '/settings', payload: { theme: 'dark' } });
    const get = await app.inject({ method: 'GET', url: '/settings' });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ theme: 'dark', polling_interval_min: 7 });
    await app.close();
  });

  it('GET /settings/secrets-status still returns exactly the four booleans', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'GET', url: '/settings/secrets-status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['anthropic', 'github', 'openai', 'openrouter']);
    expect(Object.values(body).every((v) => typeof v === 'boolean')).toBe(true);
    await app.close();
  });
});
