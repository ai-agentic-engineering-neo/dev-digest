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
 * `GET/PUT /agents/:id/skills` — the Skills tab's read/write pair. Covers the
 * tenancy hole closed in this slice (a skill_id from another workspace must
 * not silently link), the delete-then-reinsert `setSkills` transaction
 * (exact set + enabled persisted, order survives a toggle-only re-PUT), the
 * GET ordering (linked first in order, then unlinked), and `skill_count` on
 * `GET /agents`.
 */
d('GET/PUT /agents/:id/skills', () => {
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
    name: 'Skills Agent',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review the diff.',
  };

  async function seedSkill(db: typeof pg.handle.db, workspaceId: string, name: string) {
    const [row] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name,
        description: `${name} description`,
        type: 'convention',
        source: 'manual',
        body: 'Body text.',
      })
      .returning();
    return row!;
  }

  async function defaultWorkspaceId(db: typeof pg.handle.db) {
    const [ws] = await db.select({ id: t.workspaces.id }).from(t.workspaces).where(
      eq(t.workspaces.name, 'default'),
    );
    return ws!.id;
  }

  it('PUT rejects a skill_id from another workspace (404) and leaves the link table unchanged', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId(db);

    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: agentBody })
    ).json().id as string;

    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const foreignSkill = await seedSkill(db, otherWs!.id, 'Foreign skill');
    const ownSkill = await seedSkill(db, workspaceId, 'Own skill');

    // Seed one legitimate link first so we can assert it's untouched after the failed PUT.
    const seeded = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: ownSkill.id, enabled: true }] },
    });
    expect(seeded.statusCode).toBe(200);

    const rejected = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: ownSkill.id, enabled: true },
          { skill_id: foreignSkill.id, enabled: true },
        ],
      },
    });
    expect(rejected.statusCode).toBe(404);

    // Unchanged: still exactly the one legitimate link from before the rejected PUT.
    const links = await db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agentId));
    expect(links).toHaveLength(1);
    expect(links[0]!.skillId).toBe(ownSkill.id);

    await app.close();
  });

  it('setSkills replaces the exact set (incl. enabled:false) and a toggle-only re-PUT keeps order', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId(db);

    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: agentBody })
    ).json().id as string;

    const skillA = await seedSkill(db, workspaceId, 'Skill A');
    const skillB = await seedSkill(db, workspaceId, 'Skill B');
    const skillC = await seedSkill(db, workspaceId, 'Skill C');

    const first = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: skillA.id, enabled: true },
          { skill_id: skillB.id, enabled: false },
          { skill_id: skillC.id, enabled: true },
        ],
      },
    });
    expect(first.statusCode).toBe(200);
    const firstLinked = first.json().filter((i: { linked: boolean }) => i.linked);
    expect(firstLinked.map((i: { id: string }) => i.id)).toEqual([
      skillA.id,
      skillB.id,
      skillC.id,
    ]);
    expect(firstLinked.map((i: { enabled: boolean }) => i.enabled)).toEqual([true, false, true]);
    expect(firstLinked.map((i: { order: number }) => i.order)).toEqual([0, 1, 2]);

    // Toggle only B on, keep the same order — order must not be disturbed.
    const second = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: skillA.id, enabled: true },
          { skill_id: skillB.id, enabled: true },
          { skill_id: skillC.id, enabled: true },
        ],
      },
    });
    expect(second.statusCode).toBe(200);
    const secondLinked = second.json().filter((i: { linked: boolean }) => i.linked);
    expect(secondLinked.map((i: { id: string }) => i.id)).toEqual([
      skillA.id,
      skillB.id,
      skillC.id,
    ]);
    expect(secondLinked.every((i: { enabled: boolean }) => i.enabled)).toBe(true);
    expect(secondLinked.map((i: { order: number }) => i.order)).toEqual([0, 1, 2]);

    await app.close();
  });

  it('GET returns linked skills in order first, then unlinked skills with linked:false', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId(db);

    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: agentBody })
    ).json().id as string;

    const linkedFirst = await seedSkill(db, workspaceId, 'Linked First');
    const linkedSecond = await seedSkill(db, workspaceId, 'Linked Second');
    const unlinked = await seedSkill(db, workspaceId, 'Unlinked Skill');

    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: linkedSecond.id, enabled: false },
          { skill_id: linkedFirst.id, enabled: true },
        ],
      },
    });

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(res.statusCode).toBe(200);
    const items = res.json() as { id: string; linked: boolean; enabled: boolean; order: number | null }[];

    // Linked skills first, in the order they were set (second then first).
    expect(items[0]).toMatchObject({ id: linkedSecond.id, linked: true, enabled: false, order: 0 });
    expect(items[1]).toMatchObject({ id: linkedFirst.id, linked: true, enabled: true, order: 1 });

    // Unlinked skill appended, default enabled:true, order:null.
    const unlinkedItem = items.find((i) => i.id === unlinked.id);
    expect(unlinkedItem).toMatchObject({ linked: false, enabled: true, order: null });

    await app.close();
  });

  it('GET /agents returns the correct skill_count per agent', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId(db);

    const withSkillsId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { ...agentBody, name: 'With Skills' },
      })
    ).json().id as string;
    const withoutSkillsId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { ...agentBody, name: 'Without Skills' },
      })
    ).json().id as string;

    const s1 = await seedSkill(db, workspaceId, 'Count Skill 1');
    const s2 = await seedSkill(db, workspaceId, 'Count Skill 2');
    await app.inject({
      method: 'PUT',
      url: `/agents/${withSkillsId}/skills`,
      payload: {
        items: [
          { skill_id: s1.id, enabled: true },
          { skill_id: s2.id, enabled: false },
        ],
      },
    });

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      id: string;
      skill_count: number;
    }[];
    const withSkills = list.find((a) => a.id === withSkillsId);
    const withoutSkills = list.find((a) => a.id === withoutSkillsId);

    // Total link count, NOT gated on enabled (this is "N of M" list material).
    expect(withSkills?.skill_count).toBe(2);
    expect(withoutSkills?.skill_count).toBe(0);

    await app.close();
  });
});
