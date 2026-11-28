import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * M2 skills routes against Postgres: CRUD, the version bump and its snapshot,
 * toggles that write no version, restore to v+1, the duplicate name, the
 * cross-workspace 404, the delete cascade, and the two-step import (the
 * preview persists nothing, the confirm sets the source).
 */
d('skills routes', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const input = (name: string) => ({
    name,
    description: 'Flag every TODO the diff adds without an issue link.',
    type: 'convention' as const,
    body: 'A TODO needs an issue link.',
  });
  const versionRows = async (skillId: string) =>
    pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skillId));

  it('creates v1, bumps on a content change, and writes no version on toggles', async () => {
    const created = await app.inject({ method: 'POST', url: '/skills', payload: input('todo-gate') });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ version: 1, source: 'manual', agent_count: 0, enabled: true });
    expect(await versionRows(skill.id)).toHaveLength(1);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/skills/${skill.id}`,
      payload: { body: 'A TODO needs an issue link like #123.', note: 'Show an example' },
    });
    expect(edited.json().version).toBe(2);
    const v2 = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/2` })).json();
    expect(v2).toMatchObject({
      version: 2,
      name: 'todo-gate',
      type: 'convention',
      body: 'A TODO needs an issue link like #123.',
      note: 'Show an example',
    });

    await app.inject({ method: 'PATCH', url: `/skills/${skill.id}`, payload: { enabled: false } });
    const toggled = await app.inject({
      method: 'PATCH',
      url: `/skills/${skill.id}/enabled`,
      payload: { enabled: true },
    });
    expect(toggled.json()).toMatchObject({ version: 2, enabled: true });
    expect(await versionRows(skill.id)).toHaveLength(2);

    const one = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(one.token_count).toBeGreaterThan(0);
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.find((s: { id: string }) => s.id === skill.id).token_count).toBeUndefined();

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });

  it('restores v1 of a v3 skill as v4; restoring the current version answers 400', async () => {
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: input('restore-me') })).json().id;
    await app.inject({ method: 'PATCH', url: `/skills/${id}`, payload: { body: 'second' } });
    await app.inject({ method: 'PATCH', url: `/skills/${id}`, payload: { body: 'third' } });

    const restored = await app.inject({ method: 'POST', url: `/skills/${id}/versions/1/restore` });
    expect(restored.json()).toMatchObject({ version: 4, body: 'A TODO needs an issue link.' });
    const v4 = (await app.inject({ method: 'GET', url: `/skills/${id}/versions/4` })).json();
    expect(v4.note).toBe('Restored from v1');

    const current = await app.inject({ method: 'POST', url: `/skills/${id}/versions/4/restore` });
    expect(current.statusCode).toBe(400);
    expect(current.json().error.code).toBe('skill_version_current');
    const unknown = await app.inject({ method: 'POST', url: `/skills/${id}/versions/9/restore` });
    expect(unknown.statusCode).toBe(404);
  });

  it('a taken name answers 400 skill_name_taken', async () => {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: input('pr-quality-rubric') });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('skill_name_taken');
  });

  it('a skill from another workspace answers 404 on every /skills/:id route', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const foreign = await new SkillsRepository(pg.handle.db).insert({
      workspaceId: other!.id,
      ...input('foreign-skill'),
      source: 'manual',
    });
    const base = `/skills/${foreign.id}`;
    const calls = [
      { method: 'GET', url: base },
      { method: 'PATCH', url: base, payload: { body: 'x' } },
      { method: 'PATCH', url: `${base}/enabled`, payload: { enabled: false } },
      { method: 'GET', url: `${base}/versions` },
      { method: 'GET', url: `${base}/versions/1` },
      { method: 'POST', url: `${base}/versions/1/restore` },
      { method: 'DELETE', url: base },
    ] as const;
    for (const c of calls) {
      const res = await app.inject(c);
      expect(res.statusCode, `${c.method} ${c.url}`).toBe(404);
    }
  });

  it('deleting a skill removes its links and versions', async () => {
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: input('delete-me') })).json().id;
    const agentId = (await app.inject({ method: 'GET', url: '/agents' })).json()[0].id;
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: id } });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.json()).toEqual({ ok: true });
    expect(await versionRows(id)).toHaveLength(0);
    const links = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.skillId, id));
    expect(links).toHaveLength(0);
  });

  it('the import preview persists nothing; the confirm saves with source imported_file', async () => {
    const before = (await pg.handle.db.select({ id: t.skills.id }).from(t.skills)).length;
    const zip = zipSync({
      'SKILL.md': strToU8('---\nname: imported-gate\ndescription: Flag X.\ntype: security\n---\nBody.'),
      'run.sh': strToU8('echo hi'),
      'img.png': new Uint8Array(64),
    });
    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'gate.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ name: 'imported-gate', type: 'security', body: 'Body.' });
    expect(preview.json().skipped_files).toEqual(
      expect.arrayContaining([
        { path: 'run.sh', size: 7 },
        { path: 'img.png', size: 64 },
      ]),
    );
    expect((await pg.handle.db.select({ id: t.skills.id }).from(t.skills)).length).toBe(before);

    const { name, description, type, body } = preview.json();
    const saved = await app.inject({ method: 'POST', url: '/skills/import', payload: { name, description, type, body } });
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toMatchObject({ source: 'imported_file', version: 1 });
  });

  it('the preview route accepts a body over the global 1 MB limit', async () => {
    const md = Buffer.alloc(900 * 1024, 'a').toString('base64'); // ~1.2 MB of base64
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'big.md', content_base64: md },
    });
    // Past the body limit; refused by the 256 KB entry rule, not by Fastify (413).
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('import_entry_too_large');
  });

  it('a non-base64 payload is refused by the route schema before the service decodes it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'rules.md', content_base64: 'not base64 at all!' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });
});
