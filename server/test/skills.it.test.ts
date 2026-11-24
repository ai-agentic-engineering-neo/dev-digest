import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW = { verdict: 'approve', summary: 'ok', score: 90, findings: [] };

d('skills module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW }) },
      },
    });
  }

  const skillBody = (name: string, extra: object = {}) => ({
    name,
    description: `${name} description`,
    type: 'rubric' as const,
    body: `${name} body`,
    ...extra,
  });

  it('CRUD + version bump only when body changes', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: skillBody('crud') });
    expect(created.statusCode).toBe(201);
    const sk = created.json();
    expect(sk).toMatchObject({ source: 'manual', enabled: true, version: 1 });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.find((s: { id: string }) => s.id === sk.id).agent_count).toBe(0);

    const toggled = (
      await app.inject({
        method: 'PUT',
        url: `/skills/${sk.id}`,
        payload: { enabled: false, name: 'crud2', description: 'd2', type: 'security' },
      })
    ).json();
    expect(toggled).toMatchObject({ enabled: false, name: 'crud2', version: 1 });

    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${sk.id}`, payload: { body: 'new body' } })
    ).json();
    expect(edited.version).toBe(2);
    // same body again → no bump
    const same = (
      await app.inject({ method: 'PUT', url: `/skills/${sk.id}`, payload: { body: 'new body' } })
    ).json();
    expect(same.version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${sk.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[1].body).toBe('crud body');

    const del = await app.inject({ method: 'DELETE', url: `/skills/${sk.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${sk.id}` })).statusCode).toBe(404);
  });

  it('restore appends a new version with the old body and keeps history', async () => {
    const app = await makeApp();
    const sk = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody('restore') })).json();
    await app.inject({ method: 'PUT', url: `/skills/${sk.id}`, payload: { body: 'second' } });
    await app.inject({ method: 'PUT', url: `/skills/${sk.id}`, payload: { body: 'third' } });

    const res = await app.inject({ method: 'POST', url: `/skills/${sk.id}/versions/1/restore` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 4, body: 'restore body' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${sk.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([4, 3, 2, 1]);
    expect(versions[3].body).toBe('restore body'); // v1 untouched
    expect(versions[2].body).toBe('second');

    // restoring the body that is already current changes nothing
    const again = await app.inject({ method: 'POST', url: `/skills/${sk.id}/versions/4/restore` });
    expect(again.json().version).toBe(4);
    const same = await app.inject({ method: 'POST', url: `/skills/${sk.id}/versions/1/restore` });
    expect(same.json().version).toBe(4);
  });

  it('restore 404s for an unknown version, 422s for a bad one, and is workspace-scoped', async () => {
    const app = await makeApp();
    const sk = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody('restore-404') })).json();
    expect((await app.inject({ method: 'POST', url: `/skills/${sk.id}/versions/99/restore` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/skills/${sk.id}/versions/abc/restore` })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: `/skills/${sk.id}/versions/0/restore` })).statusCode).toBe(422);

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws-restore' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: other!.id, name: 'foreign-r', description: 'x', type: 'custom', source: 'manual', body: 'x' })
      .returning();
    await pg.handle.db.insert(t.skillVersions).values({ skillId: foreign!.id, version: 1, body: 'x' });
    expect((await app.inject({ method: 'POST', url: `/skills/${foreign!.id}/versions/1/restore` })).statusCode).toBe(404);
  });

  it('is workspace-isolated and rejects linking a foreign skill (404)', async () => {
    const app = await makeApp();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: other!.id,
        name: 'foreign',
        description: 'x',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === foreign!.id)).toBe(false);
    for (const [method, url] of [
      ['GET', `/skills/${foreign!.id}`],
      ['GET', `/skills/${foreign!.id}/versions`],
      ['DELETE', `/skills/${foreign!.id}`],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreign!.id}`, payload: { enabled: false } }))
        .statusCode,
    ).toBe(404);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'A-iso', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();
    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [foreign!.id] },
    });
    expect(set.statusCode).toBe(404);
    const link = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: foreign!.id },
    });
    expect(link.statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agent.id))).toHaveLength(0);
  });

  it('import preview parses a zip and persists nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const zip = zipSync({
      'flaky/SKILL.md': strToU8('---\nname: imp\ndescription: d\ntype: custom\n---\nbody'),
      'flaky/scripts/detect.sh': strToU8('echo hi'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'flaky.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'imp', ignored_files: ['flaky/scripts/detect.sh'] });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.zip', content_base64: Buffer.from('nope').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
  });

  it('agent list reports skill_count; a run injects only enabled skills in link order', async () => {
    const app = await makeApp();
    const mk = async (name: string, extra: object = {}) =>
      (await app.inject({ method: 'POST', url: '/skills', payload: skillBody(name, extra) })).json();
    const s1 = await mk('first-skill');
    const s2 = await mk('second-skill');
    const off = await mk('disabled-skill', { enabled: false });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'A-run', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();
    // link order: second, disabled, first
    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [s2.id, off.id, s1.id] },
    });
    expect(set.statusCode).toBe(200);
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(agents.find((a: { id: string }) => a.id === agent.id).skill_count).toBe(3);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-run', fullName: 'acme/skills-run' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    const runId = res.json().runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const skills: string = trace.prompt_assembly.skills;
    expect(skills).toContain('### Skill: second-skill');
    expect(skills).toContain('### Skill: first-skill');
    expect(skills).not.toContain('disabled-skill');
    expect(skills.indexOf('second-skill')).toBeLessThan(skills.indexOf('first-skill'));
    expect(trace.prompt_assembly.prompt_tokens.skills).toBeGreaterThan(0);
    expect(trace.prompt_assembly.prompt_tokens.system).toBeGreaterThan(0);
  });
});
