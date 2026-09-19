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
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD (specs/02-skills.md §7.1): workspace scoping, the 409 on a
 * duplicate name, the version-bump predicate (body edit bumps, enable toggle
 * does not), version history + restore-forward, and the delete cascade into
 * `agent_skills`.
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

  function uniqueName(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const baseBody = (name: string) => ({
    name,
    description: 'A test skill',
    type: 'convention' as const,
    body: 'Always check for null.',
  });

  it('creates and reads back a skill with a real token_estimate', async () => {
    const app = await makeApp();
    const name = uniqueName('create-me');
    const res = await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name,
      description: 'A test skill',
      type: 'convention',
      source: 'manual',
      enabled: true,
      version: 1,
    });
    expect(typeof skill.token_estimate).toBe('number');
    expect(skill.token_estimate).toBeGreaterThan(0);

    const getRes = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toMatchObject({ id: skill.id, name });

    await app.close();
  });

  it('GET /skills lists workspace skills with used_by', async () => {
    const app = await makeApp();
    const name = uniqueName('listed');
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) })
    ).json();

    const listRes = await app.inject({ method: 'GET', url: '/skills' });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    const found = list.find((s: { id: string }) => s.id === created.id);
    expect(found).toMatchObject({ name, used_by: 0 });

    await app.close();
  });

  it('rejects a non-slug name at the edge (422)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: baseBody('Not A Slug!'),
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('409s on a duplicate name within the same workspace', async () => {
    const app = await makeApp();
    const name = uniqueName('dup');
    const first = await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) });
    expect(second.statusCode).toBe(409);

    await app.close();
  });

  it('409s on a PUT rename that collides with an existing name', async () => {
    const app = await makeApp();
    const nameA = uniqueName('rename-a');
    const nameB = uniqueName('rename-b');
    const a = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(nameA) })
    ).json();
    await app.inject({ method: 'POST', url: '/skills', payload: baseBody(nameB) });

    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${a.id}`,
      payload: { name: nameB },
    });
    expect(res.statusCode).toBe(409);

    await app.close();
  });

  it('a body edit bumps the version and writes a skill_versions row; toggling enabled does neither', async () => {
    const app = await makeApp();
    const name = uniqueName('bump');
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) })
    ).json();
    expect(created.version).toBe(1);

    // Body edit -> v2, with an author's note.
    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'Also check for undefined.', version_message: 'Cover undefined too' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      skill_id: created.id,
      version: 2,
      body: 'Also check for undefined.',
      message: 'Cover undefined too',
    });
    expect(versions[1]).toMatchObject({ version: 1, message: null });

    // Toggling `enabled` alone -> NOT a config change: no version bump, no new row.
    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().version).toBe(2);
    expect(toggled.json().enabled).toBe(false);

    const versionsAfterToggle = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versionsAfterToggle).toHaveLength(2);

    await app.close();
  });

  it('a blank version_message is stored as NULL, not an empty string', async () => {
    const app = await makeApp();
    const name = uniqueName('blank-msg');
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) })
    ).json();

    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'Edited body', version_message: '   ' },
    });
    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions[0].message).toBeNull();

    await app.close();
  });

  it('GET /skills/:id/versions/:version returns one snapshot; restore writes forward, never rewrites history', async () => {
    const app = await makeApp();
    const name = uniqueName('restore');
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'v2 body' },
    });

    const v1 = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: baseBody(name).body });

    // Restore v1 forward -> creates v3 with v1's body, labelled, and v1/v2 are untouched.
    const restored = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { restore_from_version: 1 },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: baseBody(name).body });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ version: 3, message: 'Restored from v1', body: baseBody(name).body });
    expect(versions[1]).toMatchObject({ version: 2, body: 'v2 body' });
    expect(versions[2]).toMatchObject({ version: 1, body: baseBody(name).body });

    await app.close();
  });

  it('404s for an unknown skill and an unknown version', async () => {
    const app = await makeApp();
    const name = uniqueName('unknown-checks');
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) })
    ).json();
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/99` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/skills/${ghost}`, payload: { body: 'x' } })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'DELETE', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}/agents` })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}/stats` })).statusCode).toBe(
      404,
    );

    await app.close();
  });

  it('a skill created in another workspace is a 404 here (workspace scoping)', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'foreign-skill',
        description: 'desc',
        type: 'convention',
        source: 'manual',
        body: 'body',
      })
      .returning();

    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign!.id}` })).statusCode).toBe(
      404,
    );
    expect(
      (await app.inject({ method: 'DELETE', url: `/skills/${foreign!.id}` })).statusCode,
    ).toBe(404);

    await app.close();
  });

  it('GET /skills/:id/agents lists the agents currently linking it', async () => {
    const app = await makeApp();
    const name = uniqueName('linked');
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) })
    ).json();
    const agentRes = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: uniqueName('Agent For Skill'),
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review.',
      },
    });
    const agentId = agentRes.json().id as string;
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId: skill.id, order: 0 });

    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/agents` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: agentId, name: agentRes.json().name }]);

    await app.close();
  });

  it('DELETE hard-deletes and cascades into agent_skills', async () => {
    const app = await makeApp();
    const name = uniqueName('cascade');
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) })
    ).json();
    const agentRes = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: uniqueName('Cascade Agent'),
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review.',
      },
    });
    const agentId = agentRes.json().id as string;
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId: skill.id, order: 0 });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(
      404,
    );
    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skill.id));
    expect(links).toHaveLength(0);

    await app.close();
  });

  it('POST /skills/import parses a plain .md upload and never persists anything', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const content = '---\ndescription: An imported rule\n---\n# Imported Rule\n\nBody text.';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'imported-rule.md', content_b64: Buffer.from(content).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'imported-rule',
      description: 'An imported rule',
      source: 'imported_file',
    });
    const after = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(after).toHaveLength(before.length);

    await app.close();
  });

  it('POST /skills/import de-dupes the derived name against skills that already exist', async () => {
    const app = await makeApp();
    const name = uniqueName('collide');
    await app.inject({ method: 'POST', url: '/skills', payload: baseBody(name) });

    const content = `# ${name}\n\nBody text.`;
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'x.md', content_b64: Buffer.from(content).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).not.toBe(name);
    expect(res.json().name.startsWith(name)).toBe(true);

    await app.close();
  });
});
