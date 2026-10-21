import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockAuthProvider, MockEmbedder, MockGitClient, MockSecretsProvider, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[project-context] Docker not available — skipping integration tests.');

const FILES = {
  'specs/a.md': '# A\nspec text',
  'docs/b.md': '# B\ndoc text',
  'docs/big.md': 'x'.repeat(200_001),
};

/** SPEC-01 link tables, versioning, scoping and cascades against a real Postgres. */
d('project context attachments (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx', fullName: 'acme/ctx', clonePath: '/x' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = (auth?: MockAuthProvider) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        ...(auth ? { auth } : {}),
        embedder: new MockEmbedder(),
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: FILES, head: 'abcdef12' }),
      },
    });

  async function newAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json() as { id: string; version: number };
  }
  async function newSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: 'd', type: 'custom', body: 'body' },
      })
    ).json() as { id: string; version: number };
  }
  const put = (app: Awaited<ReturnType<typeof makeApp>>, kind: 'agents' | 'skills', id: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/${kind}/${id}/context`, payload: { repo_id: repoId, paths } });
  const versions = async (agentId: string) =>
    pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agentId));

  it('agent: stores ordered paths; a changed list bumps the version and snapshots; an identical one is a no-op (AC-13, 15, 16, 17, EC-16)', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'ctx-agent');
    const first = await put(app, 'agents', agent.id, ['specs/a.md', 'docs/b.md']);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual([
      { path: 'specs/a.md', order: 0, missing: false, too_large: false },
      { path: 'docs/b.md', order: 1, missing: false, too_large: false },
    ]);
    const after1 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(after1.version).toBe(agent.version + 1);
    const snap = (await versions(agent.id)).find((v) => v.version === after1.version)!;
    expect((snap.configJson as { context: Record<string, string[]> }).context).toEqual({
      [repoId]: ['specs/a.md', 'docs/b.md'],
    });

    // identical PUT twice: no bump, no new snapshot
    await put(app, 'agents', agent.id, ['specs/a.md', 'docs/b.md']);
    const same = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(same.version).toBe(after1.version);

    // reorder bumps again
    await put(app, 'agents', agent.id, ['docs/b.md', 'specs/a.md']);
    const reordered = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(reordered.version).toBe(after1.version + 1);
    const got = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repoId}` })).json();
    expect(got.map((g: { path: string }) => g.path)).toEqual(['docs/b.md', 'specs/a.md']);
    await app.close();
  });

  it('skill: stores ordered paths without bumping the version or writing a skill_versions row (AC-14, 18)', async () => {
    const app = await makeApp();
    const skill = await newSkill(app, 'ctx-skill');
    const before = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id));
    const res = await put(app, 'skills', skill.id, ['docs/b.md', 'specs/a.md']);
    expect(res.statusCode).toBe(200);
    const after = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id));
    expect(after).toHaveLength(before.length);
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(row!.version).toBe(skill.version);
    const got = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/context?repo_id=${repoId}` })).json();
    expect(got.map((g: { path: string }) => g.path)).toEqual(['docs/b.md', 'specs/a.md']);
    await app.close();
  });

  it('rejects duplicate, unknown and too large paths with 422 and changes nothing (AC-6, 16)', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'ctx-agent-422');
    for (const paths of [['specs/a.md', 'specs/a.md'], ['nope.md'], ['docs/big.md']]) {
      expect((await put(app, 'agents', agent.id, paths)).statusCode).toBe(422);
    }
    const got = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repoId}` })).json();
    expect(got).toEqual([]);
    await app.close();
  });

  it('listing carries usage counts per document (AC-26)', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'ctx-agent-usage');
    const skill = await newSkill(app, 'ctx-skill-usage');
    await put(app, 'agents', agent.id, ['specs/a.md']);
    await put(app, 'skills', skill.id, ['specs/a.md']);
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json() as Array<{
      path: string;
      agent_count: number;
      skill_count: number;
      agents_using: number;
      too_large: boolean;
    }>;
    const a = list.find((f) => f.path === 'specs/a.md')!;
    expect(a.agent_count).toBeGreaterThanOrEqual(1);
    expect(a.skill_count).toBeGreaterThanOrEqual(1);
    // the new agent is enabled and attaches the path directly, so it counts once
    expect(a.agents_using).toBeGreaterThanOrEqual(1);
    // a document nobody attaches has no users
    expect(list.find((f) => f.path === 'docs/big.md')!.agents_using).toBe(0);
    expect(list.find((f) => f.path === 'docs/big.md')!.too_large).toBe(true);
    await app.close();
  });

  it('is workspace scoped: another workspace gets 404 for the agent, skill and repo (TC-5)', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'ctx-agent-scope');
    const skill = await newSkill(app, 'ctx-skill-scope');
    const foreign = await makeApp(new MockAuthProvider(undefined, { id: '99999999-9999-4999-8999-999999999999', name: 'other' }));
    expect((await put(foreign, 'agents', agent.id, [])).statusCode).toBe(404);
    expect((await put(foreign, 'skills', skill.id, [])).statusCode).toBe(404);
    expect((await foreign.inject({ method: 'GET', url: `/repos/${repoId}/context` })).statusCode).toBe(404);
    expect((await foreign.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repoId}` })).statusCode).toBe(404);
    await foreign.close();
    await app.close();
  });

  it('link rows are deleted with their agent, skill and repository (AC-19)', async () => {
    const app = await makeApp();
    const [repo2] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx2', fullName: 'acme/ctx2', clonePath: '/x' })
      .returning();
    const agent = await newAgent(app, 'ctx-agent-cascade');
    const skill = await newSkill(app, 'ctx-skill-cascade');
    for (const [kind, id] of [['agents', agent.id], ['skills', skill.id]] as const) {
      await app.inject({ method: 'PUT', url: `/${kind}/${id}/context`, payload: { repo_id: repo2!.id, paths: ['specs/a.md'] } });
    }
    const countAgent = async (r: string) =>
      (await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.repoId, r))).length;
    const countSkill = async (r: string) =>
      (await pg.handle.db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.repoId, r))).length;
    expect(await countAgent(repo2!.id)).toBe(1);
    expect(await countSkill(repo2!.id)).toBe(1);

    // deleting the agent removes its rows only
    await pg.handle.db.delete(t.agents).where(and(eq(t.agents.id, agent.id)));
    expect(await countAgent(repo2!.id)).toBe(0);
    expect(await countSkill(repo2!.id)).toBe(1);
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skill.id));
    expect(await countSkill(repo2!.id)).toBe(0);

    // deleting the repository cascades too
    const agent2 = await newAgent(app, 'ctx-agent-cascade2');
    await app.inject({ method: 'PUT', url: `/agents/${agent2.id}/context`, payload: { repo_id: repo2!.id, paths: ['docs/b.md'] } });
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo2!.id));
    expect(await countAgent(repo2!.id)).toBe(0);
    await app.close();
  });

  describe('local overrides (AC-45..49, TC-4, EC-24, EC-25, EC-32)', () => {
    const rows = (r: string) =>
      pg.handle.db.select().from(t.contextDocOverrides).where(eq(t.contextDocOverrides.repoId, r));
    const putText = (app: Awaited<ReturnType<typeof makeApp>>, r: string, path: string, text: string) =>
      app.inject({ method: 'PUT', url: `/repos/${r}/context/file`, payload: { path, text } });

    it('stores text, the listed blob sha and updated_at; a second save upserts the same row', async () => {
      const app = await makeApp();
      const git = new MockGitClient({ files: FILES });
      const blob = (await git.listFiles({ owner: 'a', name: 'b' }, 'main', [])).files.find((f) => f.path === 'specs/a.md')!.blob;
      const first = await putText(app, repoId, 'specs/a.md', 'edit one');
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ modified: true, text: 'edit one', repo_text: FILES['specs/a.md'] });
      const [row1] = await rows(repoId);
      expect(row1).toMatchObject({ path: 'specs/a.md', text: 'edit one', sha: blob, workspaceId });
      await new Promise((r) => setTimeout(r, 15));
      await putText(app, repoId, 'specs/a.md', 'edit one'); // double submit
      const [row2] = await rows(repoId);
      expect(await rows(repoId)).toHaveLength(1);
      expect(row2!.updatedAt.getTime()).toBeGreaterThan(row1!.updatedAt.getTime());
      await putText(app, repoId, 'specs/a.md', 'edit two'); // last save wins
      expect((await rows(repoId))[0]!.text).toBe('edit two');

      const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json() as { path: string; modified: boolean }[];
      expect(list.find((f) => f.path === 'specs/a.md')!.modified).toBe(true);
      expect(list.find((f) => f.path === 'docs/b.md')!.modified).toBe(false);
      await app.close();
    });

    it('identical text removes the row; DELETE resets; DELETE with no row succeeds', async () => {
      const app = await makeApp();
      await putText(app, repoId, 'docs/b.md', 'changed');
      expect(await rows(repoId)).toHaveLength(2);
      const same = await putText(app, repoId, 'docs/b.md', FILES['docs/b.md']);
      expect(same.json()).toMatchObject({ modified: false });
      expect(await rows(repoId)).toHaveLength(1);
      const del = await app.inject({ method: 'DELETE', url: `/repos/${repoId}/context/file?path=specs/a.md` });
      expect(del.json()).toMatchObject({ modified: false, text: FILES['specs/a.md'] });
      expect(await rows(repoId)).toHaveLength(0);
      expect((await app.inject({ method: 'DELETE', url: `/repos/${repoId}/context/file?path=specs/a.md` })).statusCode).toBe(200);
      await app.close();
    });

    it('another workspace gets 404 on PUT, GET and DELETE and touches no row (TC-4)', async () => {
      const app = await makeApp();
      await putText(app, repoId, 'specs/a.md', 'mine');
      const foreign = await makeApp(new MockAuthProvider(undefined, { id: '99999999-9999-4999-8999-999999999999', name: 'other' }));
      expect((await putText(foreign, repoId, 'specs/a.md', 'theirs')).statusCode).toBe(404);
      expect((await foreign.inject({ method: 'GET', url: `/repos/${repoId}/context/file?path=specs/a.md` })).statusCode).toBe(404);
      expect((await foreign.inject({ method: 'DELETE', url: `/repos/${repoId}/context/file?path=specs/a.md` })).statusCode).toBe(404);
      expect((await rows(repoId))[0]!.text).toBe('mine');
      await foreign.close();
      await app.close();
    });

    it('overrides are deleted with their repository (AC-45, EC-32)', async () => {
      const app = await makeApp();
      const [repo3] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'ctx3', fullName: 'acme/ctx3', clonePath: '/x' })
        .returning();
      await putText(app, repo3!.id, 'docs/b.md', 'x');
      expect(await rows(repo3!.id)).toHaveLength(1);
      await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo3!.id));
      expect(await rows(repo3!.id)).toHaveLength(0);
      await app.close();
    });
  });
});
