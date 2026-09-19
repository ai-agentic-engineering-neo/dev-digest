import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

/**
 * Agent <-> skill linking (specs/02-skills.md §7.3): the Skills-tab route
 * (set / reorder / per-agent enable, in all three accepted body shapes), the
 * agent-version bump every link change makes, and `enabledSkillsForPrompt` —
 * the sanctioned read path prompt assembly calls (§7.5).
 */
d('agents ⋈ skills', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
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

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Skills Agent ${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function makeSkill(name: string, body: string, enabled = true) {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name,
        description: `${name} description`,
        type: 'convention',
        source: 'manual',
        body,
        enabled,
      })
      .returning();
    return row!;
  }

  it('POST /agents/:id/skills (skills[]) sets, reorders and per-agent-enables; GET returns AgentSkillDetail[]', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const s1 = await makeSkill('skill-one', 'Body one');
    const s2 = await makeSkill('skill-two', 'Body two');

    const setRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: s1.id, enabled: true },
          { skill_id: s2.id, enabled: false },
        ],
      },
    });
    expect(setRes.statusCode).toBe(200);

    const getRes = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(getRes.statusCode).toBe(200);
    const details = getRes.json();
    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({
      id: s1.id,
      name: 'skill-one',
      type: 'convention',
      order: 0,
      link_enabled: true,
    });
    expect(details[1]).toMatchObject({
      id: s2.id,
      name: 'skill-two',
      order: 1,
      link_enabled: false,
    });
    expect(typeof details[0].token_estimate).toBe('number');
    expect(details[0].token_estimate).toBeGreaterThan(0);

    // Reorder: swap the two.
    const reorderRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: s2.id, enabled: true },
          { skill_id: s1.id, enabled: true },
        ],
      },
    });
    expect(reorderRes.statusCode).toBe(200);
    const reordered = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })
    ).json();
    expect(reordered.map((detail: { id: string }) => detail.id)).toEqual([s2.id, s1.id]);
    expect(reordered[0].link_enabled).toBe(true);

    await app.close();
  });

  it('legacy skill_ids and skill_id body shapes still work', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const s1 = await makeSkill('legacy-one', 'Legacy body one');
    const s2 = await makeSkill('legacy-two', 'Legacy body two');

    const setRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [s1.id] },
    });
    expect(setRes.statusCode).toBe(200);
    expect(setRes.json()).toEqual([
      { agent_id: agentId, skill_id: s1.id, order: 0, enabled: true },
    ]);

    const linkRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_id: s2.id },
    });
    expect(linkRes.statusCode).toBe(200);
    const links = linkRes.json();
    expect(links).toHaveLength(2);
    expect(links.find((l: { skill_id: string }) => l.skill_id === s2.id)).toMatchObject({
      enabled: true,
    });

    await app.close();
  });

  it('a link add, remove, AND enable-toggle each bump the agent version and snapshot it', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const s1 = await makeSkill('bump-one', 'Bump body one');
    const s2 = await makeSkill('bump-two', 'Bump body two');

    let agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(1);

    // Add: link s1 -> v2, snapshot.skills = [s1.id]
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: s1.id, enabled: true }] },
    });
    agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(2);
    let versions = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json();
    expect(versions[0]).toMatchObject({ version: 2, config: { skills: [s1.id] } });

    // Toggle enable off (link stays, just disabled) -> v3, snapshot.skills = []
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: s1.id, enabled: false }] },
    });
    agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(3);
    versions = (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })).json();
    expect(versions[0]).toMatchObject({ version: 3, config: { skills: [] } });
    const afterToggle = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })
    ).json();
    expect(afterToggle).toHaveLength(1); // still linked, just disabled
    expect(afterToggle[0]).toMatchObject({ id: s1.id, link_enabled: false });

    // Remove s1 / add s2 -> v4, snapshot.skills = [s2.id]
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: s2.id, enabled: true }] },
    });
    agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(4);
    versions = (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })).json();
    expect(versions[0]).toMatchObject({ version: 4, config: { skills: [s2.id] } });
    const afterRemove = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })
    ).json();
    expect(afterRemove.map((detail: { id: string }) => detail.id)).toEqual([s2.id]);

    await app.close();
  });

  it('enabledSkillsForPrompt returns exactly the link.enabled && skill.enabled bodies, in link order', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const agentId = await makeAgent(app);

    const live = await makeSkill('prompt-live', 'Body: live skill', true);
    const globallyDisabled = await makeSkill(
      'prompt-globally-disabled',
      'Body: never sent',
      false,
    );
    const linkDisabled = await makeSkill('prompt-link-disabled', 'Body: link off', true);
    const alsoLive = await makeSkill('prompt-also-live', 'Body: also live', true);

    // Deliberately not insertion order, to prove ordering comes from the link.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: alsoLive.id, enabled: true },
          { skill_id: linkDisabled.id, enabled: false },
          { skill_id: live.id, enabled: true },
          { skill_id: globallyDisabled.id, enabled: true },
        ],
      },
    });

    const repo = new AgentsRepository(db);
    const prompt = await repo.enabledSkillsForPrompt(agentId);

    expect(prompt).toEqual([
      { id: alsoLive.id, name: alsoLive.name, body: alsoLive.body },
      { id: live.id, name: live.name, body: live.body },
    ]);

    await app.close();
  });
});
