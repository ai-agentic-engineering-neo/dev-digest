import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { ConventionCandidate, ConventionsList } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * L02 — conventions end to end against real Postgres: the seeded extraction,
 * accept / reject / edit, Accept all, extraction (code-only sampling → one
 * model call → evidence gate) replacing every candidate, and composing a skill
 * with `source: 'extracted'`.
 */

const REDIS_TS = "import Redis from 'ioredis';\nexport const redis = new Redis(config.redisUrl);\n";
const HANDLER_TS = 'export async function handler() {\n  const items = await repo.list();\n  return ok(items);\n}\n';

const EXTRACTION = {
  conventions: [
    {
      category: 'structure',
      rule: 'Redis access goes through the src/lib/redis.ts singleton',
      evidence_path: 'src/lib/redis.ts',
      line: 2,
      quote: 'export const redis = new Redis(config.redisUrl);',
      confidence: 0.88,
    },
    {
      category: 'error-handling',
      rule: 'Handlers wrap results in ok()',
      evidence_path: 'src/api/handler.ts',
      line: 3,
      quote: 'return ok(items);',
      confidence: 0.7,
    },
    {
      category: 'naming',
      rule: 'Hallucinated rule',
      evidence_path: 'src/api/handler.ts',
      line: 2,
      quote: 'const things = await db.findEverything();',
      confidence: 0.95,
    },
  ],
};

d('L02 conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;
  let llm: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });
    const repoIntel = {
      getConventionSamples: async () => ['src/lib/redis.ts', 'src/api/handler.ts'],
    } as unknown as RepoIntel;
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({
          files: {
            'src/lib/redis.ts': REDIS_TS,
            'src/api/handler.ts': HANDLER_TS,
            '.prettierrc': '{ "singleQuote": true }',
          },
        }),
        llm: { openai: llm },
        repoIntel,
      },
    });
  }

  it('lists the seeded extraction for the demo repo', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ConventionsList;
    expect(body.scan).toMatchObject({ status: 'done', files_sampled: 84 });
    expect(body.items.map((i) => i.confidence)).toEqual([0.91, 0.85, 0.78]);
    expect(body.items.every((i) => i.status === 'pending')).toBe(true);
    await app.close();
  });

  it('edits, accepts, rejects one candidate and resolves the rest with Accept all', async () => {
    const app = await makeApp();
    const { items } = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionsList;
    const [first, second] = items as [ConventionCandidate, ConventionCandidate];

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${first.id}`,
      payload: { rule: 'Use async/await, never .then()', category: 'style', status: 'accepted' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ rule: 'Use async/await, never .then()', status: 'accepted' });

    const rejected = await app.inject({ method: 'PATCH', url: `/conventions/${second.id}`, payload: { status: 'rejected' } });
    expect(rejected.json().status).toBe('rejected');

    const bulk = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/bulk`,
      payload: { status: 'accepted' },
    });
    expect(bulk.json()).toEqual({ updated: 1 });

    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionsList;
    expect(after.items.map((i) => i.status).sort()).toEqual(['accepted', 'accepted', 'rejected']);

    const bad = await app.inject({ method: 'PATCH', url: `/conventions/${first.id}`, payload: { status: 'maybe' } });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('refuses to extract from an uncloned repo, and 404s an unknown repo', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_indexed');
    const missing = await app.inject({
      method: 'GET',
      url: '/repos/00000000-0000-0000-0000-000000000000/conventions',
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('extracts: code-only sampling, one model call, unverified candidates dropped, all replaced', async () => {
    await pg.handle.db.update(t.repos).set({ clonePath: '/mock/clones/acme/payments-api' }).where(eq(t.repos.id, repoId));
    const app = await makeApp();

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(202);
    expect(res.json().scan.status).toBe('running');

    let list: ConventionsList | undefined;
    await vi.waitFor(
      async () => {
        list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionsList;
        expect(list.scan?.status).toBe('done');
      },
      { timeout: 5000, interval: 100 },
    );

    expect(list!.scan!.files_sampled).toBe(3);
    expect(list!.items.map((i) => [i.rule, i.evidence_line, i.status])).toEqual([
      ['Redis access goes through the src/lib/redis.ts singleton', 2, 'pending'],
      ['Handlers wrap results in ok()', 3, 'pending'],
    ]);
    expect(list!.items[0]!.evidence_snippet).toContain('export const redis = new Redis(config.redisUrl);');

    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0]!.req)).toContain('untrusted source=\\".prettierrc\\"');
    await app.close();
  });

  it('creates an extracted skill with its evidence files', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'repo-conventions',
        description: 'Apply on every PR to payments-api.',
        type: 'convention',
        body: '## Structure\n- Redis access goes through the singleton',
        source: 'extracted',
        evidence_files: ['src/lib/redis.ts'],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ source: 'extracted', enabled: true, evidence_files: ['src/lib/redis.ts'] });
    await app.close();
  });
});
