import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { AuthProvider, LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { MockReviewLLMProvider } from '../src/adapters/llm/mock.js';
import { ConfigError } from '../src/platform/errors.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Conventions extractor end to end on a real Postgres with the key-free mock
 * LLM (server/specs/04-conventions.md acceptance criteria 1, 2, 5–10).
 */
d('conventions API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let clone: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let otherApp: Awaited<ReturnType<typeof buildApp>>;

  /** Never let a test reach the developer's real keys (~/.devdigest/secrets.json). */
  const noKey: LLMProvider = {
    id: 'openai',
    listModels: async () => [],
    complete: async () => {
      throw new ConfigError('OPENAI_API_KEY is not configured');
    },
    completeStructured: async () => {
      throw new ConfigError('OPENAI_API_KEY is not configured');
    },
    embed: async () => [],
  };

  const make = (llm: LLMProvider, auth?: AuthProvider) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient({ pulls: [] }),
        llm: { openai: llm, anthropic: llm, openrouter: llm },
        ...(auth ? { auth } : {}),
      },
    });

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    clone = await mkdtemp(join(tmpdir(), 'conv-it-'));
    await mkdir(join(clone, 'src/api'), { recursive: true });
    await writeFile(join(clone, 'package.json'), '{ "name": "demo", "type": "module" }\n');
    await writeFile(join(clone, 'src/api/users.ts'), "import { db } from '../db.js';\nexport const getUser = (id: string) => db.users.find(id);\n");
    await writeFile(join(clone, 'src/api/posts.ts'), "import { db } from '../db.js';\nexport const listPosts = (userId: string) => db.posts.findMany({ userId });\n");
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conv-demo', fullName: 'acme/conv-demo', clonePath: clone })
      .returning();
    repoId = repo!.id;
    app = await make(new MockReviewLLMProvider('openai'));
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'conv-other' }).returning();
    otherApp = await make(noKey, {
      currentUser: async () => ({ id: '00000000-0000-4000-8000-000000000002', email: 'o@x', name: 'Other' }),
      currentWorkspace: async () => ({ id: other!.id, name: 'conv-other' }),
    });
  });
  afterAll(async () => {
    await app?.close();
    await otherApp?.close();
    await pg?.stop();
    if (clone) await rm(clone, { recursive: true, force: true });
  });

  type State = {
    scan: { id: string; status: string; kept: number; proposed: number; dropped: { reason: string }[]; sampled_files: string[]; error?: string | null } | null;
    conventions: { id: string; rule: string; status: string; edited: boolean; skill_id?: string | null; evidence: { path: string; start_line: number; snippet: string }[] }[];
  };
  const state = async (on = app) => (await on.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as State;

  async function scanToEnd(on = app): Promise<State> {
    const res = await on.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode, res.body).toBe(202);
    expect(res.json().status).toBe('running');
    await on.container.jobs.onIdle();
    return state(on);
  }

  it('empty repo state, then a scan keeps only verified rules (mock LLM)', async () => {
    expect(await state()).toEqual({ scan: null, conventions: [] });
    const s = await scanToEnd();
    expect(s.scan).toMatchObject({ status: 'done', proposed: 3, kept: 2, dropped: [{ reason: 'file_not_found' }] });
    expect(s.scan!.sampled_files).toEqual(['package.json', 'src/api/posts.ts', 'src/api/users.ts']);
    expect(s.conventions).toHaveLength(2);
    expect(s.conventions.every((c) => c.status === 'pending')).toBe(true);
    expect(s.conventions[0]!.evidence[0]).toMatchObject({ path: 'src/api/posts.ts', start_line: 1 });
  });

  it('a second extract while one is running → 409 scan_running', async () => {
    await pg.handle.db.insert(t.conventionScans).values({ workspaceId, repoId, status: 'running' });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('scan_running');
    await pg.handle.db
      .update(t.conventionScans)
      .set({ status: 'failed' })
      .where(and(eq(t.conventionScans.repoId, repoId), eq(t.conventionScans.status, 'running')));
  });

  it('accept / reject / edit, and a re-scan keeps decided + edited rules', async () => {
    const [a, b] = (await state()).conventions;
    const patch = (id: string, payload: object) => app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload });

    const acc = await patch(a!.id, { status: 'accepted' });
    expect(acc.statusCode, acc.body).toBe(200);
    expect(acc.json()).toMatchObject({ status: 'accepted', edited: false });
    const edited = await patch(b!.id, { rule: 'Every API module exports arrow functions' });
    expect(edited.json()).toMatchObject({ status: 'pending', edited: true });
    expect((await patch(b!.id, {})).statusCode).toBe(422);

    const s = await scanToEnd();
    // a (accepted) and b (edited) survive; the fresh candidates duplicate a → dropped,
    // b's original text is new again (b was edited) → re-proposed as pending.
    expect(s.conventions.find((c) => c.id === a!.id)?.status).toBe('accepted');
    expect(s.conventions.find((c) => c.id === b!.id)?.rule).toBe('Every API module exports arrow functions');
    expect(s.scan!.dropped.map((d) => d.reason).sort()).toEqual(['duplicate', 'file_not_found']);
    expect(s.conventions).toHaveLength(3);
  });

  it('create skill from accepted rules links the agent and marks the rules', async () => {
    const accepted = (await state()).conventions.filter((c) => c.status === 'accepted');
    const [agent] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)).limit(1);
    const payload = {
      convention_ids: accepted.map((c) => c.id),
      name: 'conv-demo-conventions',
      description: 'House conventions of conv-demo',
      body: '# conv-demo-conventions\n\n- rule',
      enabled: true,
      agent_ids: [agent!.id],
    };

    const pending = (await state()).conventions.find((c) => c.status === 'pending')!;
    const bad = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { ...payload, convention_ids: [pending.id] },
    });
    expect(bad.statusCode).toBe(422);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload });
    expect(res.statusCode, res.body).toBe(201);
    const { skill, linked_agents } = res.json();
    expect(skill).toMatchObject({ name: 'conv-demo-conventions', source: 'extracted', enabled: true, version: 1, type: 'convention' });
    expect(skill.source_ref).toBe('conventions:acme/conv-demo');
    expect(linked_agents).toEqual([{ id: agent!.id, name: agent!.name, enabled: agent!.enabled }]);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent!.id}/skills` })).json() as { skill_id?: string; id?: string }[];
    expect(JSON.stringify(links)).toContain(skill.id);
    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions[0].message).toBe('Extracted from conventions of acme/conv-demo');
    expect((await state()).conventions.filter((c) => c.skill_id === skill.id)).toHaveLength(accepted.length);

    const dup = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: { ...payload, agent_ids: [] } });
    expect(dup.statusCode).toBe(409);
  });

  it('a model failure ends the scan failed with the error, keeping the rules', async () => {
    const before = (await state()).conventions.length;
    const failing = await make(noKey);
    try {
      const s = await scanToEnd(failing);
      expect(s.scan).toMatchObject({ status: 'failed' });
      expect(s.scan!.error).toMatch(/not configured/);
      expect(s.conventions).toHaveLength(before);
    } finally {
      await failing.close();
    }
  });

  it('every route is a 404 from another workspace', async () => {
    const [c] = (await state()).conventions;
    expect((await otherApp.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).statusCode).toBe(404);
    expect((await otherApp.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).statusCode).toBe(404);
    expect(
      (await otherApp.inject({ method: 'PATCH', url: `/conventions/${c!.id}`, payload: { status: 'rejected' } })).statusCode,
    ).toBe(404);
    expect(
      (
        await otherApp.inject({
          method: 'POST',
          url: `/repos/${repoId}/conventions/skill`,
          payload: { convention_ids: [c!.id], name: 'x', body: 'y' },
        })
      ).statusCode,
    ).toBe(404);
  });
});
