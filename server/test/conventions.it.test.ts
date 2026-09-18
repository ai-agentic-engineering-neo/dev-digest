import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const FIXTURE_PATH = 'src/middleware/ratelimit.ts';
const FIXTURE_TEXT = [
  'export function rateLimit() {',
  '  // Use p-queue, not a homemade limiter',
  '  return queue;',
  '}',
].join('\n');

const GROUNDED_RULE = 'Use p-queue, not a homemade limiter';

const EXTRACTION = {
  candidates: [
    {
      category: 'async',
      rule: GROUNDED_RULE,
      evidence_path: FIXTURE_PATH,
      evidence_start_line: 2,
      evidence_end_line: 2,
      evidence_snippet: 'Use p-queue, not a homemade limiter',
      confidence: 0.91,
    },
    {
      category: 'security',
      rule: 'Do not leak /etc/passwd',
      evidence_path: '../etc/passwd',
      evidence_start_line: 1,
      evidence_end_line: 1,
      evidence_snippet: 'root:',
      confidence: 0.4,
    },
  ],
};

function stubIntel(samples: string[]): RepoIntel {
  const index = {
    status: 'degraded' as const,
    filesIndexed: 0,
    filesSkipped: 0,
    durationMs: 0,
    reason: 'no_data',
  };
  return {
    indexRepo: async () => index,
    refreshIndex: async () => index,
    getIndexState: async () => ({
      ...index,
      repoId: '',
      lastIndexedSha: '',
      indexerVersion: 0,
      updatedAt: new Date(0),
      degraded: true,
      degradedReason: 'no_data',
    }),
    getBlastRadius: async () => ({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
    }),
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => samples,
    getTopFilesByRank: async () => samples,
    getCriticalPaths: async () => [],
  };
}

d('conventions extract / list / patch', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db.select().from(t.repos);
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts?: { files?: Record<string, string>; samples?: string[] }) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: opts?.files ?? { [FIXTURE_PATH]: FIXTURE_TEXT } }),
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: EXTRACTION },
          }),
        },
        repoIntel: stubIntel(opts?.samples ?? [FIXTURE_PATH]),
      },
    });
  }

  it('POST extract persists only grounded pending rows; GET includes metadata', async () => {
    const app = await makeApp();
    const skillsBefore = (await app.inject({ method: 'GET', url: '/skills' })).json() as {
      id: string;
    }[];

    const extracted = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(extracted.statusCode).toBe(200);
    const body = extracted.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      rule: GROUNDED_RULE,
      evidence_path: FIXTURE_PATH,
      status: 'pending',
      accepted: false,
    });
    expect(body.extracted_at).toEqual(expect.any(String));
    expect(body.sample_file_count).toBe(1);

    const listed = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);
    expect(listed.json().items[0].status).toBe('pending');
    expect(listed.json().sample_file_count).toBe(1);

    const skillsAfter = (await app.inject({ method: 'GET', url: '/skills' })).json() as {
      id: string;
    }[];
    expect(skillsAfter).toHaveLength(skillsBefore.length);
    await app.close();
  });

  it('second extract after PATCH accepted does not duplicate that rule+path', async () => {
    const app = await makeApp();
    const first = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const id = first.json().items[0].id as string;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${id}`,
      payload: { status: 'accepted' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ status: 'accepted', accepted: true });

    const second = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(second.statusCode).toBe(200);
    const items = second.json().items as { rule: string; status: string }[];
    const matches = items.filter((c) => c.rule === GROUNDED_RULE);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('accepted');
    await app.close();
  });

  it('unknown / other-workspace repo is 404; empty samples extract is 200', async () => {
    const app = await makeApp({ files: {}, samples: [] });
    expect(
      (await app.inject({ method: 'POST', url: '/repos/00000000-0000-0000-0000-000000000000/conventions/extract' }))
        .statusCode,
    ).toBe(404);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'conv-other' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: otherWs!.id,
        owner: 'other',
        name: 'ghost',
        fullName: 'other/ghost',
      })
      .returning();
    expect(
      (await app.inject({ method: 'POST', url: `/repos/${foreign!.id}/conventions/extract` })).statusCode,
    ).toBe(404);

    const empty = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().sample_file_count).toBe(0);
    await app.close();
  });
});
