import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkspaceInfo } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /workspace (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns a payload that matches the WorkspaceInfo contract', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'GET', url: '/workspace' });
    expect(res.statusCode).toBe(200);
    const body = WorkspaceInfo.parse(res.json());
    expect(body.cloneDir).toBe(app.container.config.cloneDir);
    for (const r of body.repos) expect(r.cloned).toBe(r.clone_path !== null);
    await app.close();
  });
});
