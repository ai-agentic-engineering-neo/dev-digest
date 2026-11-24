import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const USERS_TS = 'export async function find(id: string) {\n  const user = await db.users.find(id);\n  return user;\n}\n';

const GOOD = {
  rule: 'Use async/await instead of .then() chains',
  evidence_path: 'src/users.ts',
  evidence_snippet: 'const user = await db.users.find(id);',
  confidence: 0.9,
};
const BAD_PATH = { ...GOOD, rule: 'Ghost rule', evidence_path: 'src/ghost.ts' };
const BAD_SNIPPET = { ...GOOD, rule: 'Invented snippet', evidence_snippet: 'await nothing();' };

d('conventions module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clone: string;
  let samples: string[] = ['src/users.ts'];
  let fixture: { conventions: object[] } = { conventions: [GOOD, BAD_PATH, BAD_SNIPPET] };
  let llm: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    clone = await mkdtemp(join(tmpdir(), 'conv-'));
    await mkdir(join(clone, 'src'), { recursive: true });
    await writeFile(join(clone, 'src/users.ts'), USERS_TS);
    await writeFile(join(clone, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }');
  });
  afterAll(async () => {
    await pg?.stop();
    if (clone) await rm(clone, { recursive: true, force: true });
  });

  function makeApp() {
    llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionExtraction: fixture },
    });
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({}),
        llm: { openai: llm },
        repoIntel: { getConventionSamples: async () => samples } as unknown as RepoIntel,
      },
    });
  }

  async function newRepo(name: string, clonePath: string | null = clone) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!.id;
  }

  it('extracts, keeps only grounded candidates and sends the right files', async () => {
    const app = await makeApp();
    const repoId = await newRepo('conv-extract');
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      rule: GOOD.rule,
      evidence_path: 'src/users.ts',
      accepted: false,
    });
    expect(body.dropped).toBe(2);
    expect(body.sampled_files).toBe(1);

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const user = (call.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(user).toContain('src/users.ts');
    expect(user).toContain('tsconfig.json'); // config files go first
    await app.close();
  });

  it('GET / PATCH rule+accepted / bulk / DELETE', async () => {
    const app = await makeApp();
    const repoId = await newRepo('conv-crud');
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(list).toHaveLength(1);
    const id = list[0].id as string;

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { rule: 'Always await', accepted: true },
    });
    expect(edited.json()).toMatchObject({ rule: 'Always await', accepted: true });

    const empty = await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: {} });
    expect(empty.statusCode).toBe(422);

    const all = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions`,
      payload: { accepted: false },
    });
    expect(all.json()[0].accepted).toBe(false);

    expect((await app.inject({ method: 'DELETE', url: `/conventions/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('re-scan keeps accepted candidates and does not duplicate their rule', async () => {
    const app = await makeApp();
    const repoId = await newRepo('conv-rescan');
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const [first] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    await app.inject({ method: 'PATCH', url: `/conventions/${first.id}`, payload: { accepted: true } });

    const again = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const rows = again.json().candidates;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].accepted).toBe(true);
    await app.close();
  });

  it('409 when the repo has no indexed samples or no clone', async () => {
    const app = await makeApp();
    samples = [];
    const indexless = await newRepo('conv-noindex');
    const res = await app.inject({ method: 'POST', url: `/repos/${indexless}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_ready');
    samples = ['src/users.ts'];

    const noClone = await newRepo('conv-noclone', null);
    const res2 = await app.inject({ method: 'POST', url: `/repos/${noClone}/conventions/extract` });
    expect(res2.statusCode).toBe(409);
    await app.close();
  });

  it('is workspace-scoped: foreign repo and foreign convention are 404, no LLM call', async () => {
    const db = pg.handle.db;
    const app = await makeApp();
    const [other] = await db.insert(t.workspaces).values({ name: 'other-tenant-conv' }).returning();
    const [foreign] = await db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'evil', name: 'corp', fullName: 'evil/corp', clonePath: clone })
      .returning();
    const [conv] = await db
      .insert(t.conventions)
      .values({ workspaceId: other!.id, repoId: foreign!.id, rule: 'secret', accepted: false })
      .returning();

    for (const [method, url, payload] of [
      ['GET', `/repos/${foreign!.id}/conventions`, undefined],
      ['POST', `/repos/${foreign!.id}/conventions/extract`, undefined],
      ['PATCH', `/repos/${foreign!.id}/conventions`, { accepted: true }],
      ['PATCH', `/conventions/${conv!.id}`, { accepted: true }],
      ['DELETE', `/conventions/${conv!.id}`, undefined],
    ] as const) {
      const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
    await app.close();
  });

  it('POST /skills stores an extracted convention skill with evidence_files', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'conv-skill',
        description: 'Apply when X; check Y.',
        type: 'convention',
        source: 'extracted',
        body: '# conv',
        evidence_files: ['src/users.ts'],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      type: 'convention',
      source: 'extracted',
      evidence_files: ['src/users.ts'],
    });
    await app.close();
  });
});
