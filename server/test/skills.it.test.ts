import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { SEED_SKILLS, SECURITY_REVIEWER_SKILLS } from '../src/db/seed-skills.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * M2 skills module over a real Postgres: CRUD, versioning rules (only body
 * edits version, default messages, restore), 409s, workspace isolation,
 * delete cascade, the Stats aggregation and the seed.
 */
d('skills module', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [pr] = await pg.handle.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(eq(t.pullRequests.workspaceId, workspaceId));
    prId = pr!.id;
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

  const db = () => pg.handle.db;

  async function createSkill(name: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, body: `# ${name}\nv1 body`, ...extra },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; [k: string]: unknown };
  }

  async function createAgent(name: string, enabled = true) {
    const [a] = await db()
      .insert(t.agents)
      .values({
        workspaceId,
        name,
        description: '',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'Review.',
        enabled,
      })
      .returning();
    return a!;
  }

  async function link(agentId: string, skillId: string, order = 0) {
    await db().insert(t.agentSkills).values({ agentId, skillId, order });
  }

  // ---- CRUD + versions ------------------------------------------------------

  it('POST creates v1 manual skill with defaults and an Initial version snapshot', async () => {
    const skill = await createSkill('crud-create');
    expect(skill).toMatchObject({
      name: 'crud-create',
      description: '',
      type: 'custom',
      source: 'manual',
      enabled: true,
      version: 1,
      agent_count: 0,
    });
    expect(typeof skill.created_at).toBe('string');

    const versions = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toEqual([
      expect.objectContaining({ skill_id: skill.id, version: 1, message: 'Initial version' }),
    ]);

    const got = await app.inject({ url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().id).toBe(skill.id);
  });

  it('GET /skills lists name asc with agent_count from one grouped count', async () => {
    const a = await createSkill('list-b');
    await createSkill('list-a');
    const agent1 = await createAgent('List Agent 1');
    const agent2 = await createAgent('List Agent 2');
    await link(agent1.id, a.id);
    await link(agent2.id, a.id);

    const list = (await app.inject({ url: '/skills' })).json() as Array<{
      name: string;
      agent_count: number;
    }>;
    const names = list.map((s) => s.name);
    expect(names).toEqual([...names].sort());
    expect(list.find((s) => s.name === 'list-b')!.agent_count).toBe(2);
    expect(list.find((s) => s.name === 'list-a')!.agent_count).toBe(0);
    expect((await app.inject({ url: `/skills/${a.id}` })).json().agent_count).toBe(2);
  });

  it('rejects invalid input (bad slug, empty body, oversize body)', async () => {
    for (const payload of [
      { name: 'Not A Slug', body: 'x' },
      { name: 'ok-name', body: '' },
      { name: 'ok-name', body: 'x'.repeat(20_001) },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/skills', payload });
      expect(res.statusCode).toBe(422);
    }
  });

  it('duplicate name → 409 on create and on rename', async () => {
    await createSkill('dup-name');
    const again = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'dup-name', body: 'x' },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('conflict');

    const other = await createSkill('dup-other');
    const rename = await app.inject({
      method: 'PUT',
      url: `/skills/${other.id}`,
      payload: { name: 'dup-name' },
    });
    expect(rename.statusCode).toBe(409);
  });

  it('body edit bumps the version with the user message; non-body edits do not', async () => {
    const skill = await createSkill('edit-flow', { description: 'd1', type: 'rubric' });

    const v2 = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'new body', message: 'Tighten' },
    });
    expect(v2.statusCode).toBe(200);
    expect(v2.json()).toMatchObject({ version: 2, body: 'new body', description: 'd1', type: 'rubric' });

    // Description / enabled / same body → no new version, other fields untouched.
    const meta = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { description: 'd2', enabled: false, body: 'new body', message: 'ignored' },
    });
    expect(meta.json()).toMatchObject({ version: 2, description: 'd2', enabled: false, type: 'rubric' });
    expect(new Date(meta.json().updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(v2.json().updated_at).getTime(),
    );

    // An empty PUT must not apply the create defaults (description '', type custom).
    const empty = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: {} });
    expect(empty.json()).toMatchObject({ version: 2, description: 'd2', type: 'rubric', enabled: false });

    // Blank message → default.
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'third' } });

    const versions = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number; message: string }) => [v.version, v.message])).toEqual([
      [3, 'Edited body'],
      [2, 'Tighten'],
      [1, 'Initial version'],
    ]);

    const one = await app.inject({ url: `/skills/${skill.id}/versions/2` });
    expect(one.json()).toMatchObject({ version: 2, body: 'new body', message: 'Tighten' });
    expect((await app.inject({ url: `/skills/${skill.id}/versions/99` })).statusCode).toBe(404);
  });

  it('restore creates a new version with the old body; restoring current → 409', async () => {
    const skill = await createSkill('restore-flow');
    const v1Body = `# restore-flow\nv1 body`;
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v2 body' } });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: v1Body });

    const versions = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();
    expect(versions[0]).toMatchObject({ version: 3, body: v1Body, message: 'Restored from v1' });
    expect(versions).toHaveLength(3);

    const current = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/3/restore`,
    });
    expect(current.statusCode).toBe(409);

    const missing = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/42/restore`,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('GET /skills/:id/agents lists the agents using it', async () => {
    const skill = await createSkill('usage-list');
    const b = await createAgent('Usage Bravo');
    const a = await createAgent('Usage Alpha');
    await link(b.id, skill.id);
    await link(a.id, skill.id);
    const res = await app.inject({ url: `/skills/${skill.id}/agents` });
    expect(res.json()).toEqual([
      { agent_id: a.id, agent_name: 'Usage Alpha' },
      { agent_id: b.id, agent_name: 'Usage Bravo' },
    ]);
  });

  it('DELETE removes the skill and cascades links + versions', async () => {
    const skill = await createSkill('delete-me');
    const agent = await createAgent('Delete Agent');
    await link(agent.id, skill.id);
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v2' } });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    expect((await app.inject({ url: `/skills/${skill.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(404);

    const links = await db().select().from(t.agentSkills).where(eq(t.agentSkills.skillId, skill.id));
    const versions = await db()
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(links).toHaveLength(0);
    expect(versions).toHaveLength(0);
    // The agent itself survives.
    expect(await db().select().from(t.agents).where(eq(t.agents.id, agent.id))).toHaveLength(1);
  });

  it("every /skills/:id* route returns 404 for another workspace's skill", async () => {
    const [ws] = await db().insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [foreign] = await db()
      .insert(t.skills)
      .values({
        workspaceId: ws!.id,
        name: 'foreign-skill',
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'secret rules',
      })
      .returning();
    await db().insert(t.skillVersions).values({ skillId: foreign!.id, version: 1, body: 'secret rules' });
    const id = foreign!.id;

    const calls: Array<{ method: 'GET' | 'PUT' | 'DELETE' | 'POST'; url: string; payload?: object }> = [
      { method: 'GET', url: `/skills/${id}` },
      { method: 'PUT', url: `/skills/${id}`, payload: { body: 'hijack' } },
      { method: 'GET', url: `/skills/${id}/agents` },
      { method: 'GET', url: `/skills/${id}/stats` },
      { method: 'GET', url: `/skills/${id}/versions` },
      { method: 'GET', url: `/skills/${id}/versions/1` },
      { method: 'POST', url: `/skills/${id}/versions/1/restore` },
      { method: 'DELETE', url: `/skills/${id}` },
    ];
    for (const c of calls) {
      const res = await app.inject(c);
      expect(res.statusCode, `${c.method} ${c.url}`).toBe(404);
    }
    const list = (await app.inject({ url: '/skills' })).json() as Array<{ id: string }>;
    expect(list.some((s) => s.id === id)).toBe(false);

    // Untouched.
    const [still] = await db().select().from(t.skills).where(eq(t.skills.id, id));
    expect(still).toMatchObject({ body: 'secret rules', version: 1 });
  });

  it('a 404 for an unknown id and 422 for a non-uuid id', async () => {
    expect((await app.inject({ url: '/skills/00000000-0000-0000-0000-000000000000' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/skills/not-a-uuid' })).statusCode).toBe(422);
  });

  // ---- stats ----------------------------------------------------------------

  async function addRun(
    agentId: string,
    opts: { status?: string; daysAgo?: number; findings?: Array<'accepted' | 'dismissed' | 'open'> },
  ) {
    const ranAt = new Date(Date.now() - (opts.daysAgo ?? 1) * 24 * 60 * 60 * 1000);
    const [run] = await db()
      .insert(t.agentRuns)
      .values({ workspaceId, agentId, prId, ranAt, status: opts.status ?? 'done' })
      .returning();
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, runId: run!.id, kind: 'review' })
      .returning();
    for (const [i, state] of (opts.findings ?? []).entries()) {
      await db()
        .insert(t.findings)
        .values({
          reviewId: review!.id,
          file: 'a.ts',
          startLine: i + 1,
          endLine: i + 1,
          severity: 'WARNING',
          category: 'bug',
          title: `f${i}`,
          rationale: 'r',
          confidence: 0.9,
          ...(state === 'accepted' ? { acceptedAt: new Date() } : {}),
          ...(state === 'dismissed' ? { dismissedAt: new Date() } : {}),
        });
    }
  }

  it('stats: per-agent 30-day activity, undecided ignored, old and failed runs excluded', async () => {
    const skill = await createSkill('stats-skill');
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v2' } });
    const busy = await createAgent('Stats Busy');
    const idle = await createAgent('Stats Idle', false);
    const undecided = await createAgent('Stats Undecided');
    await link(busy.id, skill.id, 0);
    await link(idle.id, skill.id, 0);
    await link(undecided.id, skill.id, 0);

    // busy: 2 done runs in window → 5 findings, 3 accepted, 1 dismissed, 1 open.
    await addRun(busy.id, { findings: ['accepted', 'accepted', 'dismissed'] });
    await addRun(busy.id, { daysAgo: 29, findings: ['accepted', 'open'] });
    // A done run with no review/findings still counts as a run.
    await addRun(busy.id, { daysAgo: 2 });
    // Excluded: outside the window, failed.
    await addRun(busy.id, { daysAgo: 31, findings: ['dismissed', 'dismissed'] });
    await addRun(busy.id, { status: 'failed', findings: ['dismissed'] });
    // undecided: findings but none decided → null rate.
    await addRun(undecided.id, { findings: ['open', 'open'] });

    const res = await app.inject({ url: `/skills/${skill.id}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats).toMatchObject({
      agent_count: 3,
      enabled_agent_count: 2,
      version_count: 2,
      created_at: skill.created_at,
    });
    const byName = Object.fromEntries(
      (stats.agents as Array<{ agent_name: string }>).map((a) => [a.agent_name, a]),
    );
    expect(byName['Stats Busy']).toEqual({
      agent_id: busy.id,
      agent_name: 'Stats Busy',
      enabled: true,
      runs_30d: 3,
      findings_30d: 5,
      accept_rate_30d: 0.75,
    });
    expect(byName['Stats Idle']).toMatchObject({
      enabled: false,
      runs_30d: 0,
      findings_30d: 0,
      accept_rate_30d: null,
    });
    expect(byName['Stats Undecided']).toMatchObject({
      runs_30d: 1,
      findings_30d: 2,
      accept_rate_30d: null,
    });
  });

  it('stats: a skill with no agents', async () => {
    const skill = await createSkill('stats-lonely');
    const stats = (await app.inject({ url: `/skills/${skill.id}/stats` })).json();
    expect(stats).toMatchObject({
      agent_count: 0,
      enabled_agent_count: 0,
      version_count: 1,
      agents: [],
    });
  });

  // ---- seed -----------------------------------------------------------------

  it('seed: six manual skills at v1, three linked to Security Reviewer, idempotent', async () => {
    await seed(db()); // second run must not duplicate anything
    const names = SEED_SKILLS.map((s) => s.name!);
    const rows = await db().select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    const seeded = rows.filter((r) => names.includes(r.name));
    expect(seeded).toHaveLength(6);
    expect(seeded.every((r) => r.source === 'manual' && r.version === 1)).toBe(true);

    for (const s of seeded) {
      const versions = await db()
        .select()
        .from(t.skillVersions)
        .where(eq(t.skillVersions.skillId, s.id));
      expect(versions).toEqual([expect.objectContaining({ version: 1, message: 'Initial version' })]);
    }

    const [security] = await db()
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
    const links = await db()
      .select({ name: t.skills.name, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, security!.id))
      .orderBy(t.agentSkills.order);
    expect(links.map((l) => l.name)).toEqual(SECURITY_REVIEWER_SKILLS);
  });
});
