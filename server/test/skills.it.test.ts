import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + version history. Mirrors agents-versions.it.test.ts: the only
 * thing that bumps `skills.version` and appends to `skill_versions` is a
 * `body` change — enabled toggles and name/description/type edits do not.
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
    name: 'PR Review Rubric',
    type: 'rubric' as const,
    body: '# Rubric\n\nCheck for X.',
    source: 'manual' as const,
  };

  it('POST /skills creates a skill at version 1 with one snapshot', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'PR Review Rubric',
      type: 'rubric',
      source: 'manual',
      body: '# Rubric\n\nCheck for X.',
      enabled: true,
      version: 1,
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ skill_id: skill.id, version: 1, body: createBody.body });
    await app.close();
  });

  it('a body edit bumps the version and appends a snapshot (newest first)', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# Rubric v2\n\nCheck for Y.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('# Rubric v2\n\nCheck for Y.');
    expect(versions[1].body).toBe(createBody.body);
    await app.close();
  });

  it('toggling enabled does NOT create a new version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(1);
    expect(updated.json().enabled).toBe(false);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('a name/description/type edit does NOT create a new version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'Renamed Rubric', description: 'New description', type: 'convention' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      name: 'Renamed Rubric',
      description: 'New description',
      type: 'convention',
      version: 1,
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('setting the same body again does NOT bump the version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: createBody.body },
    });
    expect(updated.json().version).toBe(1);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('GET /skills lists, DELETE removes it (and cascades its versions)', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listed.some((s: { id: string }) => s.id === skillId)).toBe(true);

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(deleted.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);

    const { db } = pg.handle;
    const remainingVersions = await db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId));
    expect(remainingVersions).toHaveLength(0);
    await app.close();
  });

  it('404s for an unknown skill', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/skills/${ghost}`, payload: {} })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'DELETE', url: `/skills/${ghost}` })).statusCode).toBe(404);
    await app.close();
  });

  it('skills are workspace-scoped: another tenant cannot read or edit them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      type: 'security',
      source: 'manual',
      body: 'x',
    });

    const service = new SkillsService({ db } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    expect(await service.get(otherWs!.id, foreign.id)).toBeDefined();
    expect(await service.get(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
  });

  it('POST /skills/import never writes to the DB', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const content = Buffer.from('# Imported\n\nSome body.').toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'notes.md', content_base64: content },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'Imported',
      type: 'custom',
      source: 'imported_url',
      body: '# Imported\n\nSome body.',
      evidence_files: [],
    });

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    expect(after).toBe(before);
    await app.close();
  });
});
