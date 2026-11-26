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
  // eslint-disable-next-line no-console
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

/**
 * M2 Task 4 — the agent side of the agent ↔ skill link:
 * workspace ownership (400), atomic relink + version bump / snapshot, and
 * `skill_count` on GET /agents and GET /agents/:id.
 */
d('POST /agents/:id/skills + skill_count', () => {
  let pg: PgFixture;
  let defaultWs: string;
  let otherWs: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    defaultWs = ws!.id;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
    otherWs = other!.id;
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

  let seq = 0;
  async function makeSkill(workspaceId: string, enabled = true): Promise<string> {
    seq += 1;
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `it-skill-${seq}`,
        description: 'd',
        type: 'convention',
        source: 'manual',
        body: `rule ${seq}`,
        enabled,
      })
      .returning();
    return row!.id;
  }

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    seq += 1;
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Skills Agent ${seq}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().skill_count).toBe(0);
    return res.json().id as string;
  }

  const links = async (agentId: string) =>
    pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));

  it('400 when a skill id belongs to another workspace; links stay untouched', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const own = await makeSkill(defaultWs);
    const foreign = await makeSkill(otherWs);

    const ok = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [own] },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [own, foreign] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatchObject({ code: 'invalid_skill_ids', details: { skill_ids: [foreign] } });

    const badOne = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_id: foreign },
    });
    expect(badOne.statusCode).toBe(400);

    const unknown = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(unknown.statusCode).toBe(400);

    const dup = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [own, own] },
    });
    expect(dup.statusCode).toBe(400);

    expect((await links(agentId)).map((l) => l.skillId)).toEqual([own]);
    await app.close();
  });

  it('a set / order change bumps the version once and snapshots the ordered ids', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill(defaultWs);
    const b = await makeSkill(defaultWs);

    const set = (skill_ids: string[]) =>
      app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids } });
    const version = async () =>
      (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version as number;

    const attached = await set([a, b]);
    expect(attached.statusCode).toBe(200);
    expect(attached.json().map((l: { skill_id: string }) => l.skill_id)).toEqual([a, b]);
    expect(await version()).toBe(2);

    // Same set, same order → no bump.
    await set([a, b]);
    expect(await version()).toBe(2);

    // Reorder → bump.
    await set([b, a]);
    expect(await version()).toBe(3);

    // Link one (append) → bump; re-linking at the same order → no bump.
    const c = await makeSkill(defaultWs);
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: c } });
    expect(await version()).toBe(4);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_id: c, order: 2 },
    });
    expect(await version()).toBe(4);

    // Detach all → bump.
    await set([]);
    expect(await version()).toBe(5);

    const versions = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json() as { version: number; config: { skills: string[] } }[];
    expect(versions.map((v) => v.version)).toEqual([5, 4, 3, 2, 1]);
    expect(versions.map((v) => v.config.skills)).toEqual([[], [b, a, c], [b, a], [a, b], []]);
    await app.close();
  });

  it('GET /agents and GET /agents/:id return skill_count (disabled skills included)', async () => {
    const app = await makeApp();
    const withSkills = await makeAgent(app);
    const without = await makeAgent(app);
    const on = await makeSkill(defaultWs);
    const off = await makeSkill(defaultWs, false);

    await app.inject({
      method: 'POST',
      url: `/agents/${withSkills}/skills`,
      payload: { skill_ids: [on, off] },
    });

    const one = await app.inject({ method: 'GET', url: `/agents/${withSkills}` });
    expect(one.json().skill_count).toBe(2);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      id: string;
      skill_count: number;
    }[];
    expect(list.find((x) => x.id === withSkills)?.skill_count).toBe(2);
    expect(list.find((x) => x.id === without)?.skill_count).toBe(0);
    for (const agent of list) expect(typeof agent.skill_count).toBe('number');

    const updated = await app.inject({
      method: 'PUT',
      url: `/agents/${withSkills}`,
      payload: { enabled: false },
    });
    expect(updated.json().skill_count).toBe(2);
    await app.close();
  });
});
