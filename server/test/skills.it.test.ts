import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills module — CRUD + body-versioning over `skills`/`skill_versions`, and
 * the agent↔skill link endpoints (`/agents/:id/skills`) with the per-link
 * `enabled` flag added alongside `order`.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'No console.log',
    description: 'Flag stray console.log calls left in production code.',
    type: 'convention' as const,
    body: 'Never leave a console.log in a PR.',
  };

  it('create → list → get round-trips a skill', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: createBody.name,
      description: createBody.description,
      type: 'convention',
      source: 'manual',
      body: createBody.body,
      enabled: true,
      version: 1,
    });
    expect(typeof skill.created_at).toBe('string');

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((s: { id: string }) => s.id)).toContain(skill.id);

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ id: skill.id, name: createBody.name });
    await app.close();
  });

  it('updating the body bumps the version and appends a skill_versions row', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'Use the logger, never console.log.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ version: 2, body: 'Use the logger, never console.log.' });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      skill_id: skillId,
      version: 2,
      body: 'Use the logger, never console.log.',
    });
    expect(versions[1]).toMatchObject({ skill_id: skillId, version: 1, body: createBody.body });
    await app.close();
  });

  it('a metadata-only update does NOT bump the version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'No console.log (renamed)', enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      version: 1,
      name: 'No console.log (renamed)',
      enabled: false,
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('deletes a skill', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);
    await app.close();
  });

  it('404s for an unknown skill id', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${ghost}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('a skill in another workspace is invisible (cross-tenant 404)', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign skill',
        description: 'lives in another workspace',
        type: 'convention',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign!.id}` })).statusCode).toBe(
      404,
    );
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreign!.id}/versions` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('POST /agents/:id/skills (object form) persists per-link enabled and order; GET hydrates them', async () => {
    const app = await makeApp();

    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Skilled Agent',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json().id as string;

    const skillA = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'Skill A' },
      })
    ).json();
    const skillB = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'Skill B' },
      })
    ).json();

    const setRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skill_ids: [
          { id: skillA.id, enabled: true },
          { id: skillB.id, enabled: false },
        ],
      },
    });
    expect(setRes.statusCode).toBe(200);

    const links = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })
    ).json();
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      agent_id: agentId,
      skill_id: skillA.id,
      order: 0,
      enabled: true,
      name: 'Skill A',
      description: createBody.description,
      type: 'convention',
      source: 'manual',
      skill_enabled: true,
    });
    expect(links[1]).toMatchObject({
      agent_id: agentId,
      skill_id: skillB.id,
      order: 1,
      enabled: false,
      name: 'Skill B',
      skill_enabled: true,
    });
    await app.close();
  });
});
