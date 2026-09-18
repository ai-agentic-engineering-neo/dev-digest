import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  console.warn('[agent-skills] Docker not available — skipping integration tests.');
}

/**
 * Agent ↔ skill link table: per-agent enabled, stable order, uncheck keeps the
 * row, foreign workspace skill_id is rejected.
 */
d('GET|POST /agents/:id/skills', () => {
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

  const agentBody = {
    name: 'Skills Binder',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review the diff.',
  };

  async function createSkill(
    app: Awaited<ReturnType<typeof makeApp>>,
    name: string,
    enabled = true,
  ) {
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name,
        description: `Directive for ${name}.`,
        type: 'custom',
        body: `# ${name}\nDo the thing.`,
        enabled,
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json() as { id: string; name: string; enabled: boolean };
  }

  it('POST three links, disable the middle, GET keeps order and summary fields', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: agentBody })
    ).json().id as string;
    const a = await createSkill(app, 'skill-a');
    const b = await createSkill(app, 'skill-b');
    const c = await createSkill(app, 'skill-c');

    const posted = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: a.id, enabled: true },
          { skill_id: b.id, enabled: false },
          { skill_id: c.id, enabled: true },
        ],
      },
    });
    expect(posted.statusCode).toBe(200);

    const listed = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(listed.statusCode).toBe(200);
    const links = listed.json() as Array<{
      skill_id: string;
      order: number;
      enabled: boolean;
      name: string;
      type: string;
      description: string;
      skill_enabled: boolean;
    }>;
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.skill_id)).toEqual([a.id, b.id, c.id]);
    expect(links.map((l) => l.order)).toEqual([0, 1, 2]);
    expect(links[1]).toMatchObject({
      skill_id: b.id,
      enabled: false,
      name: 'skill-b',
      type: 'custom',
      skill_enabled: true,
    });
    expect(links[1]!.description.length).toBeGreaterThan(0);
    expect(links[0]!.enabled).toBe(true);
    expect(links[2]!.enabled).toBe(true);
    await app.close();
  });

  it('a globally disabled skill stays listable on GET', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { ...agentBody, name: 'Global-off binder' },
      })
    ).json().id as string;
    const off = await createSkill(app, 'global-off', false);

    const posted = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: off.id, enabled: true }] },
    });
    expect(posted.statusCode).toBe(200);
    const links = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })
    ).json() as Array<{ skill_id: string; enabled: boolean; skill_enabled: boolean }>;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      skill_id: off.id,
      enabled: true,
      skill_enabled: false,
    });
    await app.close();
  });

  it('skill_id from another workspace is 422 and is not linked', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { ...agentBody, name: 'Tenant binder' },
      })
    ).json().id as string;

    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'agent-skills-other' })
      .returning();
    const foreign = await new SkillsRepository(pg.handle.db).insert({
      workspaceId: otherWs!.id,
      name: 'foreign-skill',
      description: 'Not in the default workspace.',
      type: 'custom',
      source: 'manual',
      body: '# Foreign\nStay out.',
    });

    const posted = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: foreign.id, enabled: true }] },
    });
    expect(posted.statusCode).toBe(422);

    const listed = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(listed.json()).toEqual([]);
    await app.close();
  });
});
