import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * M2 agent links against Postgres: a set stores order and per-link flags and
 * GET returns them with the skill's name and type; a foreign id answers
 * `unknown_skill`; `skill_count` counts enabled links; a link change bumps the
 * agent version with a `skill_links` snapshot; and `effectiveSkills` — the
 * real loading rule — keeps only links enabled on both sides, in link order.
 */
d('agent skill links', () => {
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

  const newAgent = async () =>
    (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Agent ${Math.random()}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json() as { id: string; version: number };

  const newSkill = async (name: string, enabled = true) =>
    (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: `Apply ${name}.`, type: 'custom', body: `${name} body`, enabled },
      })
    ).json().id as string;

  it('stores order and flags; GET returns them with name and type; skill_count counts enabled', async () => {
    const agent = await newAgent();
    const a = await newSkill('link-a');
    const b = await newSkill('link-b');

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: b, enabled: true }, { skill_id: a, enabled: false }] },
    });
    expect(set.statusCode).toBe(200);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links).toEqual([
      { agent_id: agent.id, skill_id: b, order: 0, enabled: true, name: 'link-b', type: 'custom', skill_enabled: true },
      { agent_id: agent.id, skill_id: a, order: 1, enabled: false, name: 'link-a', type: 'custom', skill_enabled: true },
    ]);

    const fetched = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(fetched.skill_count).toBe(1);
    expect(fetched.version).toBe(agent.version + 1);
    const latest = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json()[0];
    expect(latest.config.skills).toEqual([b, a]);
    expect(latest.config.skill_links).toEqual([
      { skill_id: b, enabled: true },
      { skill_id: a, enabled: false },
    ]);
    const listed = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(listed.find((x: { id: string }) => x.id === agent.id).skill_count).toBe(1);
  });

  it('a skill of another workspace answers 400 unknown_skill; a repeated id answers duplicate_skill', async () => {
    const agent = await newAgent();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'links-other' }).returning();
    const foreign = await new SkillsRepository(pg.handle.db).insert({
      workspaceId: other!.id,
      name: 'foreign-link',
      description: 'x',
      type: 'custom',
      body: 'x',
      source: 'manual',
    });

    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_id: foreign.id } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('unknown_skill');

    const own = await newSkill('dup-link');
    const dup = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: own, enabled: true }, { skill_id: own, enabled: false }] },
    });
    expect(dup.json().error.code).toBe('duplicate_skill');
  });

  it('effectiveSkills excludes link-disabled and globally disabled skills and keeps link order', async () => {
    const agent = await newAgent();
    const first = await newSkill('eff-first');
    const offOnLink = await newSkill('eff-off-link');
    const offGlobally = await newSkill('eff-off-global', false);
    const last = await newSkill('eff-last');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: last, enabled: true },
          { skill_id: offOnLink, enabled: false },
          { skill_id: offGlobally, enabled: true },
          { skill_id: first, enabled: true },
        ],
      },
    });

    const effective = await app.container.skillsService.effectiveSkills(agent.id);
    expect(effective.map((s) => s.name)).toEqual(['eff-last', 'eff-first']);
    expect(effective[0]).toMatchObject({ id: last, description: 'Apply eff-last.', body: 'eff-last body', version: 1 });
  });

  it('a re-seed links an untouched (pre-M2) agent but not one whose links the user cleared', async () => {
    const db = pg.handle.db;
    const agentId = async (name: string) =>
      (await db.select({ id: t.agents.id }).from(t.agents).where(eq(t.agents.name, name)))[0]!.id;
    const linkCount = async (id: string) =>
      (await db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, id))).length;

    // Pre-M2 shape: links gone, no skill_links snapshot (seeded agents have no version rows).
    const untouched = await agentId('Security Reviewer');
    await db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, untouched));
    // User clears every link through the API: writes a snapshot with skill_links: [].
    const cleared = await agentId('Performance Reviewer');
    const res = await app.inject({ method: 'POST', url: `/agents/${cleared}/skills`, payload: { skills: [] } });
    expect(res.statusCode).toBe(200);

    await seed(db);
    expect(await linkCount(untouched)).toBeGreaterThan(0);
    expect(await linkCount(cleared)).toBe(0);
    // Idempotent: a second run changes nothing and does not collide.
    const before = await linkCount(untouched);
    await seed(db);
    expect(await linkCount(untouched)).toBe(before);
    expect(
      await db.select().from(t.agentVersions).where(and(eq(t.agentVersions.agentId, untouched))),
    ).toHaveLength(0);
  });
});
