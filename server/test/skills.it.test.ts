import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * L02 skills — CRUD, the body-only version rule, destructive restore, the type
 * catalogue, markdown import preview, and cross-workspace isolation.
 */
d('skills module', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
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

  const body = (over: Record<string, unknown> = {}) => ({
    name: `skill-${Math.random().toString(36).slice(2, 10)}`,
    description: 'A seeded test skill.',
    type: 'rubric',
    body: '# Rule\n\nOriginal body.',
    ...over,
  });

  async function create(app: Awaited<ReturnType<typeof makeApp>>, over = {}) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: body(over) });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; type: string; body: string };
  }

  // ---- CRUD ---------------------------------------------------------------

  it('creates a skill at version 1 and lists it', async () => {
    const app = await makeApp();
    const created = await create(app);
    expect(created.version).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { id: string }[]).some((s) => s.id === created.id)).toBe(true);
  });

  it('404s an unknown skill and 422s a non-uuid id', async () => {
    const app = await makeApp();
    const missing = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);

    const bad = await app.inject({ method: 'GET', url: '/skills/not-a-uuid' });
    expect(bad.statusCode).toBe(422);
  });

  it('deletes a skill and its version history', async () => {
    const app = await makeApp();
    const created = await create(app);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    const after = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(after.statusCode).toBe(404);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    expect(versions).toHaveLength(0);

    // A second delete is a 404, not a silent success.
    const again = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(again.statusCode).toBe(404);
  });

  // ---- versioning ---------------------------------------------------------

  it('bumps the version and snapshots ONLY when the body changes', async () => {
    const app = await makeApp();
    const created = await create(app);

    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { name: 'renamed', description: 'new words', type: 'convention' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().version).toBe(1); // metadata-only → no new version

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nSecond body.' },
    });
    expect(edited.json().version).toBe(2);

    // Saving the SAME body again must not create a duplicate version.
    const noop = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nSecond body.' },
    });
    expect(noop.json().version).toBe(2);

    const list = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    const versions = list.json() as { version: number; body: string }[];
    expect(versions.map((v) => v.version)).toEqual([2, 1]); // newest first
    expect(versions[1]!.body).toBe('# Rule\n\nOriginal body.');
  });

  it('toggling enabled does not create a version', async () => {
    const app = await makeApp();
    const created = await create(app);
    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { enabled: false },
    });
    expect(toggled.json()).toMatchObject({ enabled: false, version: 1 });
  });

  it('serves a single version and 404s an unknown one', async () => {
    const app = await makeApp();
    const created = await create(app);

    const v1 = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: '# Rule\n\nOriginal body.' });

    const v9 = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/9` });
    expect(v9.statusCode).toBe(404);

    const v0 = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/0` });
    expect(v0.statusCode).toBe(422); // must be a positive integer
  });

  // ---- restore ------------------------------------------------------------

  it('restore rolls the body back AND deletes every newer version', async () => {
    const app = await makeApp();
    const created = await create(app);
    for (const text of ['second', 'third']) {
      await app.inject({
        method: 'PUT',
        url: `/skills/${created.id}`,
        payload: { body: `# Rule\n\n${text}` },
      });
    }

    const before = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect((before.json() as { version: number }[]).map((v) => v.version)).toEqual([3, 2, 1]);

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 1, body: '# Rule\n\nOriginal body.' });

    const after = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect((after.json() as { version: number }[]).map((v) => v.version)).toEqual([1]);

    // A later edit continues from the restored version, not from the discarded 3.
    const next = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nafter restore' },
    });
    expect(next.json().version).toBe(2);
  });

  it('restoring the newest version is a no-op that keeps the history', async () => {
    const app = await makeApp();
    const created = await create(app);
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nsecond' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/2/restore`,
    });
    expect(res.json()).toMatchObject({ version: 2, body: '# Rule\n\nsecond' });

    const after = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect((after.json() as { version: number }[]).map((v) => v.version)).toEqual([2, 1]);
  });

  it('404s a restore of a version that does not exist', async () => {
    const app = await makeApp();
    const created = await create(app);
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/7/restore`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('two concurrent body updates each keep their own version and snapshot (WP8 race)', async () => {
    const app = await makeApp();
    const created = await create(app);

    const bodyA = '# Rule\n\nConcurrent body A.';
    const bodyB = '# Rule\n\nConcurrent body B.';
    const [resA, resB] = await Promise.all([
      app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: bodyA } }),
      app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: bodyB } }),
    ]);
    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    const rows = list.json() as { version: number; body: string }[];
    const byVersion = new Map(rows.map((r) => [r.version, r.body]));

    // v1 (original) + one bump per concurrent update = 3 distinct snapshots,
    // v2 and v3 each holding ONE of the two submitted bodies (no drop).
    expect(byVersion.size).toBe(3);
    expect([byVersion.get(2), byVersion.get(3)].sort()).toEqual([bodyA, bodyB].sort());

    // The live row is at v+2 (version 3) and its body matches that snapshot.
    const live = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    const liveJson = live.json() as { version: number; body: string };
    expect(liveJson.version).toBe(3);
    expect(liveJson.body).toBe(byVersion.get(3));
  });

  // The bump rule (`isBodyChange`) must be applied to the LOCKED row: decided on
  // an earlier unlocked read, both PUTs of the same new body see "changed" and
  // the second snapshots an identical body as a duplicate version.
  it('two concurrent PUTs of the SAME new body bump the version only once', async () => {
    const app = await makeApp();
    const created = await create(app);

    const same = '# Rule\n\nThe same new body, sent twice at once.';
    const results = await Promise.all([
      app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: same } }),
      app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: same } }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);

    const list = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    const versions = (list.json() as { version: number }[]).map((r) => r.version).sort();
    expect(versions).toEqual([1, 2]);

    const live = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect((live.json() as { version: number }).version).toBe(2);
  });

  // ---- the type catalogue -------------------------------------------------

  it('a brand-new type name joins the catalogue on save', async () => {
    const app = await makeApp();
    const typeName = `accessibility-${Math.random().toString(36).slice(2, 8)}`;

    const before = await app.inject({ method: 'GET', url: '/skill-types' });
    expect((before.json() as { name: string }[]).map((x) => x.name)).not.toContain(typeName);

    await create(app, { type: typeName });

    const after = await app.inject({ method: 'GET', url: '/skill-types' });
    expect((after.json() as { name: string }[]).map((x) => x.name)).toContain(typeName);
  });

  it('registers a new type introduced by an update, and never duplicates one', async () => {
    const app = await makeApp();
    const typeName = `perf-${Math.random().toString(36).slice(2, 8)}`;
    const created = await create(app);

    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { type: typeName },
    });
    // Saving the same type twice must not violate the unique constraint.
    await create(app, { type: typeName });

    const rows = await pg.handle.db
      .select()
      .from(t.skillTypes)
      .where(and(eq(t.skillTypes.workspaceId, workspaceId), eq(t.skillTypes.name, typeName)));
    expect(rows).toHaveLength(1);
  });

  it('seeds the four built-in types', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/skill-types' });
    const names = (res.json() as { name: string }[]).map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['rubric', 'convention', 'security', 'custom']));
  });

  // WP9 — SkillType is `z.string().trim().min(1)`: a padded type is trimmed
  // before it reaches skills.type AND the catalogue, and whitespace-only is
  // rejected the same way an empty type would be (a schema-validation 422,
  // like the id/version param checks above — this API never uses bare 400s).
  it('trims a submitted type at the boundary and rejects a blank one', async () => {
    const app = await makeApp();
    // A fresh name, not a seeded built-in: 'security' is always in the
    // catalogue, so asserting on it could never fail.
    const typeName = `a11y-${Math.random().toString(36).slice(2, 8)}`;
    const created = await create(app, { type: `  ${typeName} ` });
    expect(created.type).toBe(typeName);

    const types = await app.inject({ method: 'GET', url: '/skill-types' });
    const names = (types.json() as { name: string }[]).map((x) => x.name);
    expect(names).toContain(typeName);
    expect(names).not.toContain(`  ${typeName} `);

    const blank = await app.inject({ method: 'POST', url: '/skills', payload: body({ type: '   ' }) });
    expect(blank.statusCode).toBe(422);
  });

  // ---- import preview -----------------------------------------------------

  it('previews a markdown import WITHOUT persisting it', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'secret-gate.md', content: '# Secret Gate\n\nFlags leaks.\n' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      name: 'Secret Gate',
      description: 'Flags leaks.',
      type: 'custom',
      source: 'manual',
      body: '# Secret Gate\n\nFlags leaks.\n',
    });

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];
    expect(after).toHaveLength(before.length);
  });

  it('422s an import with an empty file', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.md', content: '' },
    });
    expect(res.statusCode).toBe(422);
  });

  // ---- tenancy ------------------------------------------------------------

  it('never serves a skill from another workspace', async () => {
    const db = pg.handle.db;
    const [foreignWs] = await db
      .insert(t.workspaces)
      .values({ name: `other-${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    const [foreignSkill] = await db
      .insert(t.skills)
      .values({
        workspaceId: foreignWs!.id,
        name: 'foreign',
        description: 'not yours',
        type: 'custom',
        source: 'manual',
        body: '# secret v2',
        version: 2,
      })
      .returning();
    // restoreVersion is the one destructive cross-tenant path: it rewrites the
    // body and deletes every version NEWER than the one restored to. With only
    // a single version to restore to itself, that delete has nothing to do
    // either way, so the tenancy assertion below would pass whether or not the
    // workspace guard exists at all — give the foreign skill a real history (v1
    // then v2, matching its current row) so restoring to v1 actually exercises
    // the destructive path this test is meant to protect.
    await db.insert(t.skillVersions).values([
      { skillId: foreignSkill!.id, version: 1, body: '# secret' },
      { skillId: foreignSkill!.id, version: 2, body: '# secret v2' },
    ]);

    const app = await makeApp();
    // The default workspace is the request context, so the foreign row 404s.
    expect((await app.inject({ method: 'GET', url: `/skills/${foreignSkill!.id}` })).statusCode)
      .toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreignSkill!.id}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreignSkill!.id}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/skills/${foreignSkill!.id}` })).statusCode,
    ).toBe(404);

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as { id: string }[];
    expect(list.some((s) => s.id === foreignSkill!.id)).toBe(false);

    // And at the service layer, bypassing HTTP.
    const service = new SkillsService({ db } as unknown as Container);
    expect(await service.get(workspaceId, foreignSkill!.id)).toBeUndefined();
    expect(await service.listVersions(workspaceId, foreignSkill!.id)).toBeUndefined();
    expect(await service.restoreVersion(workspaceId, foreignSkill!.id, 1)).toBeUndefined();

    // The restore attempt must not have touched the foreign skill at all: its
    // live row stays at v2, and its v1/v2 snapshots are both still there (a
    // tenant-blind restore would delete the v2 snapshot as "newer than the
    // version restored to").
    const foreignAfter = await db
      .select()
      .from(t.skills)
      .where(eq(t.skills.id, foreignSkill!.id));
    expect(foreignAfter[0]!.body).toBe('# secret v2');
    expect(foreignAfter[0]!.version).toBe(2);

    const foreignVersions = await db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, foreignSkill!.id));
    expect(foreignVersions.map((v) => v.version).sort()).toEqual([1, 2]);
  });
});
