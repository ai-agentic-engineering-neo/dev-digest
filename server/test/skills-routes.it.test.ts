import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildZip } from './helpers/zip.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-routes] Docker not available — skipping integration tests.');
}

/**
 * Skills end to end over Postgres: seed (agents + linked skills), CRUD with
 * versioning, import preview → confirm, agent linking (incl. cross-workspace
 * rejection), and the executor's prompt-skill resolution (enabled only, link
 * order, imported = untrusted).
 */
d('skills routes', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
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

  async function agentId(name: string): Promise<string> {
    const [a] = await pg.handle.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, name)));
    return a!.id;
  }

  it('seed creates both new agents with their skills linked in order (idempotent)', async () => {
    await seed(pg.handle.db); // re-run must not duplicate
    const repo = new SkillsRepository(pg.handle.db);
    const tq = await repo.promptSkillsForAgent(workspaceId, await agentId('Test Quality Reviewer'));
    expect(tq.map((s) => s.name)).toEqual([
      'untested-branches',
      'boundary-cases',
      'over-mocking',
      'flaky-test-patterns',
    ]);
    const api = await repo.promptSkillsForAgent(workspaceId, await agentId('API Contract Reviewer'));
    expect(api.map((s) => s.name)).toEqual(['breaking-change', 'response-schema', 'semver-discipline']);
    expect(api.every((s) => s.trusted)).toBe(true);
    const all = await repo.list(workspaceId);
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length);
  });

  it('re-seed retires replaced seed skills only while they are unedited', async () => {
    const repo = new SkillsRepository(pg.handle.db);
    const base = { workspaceId, description: 'old', type: 'rubric' as const, source: 'manual' as const, body: 'old' };
    await repo.insert({ ...base, name: 'route-breaking-changes' });
    const edited = await repo.insert({ ...base, name: 'zod-contract-drift' });
    await repo.update(workspaceId, edited.id, { body: 'my edits' }); // v2 → user-owned
    await seed(pg.handle.db);
    expect(await repo.getByName(workspaceId, 'route-breaking-changes')).toBeUndefined();
    expect(await repo.getByName(workspaceId, 'zod-contract-drift')).toMatchObject({ version: 2 });
    await repo.delete(workspaceId, edited.id);
  });

  it('CRUD: create → edit bumps version + history → toggle keeps version → delete', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'it-skill', description: 'Use in tests.', type: 'custom', body: 'v1 body' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(created.json()).toMatchObject({ source: 'manual', version: 1, enabled: true });

    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'it-skill', description: 'x', type: 'custom', body: 'x' },
    });
    expect(dup.statusCode).toBe(409);

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: 'v2 body', note: '  Tightened scope rule  ' },
    });
    expect(edited.json().version).toBe(2);
    // A note alone is not an update.
    expect((await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { note: 'x' } })).statusCode).toBe(422);
    const toggled = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    expect(toggled.json()).toMatchObject({ version: 2, enabled: false });

    const versions = await app.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(versions.json().map((v: { version: number; body: string; note: string }) => [v.version, v.body, v.note])).toEqual([
      [2, 'v2 body', 'Tightened scope rule'],
      [1, 'v1 body', 'Initial version'],
    ]);

    // Restore = a new version with the old body; history is never rewritten.
    const restored = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: 'v1 body', note: 'Restored from v1' },
    });
    expect(restored.json()).toMatchObject({ version: 3, body: 'v1 body' });
    const after = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(after.map((v: { version: number; note: string }) => [v.version, v.note])).toEqual([
      [3, 'Restored from v1'],
      [2, 'Tightened scope rule'],
      [1, 'Initial version'],
    ]);
    const plain = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { description: 'Use in tests!' } });
    expect(plain.json().version).toBe(4);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json()[0].note).toBe('Updated');

    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('import: preview saves nothing, ignores executables; confirm saves an untrusted skill', async () => {
    const app = await makeApp();
    const zip = buildZip([
      { name: 'api-versioning/SKILL.md', content: '---\nname: api-versioning\ndescription: Use on route changes.\ntype: rubric\n---\nNew major → /v2.' },
      { name: 'api-versioning/scripts/run.sh', content: 'rm -rf /', mode: 0o755 },
    ]);
    const upload = { filename: 'api-versioning.zip', content_base64: zip.toString('base64') };

    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const preview = await app.inject({ method: 'POST', url: '/skills/import/preview', payload: upload });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ name: 'api-versioning', type: 'rubric', body: 'New major → /v2.' });
    expect(preview.json().files).toContainEqual(
      expect.objectContaining({ path: 'api-versioning/scripts/run.sh', status: 'ignored' }),
    );
    expect((await app.inject({ method: 'GET', url: '/skills' })).json().length).toBe(before);

    const saved = await app.inject({ method: 'POST', url: '/skills/import', payload: upload });
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toMatchObject({ name: 'api-versioning', source: 'community' });

    // link it after the trusted ones; disable one trusted skill → it drops out
    const agent = await agentId('API Contract Reviewer');
    const links = (await app.inject({ method: 'GET', url: `/agents/${agent}/skills` })).json() as {
      skill_id: string;
    }[];
    const ids = [...links.map((l) => l.skill_id), saved.json().id];
    const set = await app.inject({ method: 'POST', url: `/agents/${agent}/skills`, payload: { skill_ids: ids } });
    expect(set.statusCode).toBe(200);
    await app.inject({ method: 'PUT', url: `/skills/${ids[1]}`, payload: { enabled: false } });

    const resolved = await new SkillsRepository(pg.handle.db).promptSkillsForAgent(workspaceId, agent);
    expect(resolved.map((s) => [s.name, s.trusted])).toEqual([
      ['breaking-change', true],
      ['semver-discipline', true],
      ['api-versioning', false],
    ]);
    const usage = (await app.inject({ method: 'GET', url: '/skills/usage' })).json();
    expect(usage[saved.json().id]).toBe(1);
    await app.close();
  });

  it('agent linking rejects skills from another workspace and duplicates', async () => {
    const app = await makeApp();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: other!.id, name: 'foreign', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    const agent = await agentId('General Reviewer');
    const res = await app.inject({ method: 'POST', url: `/agents/${agent}/skills`, payload: { skill_id: foreign!.id } });
    expect(res.statusCode).toBe(404);

    const own = (await app.inject({ method: 'GET', url: '/skills' })).json()[0].id;
    const dup = await app.inject({ method: 'POST', url: `/agents/${agent}/skills`, payload: { skill_ids: [own, own] } });
    expect(dup.statusCode).toBe(422);
    await app.close();
  });
});
