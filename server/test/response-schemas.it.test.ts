import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Routes now declare response schemas, so the serializer rejects (500) any body
 * that does not match its contract. This covers the routes no other integration
 * test reaches: each must answer 2xx with the contract's shape.
 */
d('response schemas: routes not covered elsewhere', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('serves workspace, index-state, resync, refresh, active runs, models and skills', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const server = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    app = server;

    const added = await server.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/acme/schemas' },
    });
    const repoId = added.json().id as string;
    await server.container.jobs.onIdle();

    const ws = await server.inject({ method: 'GET', url: '/workspace' });
    expect(ws.statusCode).toBe(200);
    expect(ws.json().repos.some((r: { id: string }) => r.id === repoId)).toBe(true);

    // The clone job already indexed the (mock) repo; either way the body is a RepoIntelState.
    const state = await server.inject({ method: 'GET', url: `/repos/${repoId}/index-state` });
    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({ repoId });
    expect(['full', 'partial', 'degraded', 'failed']).toContain(state.json().status);
    expect(typeof state.json().updatedAt).toBe('string');

    const resync = await server.inject({ method: 'POST', url: `/repos/${repoId}/resync` });
    expect(resync.statusCode).toBe(202);
    expect(resync.json().status).toBe('accepted');

    const refresh = await server.inject({ method: 'POST', url: `/repos/${repoId}/refresh` });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toEqual({ status: 'refreshing' });
    await server.container.jobs.onIdle();

    const pulls = await server.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const prId = pulls.json()[0].id as string;
    const active = await server.inject({ method: 'GET', url: `/pulls/${prId}/runs/active` });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toEqual([]);

    const agents = await server.inject({ method: 'GET', url: '/agents' });
    const agentId = agents.json()[0].id as string;
    for (const url of [`/agents/${agentId}/skills`, `/agents/${agentId}/models`, '/providers/openai/models']) {
      const res = await server.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(Array.isArray(res.json()), url).toBe(true);
    }

    const del = await server.inject({ method: 'DELETE', url: `/repos/${repoId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: repoId });
  });
});
