import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('workspace (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('GET /workspace includes the connected GitHub user when a GitHub client is configured', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const body = (await app.inject({ method: 'GET', url: '/workspace' })).json();
    expect(body.github_user).toEqual({ login: 'octocat', avatar_url: null });
    await app.close();
  });

  it('GET /workspace returns github_user: null (not a thrown error) when GitHub is unavailable', async () => {
    // Force the same failure mode as "no token configured" deterministically
    // (this host may have a real GITHUB_TOKEN in its environment/secrets, so
    // asserting on ambient absence would be flaky) — a GitHubClient whose
    // call rejects exercises the exact try/catch path `container.github()`
    // throwing for a missing/invalid token would also hit.
    const failingGithub = new MockGitHubClient();
    failingGithub.getAuthenticatedUser = () => Promise.reject(new Error('bad credentials'));
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: failingGithub },
    });
    const res = await app.inject({ method: 'GET', url: '/workspace' });
    expect(res.statusCode).toBe(200);
    expect(res.json().github_user).toBeNull();
    await app.close();
  });
});
