import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * The zod `response` schemas on the repos / agents / repo-intel routes must not
 * reject (500) or strip what the handlers return. One request per route shape.
 */
d('repos / agents / repo-intel route responses', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        llm: { anthropic: new MockLLMProvider('anthropic') },
      },
    });
  }

  it('repos: add (201) / re-add (200) / list / refresh / delete', async () => {
    const app = await makeApp();
    const url = 'https://github.com/acme/response-shapes';
    const created = await app.inject({ method: 'POST', url: '/repos', payload: { url } });
    expect(created.statusCode).toBe(201);
    const repo = created.json();
    expect(repo).toMatchObject({ owner: 'acme', name: 'response-shapes', full_name: 'acme/response-shapes' });
    expect(Object.keys(repo).sort()).toEqual(
      ['clone_path', 'created_by', 'default_branch', 'full_name', 'id', 'last_polled_at', 'name', 'owner', 'workspace_id'],
    );

    const again = await app.inject({ method: 'POST', url: '/repos', payload: { url } });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(repo.id);

    const list = await app.inject({ method: 'GET', url: '/repos' });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((r: { id: string }) => r.id)).toContain(repo.id);

    const refresh = await app.inject({ method: 'POST', url: `/repos/${repo.id}/refresh` });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toEqual({ status: 'refreshing' });

    const del = await app.inject({ method: 'DELETE', url: `/repos/${repo.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: repo.id });
    await app.close();
  });

  it('repo-intel: index-state (Date → ISO string) and resync (202)', async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db.select().from(t.repos).limit(1);

    const state = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/index-state` });
    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({ repoId: repo!.id, status: 'degraded', degraded: true });
    expect(typeof state.json().updatedAt).toBe('string');

    const resync = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/resync` });
    expect(resync.statusCode).toBe(202);
    expect(resync.json()).toMatchObject({ status: 'accepted', jobId: expect.any(String) });
    await app.close();
  });

  it('agents: skills (set / link / list), delete, and model lists', async () => {
    const app = await makeApp();
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: ws!.id, name: 'Rubric', description: '', type: 'rubric', source: 'manual', body: 'b' })
      .returning();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Shapes', provider: 'anthropic', model: 'claude', system_prompt: 'x' },
      })
    ).json();

    const set = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill!.id] } });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual([{ agent_id: agent.id, skill_id: skill!.id, order: 0 }]);
    const listed = await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` });
    expect(listed.json()).toEqual(set.json());

    const models = await app.inject({ method: 'GET', url: `/agents/${agent.id}/models` });
    expect(models.statusCode).toBe(200);
    expect(Array.isArray(models.json())).toBe(true);
    // No OpenAI key configured → degrades to [] (not a 500).
    const openai = await app.inject({ method: 'GET', url: '/providers/openai/models' });
    expect(openai.statusCode).toBe(200);
    expect(openai.json()).toEqual([]);

    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    await app.close();
  });
});
