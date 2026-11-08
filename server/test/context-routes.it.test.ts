import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import {
  AgentContextDocsSchema,
  ContextDocContentSchema,
  ContextDocListSchema,
} from '../src/modules/context/schemas.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Fake clone: the walker lists FILES' keys; readFile throws for anything else (like a missing file). */
const FILES: Record<string, string> = {
  'README.md': '# Payments API\n',
  'docs/a.md': 'x'.repeat(40),
  'specs/b.md': 'y'.repeat(80),
  'src/app.ts': 'export const secret = 1;',
};
class FakeGit extends MockGitClient {
  override async readFile(_repo: RepoRef, path: string): Promise<string> {
    const body = FILES[path];
    if (body === undefined) throw new Error(`ENOENT ${path}`);
    return body;
  }
}
const docWalker = { listMarkdown: async () => Object.keys(FILES).filter((p) => p.endsWith('.md')).sort() };

d('Context routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let agentId: string;
  let otherRepoId: string;
  let otherAgentId: string;

  async function newAgent(ws: string, name: string): Promise<string> {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openrouter', model: 'm', systemPrompt: 'p' })
      .returning();
    return a!.id;
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx-app', fullName: 'acme/ctx-app', clonePath: '/clones/ctx' })
      .returning();
    repoId = r!.id;
    agentId = await newAgent(workspaceId, 'Context Agent');

    // a second workspace with its own agent + repo
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [r2] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'evil', name: 'x', fullName: 'evil/x', clonePath: '/clones/x' })
      .returning();
    otherRepoId = r2!.id;
    otherAgentId = await newAgent(ws2!.id, 'Other Agent');
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new FakeGit({ files: {} }),
        docWalker,
      },
    });
  }

  it('lists classified docs with tokens and attached counts (AC-1)', async () => {
    const app = await makeApp();
    const before = ContextDocListSchema.parse((await app.inject({ url: `/repos/${repoId}/context-docs` })).json());
    expect(before.docs).toEqual([
      { path: 'README.md', source: 'readme', tokens: 4, attached_agents: 0 },
      { path: 'docs/a.md', source: 'docs', tokens: 10, attached_agents: 0 },
      { path: 'specs/b.md', source: 'specs', tokens: 20, attached_agents: 0 },
    ]);

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context-docs`,
      payload: { repo_id: repoId, paths: ['docs/a.md'] },
    });
    expect(put.statusCode).toBe(200);
    const after = ContextDocListSchema.parse((await app.inject({ url: `/repos/${repoId}/context-docs` })).json());
    expect(after.docs.find((x) => x.path === 'docs/a.md')!.attached_agents).toBe(1);

    await app.inject({ method: 'PUT', url: `/agents/${agentId}/context-docs`, payload: { repo_id: repoId, paths: [] } });
    await app.close();
  });

  it('returns a doc’s content and 404s for a non-doc path (AC-2)', async () => {
    const app = await makeApp();
    const ok = await app.inject({ url: `/repos/${repoId}/context-docs/content?path=docs/a.md` });
    expect(ok.statusCode).toBe(200);
    expect(ContextDocContentSchema.parse(ok.json()).content).toBe(FILES['docs/a.md']);

    for (const p of ['src/app.ts', '../.env', 'docs/nope.md']) {
      const res = await app.inject({ url: `/repos/${repoId}/context-docs/content?path=${encodeURIComponent(p)}` });
      expect(res.statusCode, p).toBe(404);
    }
    await app.close();
  });

  it('PUT then a fresh GET returns the same order; reorder persists; [] detaches; duplicate → 422 (AC-6)', async () => {
    const app = await makeApp();
    const url = `/agents/${agentId}/context-docs`;
    const get = async () =>
      AgentContextDocsSchema.parse((await app.inject({ url: `${url}?repo_id=${repoId}` })).json()).docs.map(
        (x) => [x.path, x.position, x.status],
      );

    await app.inject({ method: 'PUT', url, payload: { repo_id: repoId, paths: ['specs/b.md', 'docs/a.md'] } });
    expect(await get()).toEqual([
      ['specs/b.md', 0, 'ok'],
      ['docs/a.md', 1, 'ok'],
    ]);

    await app.inject({ method: 'PUT', url, payload: { repo_id: repoId, paths: ['docs/a.md', 'specs/b.md', 'docs/gone.md'] } });
    expect(await get()).toEqual([
      ['docs/a.md', 0, 'ok'],
      ['specs/b.md', 1, 'ok'],
      ['docs/gone.md', 2, 'missing'],
    ]);

    const dup = await app.inject({ method: 'PUT', url, payload: { repo_id: repoId, paths: ['docs/a.md', 'docs/a.md'] } });
    expect(dup.statusCode).toBe(422);
    const nonDoc = await app.inject({ method: 'PUT', url, payload: { repo_id: repoId, paths: ['src/app.ts'] } });
    expect(nonDoc.statusCode).toBe(422);
    expect(await get()).toHaveLength(3); // rejected writes changed nothing

    await app.inject({ method: 'PUT', url, payload: { repo_id: repoId, paths: [] } });
    expect(await get()).toEqual([]);
    await app.close();
  });

  it('another workspace’s agent or repo → 404 on every route (AC-13)', async () => {
    const app = await makeApp();
    const cases = [
      { method: 'GET' as const, url: `/repos/${otherRepoId}/context-docs` },
      { method: 'GET' as const, url: `/repos/${otherRepoId}/context-docs/content?path=README.md` },
      { method: 'GET' as const, url: `/agents/${otherAgentId}/context-docs?repo_id=${repoId}` },
      { method: 'GET' as const, url: `/agents/${agentId}/context-docs?repo_id=${otherRepoId}` },
    ];
    for (const c of cases) {
      expect((await app.inject(c)).statusCode, c.url).toBe(404);
    }
    for (const payload of [
      { url: `/agents/${otherAgentId}/context-docs`, payload: { repo_id: repoId, paths: ['docs/a.md'] } },
      { url: `/agents/${agentId}/context-docs`, payload: { repo_id: otherRepoId, paths: ['docs/a.md'] } },
    ]) {
      expect((await app.inject({ method: 'PUT', ...payload })).statusCode, payload.url).toBe(404);
    }
    const leaked = await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.repoId, otherRepoId));
    expect(leaked).toHaveLength(0);
    await app.close();
  });

  it('deleting the agent removes its attachment rows (cascade, AC-13)', async () => {
    const app = await makeApp();
    const tmpAgent = await newAgent(workspaceId, 'Temp Agent');
    await app.inject({
      method: 'PUT',
      url: `/agents/${tmpAgent}/context-docs`,
      payload: { repo_id: repoId, paths: ['docs/a.md'] },
    });
    const rows = () =>
      pg.handle.db
        .select()
        .from(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, tmpAgent), eq(t.agentContextDocs.repoId, repoId)));
    expect(await rows()).toHaveLength(1);
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, tmpAgent));
    expect(await rows()).toHaveLength(0);
    await app.close();
  });

  it('a repo without a clone lists no docs (not_cloned)', async () => {
    const app = await makeApp();
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'no-clone', fullName: 'acme/no-clone' })
      .returning();
    const body = ContextDocListSchema.parse((await app.inject({ url: `/repos/${r!.id}/context-docs` })).json());
    expect(body).toEqual({ repo_id: r!.id, state: { status: 'not_cloned' }, docs: [] });
    await app.close();
  });
});
