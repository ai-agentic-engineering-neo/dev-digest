import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[conventions] Docker not available — skipping integration tests.');

const FILES: Record<string, string> = {
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  'src/api/users.ts': 'import { db } from "../db";\n\nexport async function get(id: string) {\n  const user = await db.users.find(id);\n  return ok(user);\n}\n',
  'src/lib/redis.ts': 'import Redis from "ioredis";\nexport const redis = new Redis(config.redisUrl);\n',
};

/** Two candidates with real evidence, one hallucinated (line text not in the file). */
const EXTRACTION = {
  candidates: [
    { category: 'async', rule: 'Always use async/await instead of .then() chains', evidence_path: 'src/api/users.ts', evidence_line: 4, evidence_snippet: 'const user = await db.users.find(id);', confidence: 0.91 },
    { category: 'structure', rule: 'Redis access goes through the src/lib/redis.ts singleton', evidence_path: 'src/lib/redis.ts', evidence_line: 2, evidence_snippet: 'export const redis = new Redis(config.redisUrl);', confidence: 0.85 },
    { category: 'api', rule: 'All public route handlers return typed Result<T, ApiError>', evidence_path: 'src/api/users.ts', evidence_line: 5, evidence_snippet: 'function handler(): Result<Item[], ApiError>', confidence: 0.78 },
  ],
};

async function waitScan(app: Awaited<ReturnType<typeof buildApp>>, repoId: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    if (view.scan && view.scan.status !== 'running') return view;
    if (Date.now() - start > timeoutMs) throw new Error('scan did not finish');
    await new Promise((r) => setTimeout(r, 100));
  }
}

d('HW2 conventions extractor (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conv-api', fullName: 'acme/conv-api', clonePath: '/tmp/conv-api' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(extraction: unknown = EXTRACTION) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const repoIntel = { getConventionSamples: async () => ['src/api/users.ts', 'src/lib/redis.ts'] } as unknown as RepoIntel;
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ files: FILES }),
        repoIntel,
        llm: { openai: new MockLLMProvider('openai', { structured: extraction }) },
      },
    });
  }

  it('extract: picks samples in code, calls the model once, keeps only evidenced candidates, persists the scan', async () => {
    const app = await makeApp();
    const empty = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(empty).toEqual({ scan: null, candidates: [] });

    const started = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(started.statusCode).toBe(202);
    expect(started.json().scan.status).toBe('running');

    const view = await waitScan(app, repoId);
    expect(view.scan).toMatchObject({ status: 'done', sample_count: 3, candidates_found: 3, candidates_kept: 2, provider: 'openai' });
    expect(view.candidates.map((c: { rule: string }) => c.rule)).toEqual([
      'Always use async/await instead of .then() chains',
      'Redis access goes through the src/lib/redis.ts singleton',
    ]);
    expect(view.candidates[0]).toMatchObject({ category: 'async', evidence_path: 'src/api/users.ts', evidence_line: 4, status: 'candidate' });
    // persisted, not in memory
    const rows = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
    expect(rows).toHaveLength(2);
    await app.close();
  });

  it('accept / reject / edit persist; a rejected rule does not come back on re-scan; accepted ones become repo-conventions linked to an agent', async () => {
    const app = await makeApp();
    let view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const [asyncRule, redisRule] = view.candidates as Array<{ id: string; rule: string }>;

    const edited = (
      await app.inject({ method: 'PUT', url: `/conventions/${asyncRule!.id}`, payload: { status: 'accepted', rule: 'Use async/await, never .then() chains.', category: 'style' } })
    ).json();
    expect(edited).toMatchObject({ status: 'accepted', rule: 'Use async/await, never .then() chains.', category: 'style' });
    expect((await app.inject({ method: 'PUT', url: `/conventions/${redisRule!.id}`, payload: { status: 'rejected' } })).json().status).toBe('rejected');

    // re-scan: the rejected rule stays rejected, the accepted one is re-extracted as a fresh candidate
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    view = await waitScan(app, repoId);
    const byRule = new Map((view.candidates as Array<{ rule: string; status: string }>).map((c) => [c.rule, c.status]));
    expect(byRule.get('Redis access goes through the src/lib/redis.ts singleton')).toBe('rejected');
    expect(byRule.get('Always use async/await instead of .then() chains')).toBe('candidate');
    expect(view.scan.candidates_kept).toBe(1);

    // nothing accepted → draft is a 422; accept one → draft + create skill
    expect((await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })).statusCode).toBe(422);
    const fresh = (view.candidates as Array<{ id: string; status: string }>).find((c) => c.status === 'candidate')!;
    await app.inject({ method: 'PUT', url: `/conventions/${fresh.id}`, payload: { status: 'accepted' } });
    const draft = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })).json();
    expect(draft).toMatchObject({ name: 'repo-conventions', type: 'convention', accepted_count: 1, existing_skill_id: null });
    expect(draft.body).toContain('Always use async/await');
    expect(draft.body).not.toContain('Redis access');

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{ id: string; name: string; skill_count: number }>;
    const general = agents.find((a) => a.name === 'General Reviewer')!;
    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { ...draft, body: `${draft.body}\n\n(edited in the modal)`, description: 'House rules.', agent_id: general.id },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().skill).toMatchObject({ name: 'repo-conventions', source: 'extracted', version: 1, description: 'House rules.' });
    expect(created.json().skill.body).toContain('(edited in the modal)');
    expect(created.json().updated_existing).toBe(false);
    const linked = (await app.inject({ method: 'GET', url: `/agents/${general.id}/skills` })).json();
    expect(linked.map((l: { skill_id: string }) => l.skill_id)).toContain(created.json().skill.id);

    // saving again updates the existing skill as a new version instead of a 409
    const again = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: { ...draft, agent_id: general.id } });
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ updated_existing: true });
    expect(again.json().skill.version).toBe(2);

    // deselect all
    expect((await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/deselect` })).json()).toEqual({ updated: 1 });
    await app.close();
  });

  it('a failing model call is recorded on the scan, not thrown', async () => {
    const app = await makeApp({ not: 'an extraction' });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const view = await waitScan(app, repoId);
    expect(view.scan.status).toBe('failed');
    expect(view.scan.error).toMatch(/fixture failed schema/);
    // previous candidates are untouched by a failed scan
    expect(view.candidates.length).toBeGreaterThan(0);
    await app.close();
  });
});
