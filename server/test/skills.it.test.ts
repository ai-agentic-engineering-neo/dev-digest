import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const createBody = {
  name: 'uncovered-branches',
  description: 'Flag new production paths with no asserting test.',
  type: 'custom' as const,
  body: '# Uncovered branches\nRequire an assertion per new branch.',
};

d('skills CRUD', () => {
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

  it('POST /skills creates a row, writes skill_versions v1, and GET list includes it', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: createBody.name,
      description: createBody.description,
      type: 'custom',
      source: 'manual',
      body: createBody.body,
      enabled: true,
      version: 1,
    });

    const listed = await app.inject({ method: 'GET', url: '/skills' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const one = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().id).toBe(skill.id);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, body: createBody.body, note: null });
    await app.close();
  });

  it('GET /skills/:id 404s for an unknown id and a skill in another workspace', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'skills-other' }).returning();
    const foreign = await new SkillsRepository(pg.handle.db).insert({
      workspaceId: otherWs!.id,
      name: 'foreign-skill',
      description: 'Not in the default workspace.',
      type: 'custom',
      source: 'manual',
      body: '# Foreign\nStay out.',
    });
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('PUT with empty description or body is 422', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;

    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { description: '' } }))
        .statusCode,
    ).toBe(422);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: '' } })).statusCode,
    ).toBe(422);
    await app.close();
  });

  it('PUT body (or type) bumps version and snapshots; optional note is stored', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'bump-me' },
    });
    const id = created.json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Uncovered branches\nAlso flag catch blocks.', note: 'Added catch-block rule' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    expect(updated.json().body).toContain('catch blocks');

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id));
    expect(versions).toHaveLength(2);
    const v2 = versions.find((v) => v.version === 2);
    expect(v2?.note).toBe('Added catch-block rule');
    expect(v2?.body).toContain('catch blocks');

    const typed = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { type: 'rubric' },
    });
    expect(typed.statusCode).toBe(200);
    expect(typed.json().version).toBe(3);
    await app.close();
  });

  it('PUT { enabled } does not bump version and adds no snapshot', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'toggle-me' },
    });
    const id = created.json().id as string;

    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().enabled).toBe(false);
    expect(toggled.json().version).toBe(1);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id));
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('DELETE removes the row (follow-up GET is 404)', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'delete-me' },
      })
    ).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);

    const leftover = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id));
    expect(leftover).toHaveLength(0);
    await app.close();
  });
});
