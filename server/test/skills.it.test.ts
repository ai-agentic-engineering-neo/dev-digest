import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import type { AuthProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/infrastructure/repository.js';
import { SkillsService } from '../src/modules/skills/application/skills-service.js';
import { DrizzleTransactionRunner } from '../src/db/transaction.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Skills API end to end on a real Postgres (server/specs/03-skills.md,
 * acceptance criteria 1–5, 8–11): versioning, optimistic concurrency, restore,
 * per-workspace names, the trust gate, import preview, agent link hardening,
 * delete, and workspace scoping of every /skills/:id* route.
 */
d('skills API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let otherApp: Awaited<ReturnType<typeof buildApp>>;
  let seq = 0;

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const make = (auth?: AuthProvider) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient({ pulls: [] }), ...(auth ? { auth } : {}) },
    });

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
    otherWorkspaceId = other!.id;
    app = await make();
    otherApp = await make({
      currentUser: async () => ({ id: '00000000-0000-4000-8000-000000000001', email: 'o@x', name: 'Other' }),
      currentWorkspace: async () => ({ id: otherWorkspaceId, name: 'other-tenant' }),
    });
  });
  afterAll(async () => {
    await app?.close();
    await otherApp?.close();
    await pg?.stop();
  });

  const uniqueName = (prefix = 'skill') => `${prefix}-${++seq}`;

  async function createSkill(payload: Record<string, unknown> = {}, on = app) {
    const res = await on.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: uniqueName(), type: 'rubric', body: 'Body v1', description: 'Flag x.', ...payload },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json() as { id: string; name: string; version: number; enabled: boolean; body: string };
  }

  const put = (id: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: `/skills/${id}`, payload });
  const versions = async (id: string) =>
    (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json() as {
      version: number;
      body: string;
      description: string;
      message: string;
    }[];

  async function createAgent(name = uniqueName('agent')) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
    });
    return res.json() as { id: string; version: number };
  }
  const linkSkills = (agentId: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload });
  const linkedIds = async (agentId: string) =>
    ((await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json() as { skill_id: string }[]).map(
      (l) => l.skill_id,
    );

  // ---- AC1–AC3: versioning -------------------------------------------------------

  it('AC1: body/description changes version; name/type/enabled update in place', async () => {
    const skill = await createSkill();
    expect(skill.version).toBe(1);
    expect(await versions(skill.id)).toMatchObject([{ version: 1, body: 'Body v1', message: 'Created' }]);

    expect((await put(skill.id, { body: 'Body v2' })).json().version).toBe(2);
    expect(await versions(skill.id)).toHaveLength(2);

    const renamed = uniqueName('renamed');
    const inPlace = (await put(skill.id, { type: 'security', enabled: false, name: renamed })).json();
    expect(inPlace).toMatchObject({ version: 2, type: 'security', enabled: false, name: renamed });
    // Re-sending the same body is not a change either.
    expect((await put(skill.id, { body: 'Body v2' })).json().version).toBe(2);

    expect((await put(skill.id, { description: 'Flag y.' })).json().version).toBe(3);
    const list = await versions(skill.id);
    expect(list.map((v) => [v.version, v.message])).toEqual([
      [3, 'Edited description'],
      [2, 'Edited body'],
      [1, 'Created'],
    ]);
    expect(list[0]).toMatchObject({ body: 'Body v2', description: 'Flag y.' });

    const v2 = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/2` });
    expect(v2.json()).toMatchObject({ skill_id: skill.id, version: 2, body: 'Body v2', description: 'Flag x.' });
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/9` })).statusCode).toBe(404);
  });

  it('AC2: a stale base_version is a 409 and the row is unchanged', async () => {
    const skill = await createSkill();
    await put(skill.id, { body: 'Body v2', base_version: 1 });
    const stale = await put(skill.id, { body: 'Lost update', base_version: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('stale_version');
    const now = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(now).toMatchObject({ version: 2, body: 'Body v2' });
  });

  it('AC3: restoring v1 of a v3 skill writes v4 with the v1 texts', async () => {
    const skill = await createSkill({ body: 'Original', description: 'Flag original.' });
    await put(skill.id, { body: 'Second' });
    await put(skill.id, { body: 'Third', description: 'Flag third.' });
    const res = await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/1/restore` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 4, body: 'Original', description: 'Flag original.' });
    expect((await versions(skill.id))[0]).toMatchObject({ version: 4, message: 'Restored from v1', body: 'Original' });
    expect((await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/7/restore` })).statusCode).toBe(404);
  });

  it('concurrent edits each get their own version (row lock)', async () => {
    const skill = await createSkill();
    // Warm the pool so the transactions really overlap (INSIGHTS 2026-09-22).
    await Promise.all(Array.from({ length: 5 }, () => pg.handle.sql`select pg_sleep(0.05)`));
    const service = new SkillsService({
      skills: new SkillsRepository(pg.handle.db),
      tx: new DrizzleTransactionRunner(pg.handle.db, (db) => ({ skills: new SkillsRepository(db) })),
      clock: () => new Date(),
    });
    const results = await Promise.all(
      ['b1', 'b2', 'b3', 'b4'].map((body) => service.update(workspaceId, skill.id, { body })),
    );
    expect(results.map((r) => r!.version).sort()).toEqual([2, 3, 4, 5]);
    expect((await versions(skill.id)).map((v) => v.version)).toEqual([5, 4, 3, 2, 1]);
  });

  // ---- AC4: names ------------------------------------------------------------------

  it('AC4: a duplicate name is 409 in the same workspace, fine in another', async () => {
    const skill = await createSkill();
    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: skill.name, type: 'custom', body: 'x' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('conflict');
    await createSkill({ name: skill.name }, otherApp);

    // Renaming onto an existing name is a conflict too, and changes nothing.
    const other = await createSkill();
    const rename = await put(other.id, { name: skill.name });
    expect(rename.statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: `/skills/${other.id}` })).json().name).toBe(other.name);
  });

  it('rejects an invalid name / oversize body at the edge (422)', async () => {
    for (const payload of [
      { name: 'Not A Slug', type: 'custom', body: 'x' },
      { name: 'ok-name', type: 'custom', body: 'x'.repeat(20_001) },
      { name: 'ok-name', type: 'custom', body: 'x', description: 'd'.repeat(301) },
    ]) {
      expect((await app.inject({ method: 'POST', url: '/skills', payload })).statusCode).toBe(422);
    }
  });

  // ---- list / get shape -----------------------------------------------------------

  it('lists workspace skills by name with used_by and provenance fields', async () => {
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as {
      name: string;
      used_by: number;
      source: string;
      updated_at: string;
    }[];
    const names = list.map((s) => s.name);
    expect(names).toEqual([...names].sort());
    // The seed links pr-quality-rubric to the General Reviewer.
    expect(list.find((s) => s.name === 'pr-quality-rubric')).toMatchObject({ used_by: 1, source: 'manual' });
    expect(typeof list[0]!.updated_at).toBe('string');
    const otherList = (await otherApp.inject({ method: 'GET', url: '/skills' })).json() as { name: string }[];
    expect(otherList.some((s) => s.name === 'pr-quality-rubric')).toBe(false);
  });

  // ---- AC10: trust + import preview ------------------------------------------------

  it('AC10: preview of a zip persists nothing; a foreign source is stored disabled', async () => {
    const before = (await pg.handle.sql`select count(*)::int as n from skills`)[0]!.n as number;
    const bytes = zipSync({
      'flaky/SKILL.md': strToU8('---\nname: flaky-hunter\ndescription: Flag sleeps in tests.\n---\nNo sleeps.'),
      'flaky/scripts/x.sh': strToU8('#!/bin/sh\necho pwned'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { kind: 'file', filename: 'flaky.zip', content_base64: Buffer.from(bytes).toString('base64') },
    });
    expect(res.statusCode, res.body).toBe(200);
    const preview = res.json();
    expect(preview).toMatchObject({
      name: 'flaky-hunter',
      body: 'No sleeps.',
      source: 'imported_file',
      source_ref: 'flaky.zip',
      ignored_files: [{ path: 'flaky/scripts/x.sh', reason: 'executable' }],
    });
    const after = (await pg.handle.sql`select count(*)::int as n from skills`)[0]!.n as number;
    expect(after).toBe(before);

    const created = await createSkill({
      name: uniqueName('flaky-hunter'),
      description: preview.description,
      body: preview.body,
      type: preview.type,
      source: 'imported_file',
      source_ref: preview.source_ref,
      enabled: true,
    });
    expect(created.enabled).toBe(false);
    expect((await versions(created.id))[0]!.message).toBe('Imported from flaky.zip');
    // Only an explicit toggle enables it.
    expect((await put(created.id, { enabled: true })).json()).toMatchObject({ enabled: true, version: 1 });
  });

  it('accepts an upload above Fastify’s default 1 MiB body limit (≤ 2 MB base64)', async () => {
    const bytes = zipSync(
      { 'SKILL.md': strToU8('Flag big things.'), 'assets/blob.dat': new Uint8Array(randomBytes(1_200_000)) },
      { level: 0 },
    );
    const content_base64 = Buffer.from(bytes).toString('base64');
    expect(content_base64.length).toBeGreaterThan(1024 * 1024);
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { kind: 'file', filename: 'big.zip', content_base64 },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().ignored_files).toEqual([{ path: 'assets/blob.dat', reason: 'not_markdown' }]);
  });

  it('AC11: URL import of http:// or a loopback address is a 422 invalid_import', async () => {
    for (const url of ['http://example.com/a.md', 'https://127.0.0.1/a.md', 'https://[::1]/x.md']) {
      const res = await app.inject({ method: 'POST', url: '/skills/import/preview', payload: { kind: 'url', url } });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('invalid_import');
    }
  });

  it('community: list is filtered; importing one previews it with provenance', async () => {
    const all = (await app.inject({ method: 'GET', url: '/skills/community' })).json() as { id: string }[];
    expect(all.length).toBeGreaterThanOrEqual(6);
    const sql = (await app.inject({ method: 'GET', url: '/skills/community?q=sql' })).json() as { id: string }[];
    expect(sql.map((s) => s.id)).toContain('sql-injection-gate');
    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { kind: 'community', id: 'react-hooks-rules' },
    });
    expect(preview.json()).toMatchObject({ source: 'community', source_ref: 'community:react-hooks-rules' });
  });

  // ---- AC5: agent link hardening ----------------------------------------------------

  it('AC5: unknown or foreign skill ids are 422 unknown_skill and the links stay unchanged', async () => {
    const agent = await createAgent();
    const mine = await createSkill();
    await linkSkills(agent.id, { skill_ids: [mine.id] });
    const foreign = await createSkill({}, otherApp);

    for (const bad of [foreign.id, '00000000-0000-4000-8000-00000000abcd']) {
      const res = await linkSkills(agent.id, { skill_ids: [mine.id, bad] });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('unknown_skill');
      const single = await linkSkills(agent.id, { skill_id: bad });
      expect(single.statusCode).toBe(422);
      expect(await linkedIds(agent.id)).toEqual([mine.id]);
    }
  });

  it('AC5: a real reorder bumps the agent version and snapshots the new order; a no-op does not', async () => {
    const agent = await createAgent();
    const a = await createSkill();
    const b = await createSkill();
    await linkSkills(agent.id, { skill_ids: [a.id, b.id] });
    const v2 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version;
    expect(v2).toBe(agent.version + 1);

    await linkSkills(agent.id, { skill_ids: [b.id, a.id] });
    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version;
    expect(after).toBe(v2 + 1);
    const snap = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions/${after}` })).json();
    expect(snap.config.skills).toEqual([b.id, a.id]);

    // The same order again: no new version.
    await linkSkills(agent.id, { skill_ids: [b.id, a.id] });
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version).toBe(after);

    // Link one at a position (moves / inserts) — also versioned.
    const c = await createSkill();
    const links = (await linkSkills(agent.id, { skill_id: c.id, order: 0 })).json();
    expect(links.map((l: { skill_id: string; order: number }) => [l.skill_id, l.order])).toEqual([
      [c.id, 0],
      [b.id, 1],
      [a.id, 2],
    ]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version).toBe(after + 1);

    expect((await linkSkills(agent.id, { skill_ids: [a.id, a.id] })).statusCode).toBe(422);
  });

  it('GET /skills/:id/agents lists the linking agents', async () => {
    const skill = await createSkill();
    const agent = await createAgent('Zeta linker');
    await linkSkills(agent.id, { skill_id: skill.id });
    const refs = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/agents` })).json();
    expect(refs).toEqual([{ id: agent.id, name: 'Zeta linker', enabled: true }]);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().used_by).toBe(1);
  });

  // ---- AC8: delete -------------------------------------------------------------------

  it('AC8: delete removes links (others keep order), versions and the skill’s eval cases', async () => {
    const doomed = await createSkill();
    const keepA = await createSkill();
    const keepB = await createSkill();
    const agent1 = await createAgent();
    const agent2 = await createAgent();
    await linkSkills(agent1.id, { skill_ids: [keepA.id, doomed.id, keepB.id] });
    await linkSkills(agent2.id, { skill_ids: [doomed.id, keepB.id] });
    await pg.handle.db.insert(t.evalCases).values([
      { workspaceId, ownerKind: 'skill', ownerId: doomed.id, name: 'doomed case' },
      { workspaceId, ownerKind: 'skill', ownerId: keepA.id, name: 'kept case' },
    ]);

    const res = await app.inject({ method: 'DELETE', url: `/skills/${doomed.id}` });
    expect(res.json()).toEqual({ ok: true });
    expect(await linkedIds(agent1.id)).toEqual([keepA.id, keepB.id]);
    expect(await linkedIds(agent2.id)).toEqual([keepB.id]);
    expect(await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, doomed.id))).toEqual([]);
    const cases = await pg.handle.db
      .select({ name: t.evalCases.name })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'skill'), eq(t.evalCases.workspaceId, workspaceId)));
    expect(cases.map((c) => c.name)).toContain('kept case');
    expect(cases.map((c) => c.name)).not.toContain('doomed case');
    expect((await app.inject({ method: 'GET', url: `/skills/${doomed.id}` })).statusCode).toBe(404);
  });

  // ---- AC9: workspace scoping ------------------------------------------------------

  it('AC9: every /skills/:id* route is a 404 for a skill of another workspace', async () => {
    const foreign = await createSkill({}, otherApp);
    const id = foreign.id;
    const calls: [string, string, unknown?][] = [
      ['GET', `/skills/${id}`],
      ['PUT', `/skills/${id}`, { body: 'hijack' }],
      ['DELETE', `/skills/${id}`],
      ['GET', `/skills/${id}/versions`],
      ['GET', `/skills/${id}/versions/1`],
      ['POST', `/skills/${id}/versions/1/restore`],
      ['GET', `/skills/${id}/agents`],
      ['GET', `/skills/${id}/stats`],
    ];
    for (const [method, url, payload] of calls) {
      const res = await app.inject({ method: method as 'GET', url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    const still = (await otherApp.inject({ method: 'GET', url: `/skills/${id}` })).json();
    expect(still).toMatchObject({ body: 'Body v1', version: 1 });
  });

  it('stats of a never-run skill: zero counters, null rates', async () => {
    const skill = await createSkill();
    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats?days=7` })).json();
    expect(stats).toMatchObject({
      skill_id: skill.id,
      window_days: 7,
      runs_attached: 0,
      runs_cited: 0,
      pull_rate: null,
      findings: 0,
      accept_rate: null,
      by_category: [],
      by_severity: [],
      used_by: [],
    });
    const summary = (await app.inject({ method: 'GET', url: '/skills/stats' })).json() as { skill_id: string }[];
    expect(summary.find((s) => s.skill_id === skill.id)).toEqual({
      skill_id: skill.id,
      pull_rate: null,
      accept_rate: null,
      findings: 0,
    });
    expect((await app.inject({ method: 'GET', url: '/skills/stats?days=0' })).statusCode).toBe(422);
  });
});
