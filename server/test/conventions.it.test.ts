import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const USERS_TS = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const EXTRACTION = {
  candidates: [
    {
      category: 'async-await-only',
      rule: 'Always use async/await instead of .then() chains.',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
      confidence: 0.91,
    },
    {
      category: 'redis-singleton',
      rule: 'Redis access goes through src/lib/redis.ts.',
      evidence_path: 'src/lib/redis.ts', // not in the clone → dropped
      evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
      confidence: 0.85,
    },
    {
      category: 'invented',
      rule: 'Handlers return Result<T, ApiError>.',
      evidence_path: 'src/api/users.ts', // file exists, snippet does not → dropped
      evidence_snippet: 'return ok(items);',
      confidence: 0.78,
    },
  ],
};

/**
 * L02 conventions — extract (sampling → one LLM call → evidence verification),
 * accept/reject, and merge accepted candidates into a `convention` skill.
 */
d('/repos/:id/conventions', () => {
  let pg: PgFixture;
  let clone: string;
  let repoId: string;
  const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    clone = await mkdtemp(join(tmpdir(), 'conv-it-'));
    await mkdir(join(clone, 'src/api'), { recursive: true });
    await writeFile(join(clone, 'src/api/users.ts'), USERS_TS);
    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
    if (clone) await rm(clone, { recursive: true, force: true });
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ head: 'deadbeef' }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel: { getConventionSamples: async () => ['src/api/users.ts'] } as never,
      },
    });
  }

  const setClonePath = (path: string | null) =>
    pg.handle.db.update(t.repos).set({ clonePath: path }).where(eq(t.repos.id, repoId));

  it('returns an empty list before the first scan and 404s unknown repos', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.json()).toEqual({ scan: null, candidates: [] });
    const missing = await app.inject({ method: 'GET', url: '/repos/00000000-0000-0000-0000-000000000000/conventions' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('refuses to extract from a repo that is not cloned', async () => {
    await setClonePath(null);
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('extract → accept/reject → create skill from accepted only', async () => {
    await setClonePath(clone);
    const app = await makeApp();

    const extracted = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(extracted.statusCode).toBe(200);
    const list = extracted.json();
    expect(list.scan).toMatchObject({ repo_id: repoId, sample_file_count: 1, source_sha: 'deadbeef', model: 'gpt-5.4' });
    expect(list.candidates).toHaveLength(1);
    const [cand] = list.candidates;
    expect(cand).toMatchObject({
      category: 'async-await-only',
      evidence_path: 'src/api/users.ts',
      evidence_start_line: 4,
      evidence_end_line: 5,
      confidence: 0.91,
      status: 'pending',
    });
    const call = llm.calls.find((c) => c.method === 'completeStructured')!.req as { messages: { content: string }[] };
    expect(call.messages[1]!.content).toContain('### src/api/users.ts');

    // GET returns the same latest scan.
    expect((await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json()).toEqual(list);

    // Pending candidates can't be merged.
    const skillReq = { convention_ids: [cand.id], name: 'payments-api-conventions', description: '1 house convention' };
    const early = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: skillReq });
    expect(early.statusCode).toBe(422);

    const rejected = await app.inject({
      method: 'PUT', url: `/repos/${repoId}/conventions/${cand.id}`, payload: { status: 'rejected' },
    });
    expect(rejected.json().status).toBe('rejected');
    const undone = await app.inject({
      method: 'PUT', url: `/repos/${repoId}/conventions/${cand.id}`, payload: { status: 'pending' },
    });
    expect(undone.json().status).toBe('pending');
    const accepted = await app.inject({
      method: 'PUT', url: `/repos/${repoId}/conventions/${cand.id}`, payload: { status: 'accepted' },
    });
    expect(accepted.json().status).toBe('accepted');

    const created = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: skillReq });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'payments-api-conventions',
      type: 'convention',
      source: 'extracted',
      version: 1,
      enabled: false,
      evidence_files: ['src/api/users.ts:4-5'],
    });
    expect(skill.body).toContain('House conventions for `payments-api`');
    expect(skill.body).toContain('Detected in `src/api/users.ts:4-5`:');
    expect(skill.body).toContain('const user = await db.users.find(id);');

    // A user-edited body is stored verbatim.
    const edited = await app.inject({
      method: 'POST', url: `/repos/${repoId}/conventions/skill`,
      payload: { ...skillReq, name: 'edited-conventions', body: '# edited', enabled: true },
    });
    expect(edited.json()).toMatchObject({ body: '# edited', enabled: true });
    await app.close();
  });

  it('404s status updates for unknown candidates and 422s bad bodies', async () => {
    const app = await makeApp();
    const unknown = await app.inject({
      method: 'PUT', url: `/repos/${repoId}/conventions/00000000-0000-0000-0000-000000000000`, payload: { status: 'accepted' },
    });
    expect(unknown.statusCode).toBe(404);
    const bad = await app.inject({
      method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: { convention_ids: [], name: 'x', description: 'y' },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
