import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { BriefRepository } from '../src/modules/brief/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

/**
 * specs/11-why-risk-brief.md — DB-backed coverage: `pr_brief` jsonb
 * round-trip, the real `GET`/`POST /pulls/:id/brief[/generate]` routes
 * end-to-end (AC-10, AC-22, AC-24, AC-31), and workspace scoping through the
 * ACTUAL route, not just the service layer (AC-44).
 */
d('brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(overrides: Parameters<typeof buildApp>[0]['overrides'] = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), ...overrides },
    });
  }

  let repoSeq = 0;
  async function createRepo(ws: string, clonePath: string | null = null): Promise<string> {
    const name = `brief-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!.id;
  }

  async function createPull(
    ws: string,
    repoId: string,
    overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
  ): Promise<string> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId,
        number: 1,
        title: 'Fix rate limiting',
        author: 'someone',
        branch: 'feat/x',
        base: 'main',
        headSha: 'sha-head',
        additions: 10,
        deletions: 2,
        filesCount: 1,
        status: 'open',
        ...overrides,
      })
      .returning();
    return pr!.id;
  }

  async function addPrFile(prId: string, path = 'src/a.ts', patch: string | null = '@@ -1,2 +1,2 @@\n-x\n+y') {
    await pg.handle.db.insert(t.prFiles).values({ prId, path, additions: 5, deletions: 1, patch });
  }

  const RAW_OUTPUT = {
    what: 'Adds rate limiting.',
    why: 'Prevents abuse.',
    risk_level: 'medium',
    risks: [
      {
        kind: 'performance',
        title: 'Hot path',
        explanation: 'Touches the handler.',
        severity: 'medium',
        file_refs: [{ file: 'src/a.ts', line: null }],
      },
    ],
    review_focus: [{ file: 'src/a.ts', line: null, reason: 'Core change.' }],
  };

  describe('BriefRepository — jsonb round-trip', () => {
    it('persists and reads back a brief, and re-upsert replaces the one row (D8)', async () => {
      const repo = new BriefRepository(pg.handle.db);
      const repoId = await createRepo(workspaceId);
      const prId = await createPull(workspaceId, repoId);

      const brief = {
        what: 'w',
        why: 'y',
        risk_level: 'low' as const,
        risks: [],
        review_focus: [],
      };
      await repo.upsertBrief({
        prId,
        json: brief,
        headSha: 'sha-head',
        indexSha: 'idx-1',
        indexStatus: 'full',
        indexerVersion: 2,
        intentResolvedAt: null,
        provider: 'openai',
        model: 'gpt-x',
        attempts: 1,
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.01,
        droppedInputs: 0,
      });

      const row = await repo.getBrief(prId);
      expect(row).toBeDefined();
      expect(row!.json).toEqual(brief);
      expect(row!.headSha).toBe('sha-head');
      expect(row!.costUsd).toBeCloseTo(0.01);

      await repo.upsertBrief({
        prId,
        json: { ...brief, what: 'w2' },
        headSha: 'sha-head-2',
        indexSha: 'idx-2',
        indexStatus: 'full',
        indexerVersion: 2,
        intentResolvedAt: null,
        provider: 'openai',
        model: 'gpt-y',
        attempts: 1,
        tokensIn: 10,
        tokensOut: 10,
        costUsd: 0.02,
        droppedInputs: 1,
      });

      const updated = await repo.getBrief(prId);
      expect(updated!.headSha).toBe('sha-head-2');
      const allRows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
      expect(allRows).toHaveLength(1); // still exactly one row
    });
  });

  describe('GET/POST /pulls/:id/brief — real routes', () => {
    it('AC-31: an empty pr_files list refuses on POST, and GET reports none, zero provider calls', async () => {
      const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefGenerationOutput: RAW_OUTPUT } });
      const app = await makeApp({ llm: { openai: llm } });
      const repoId = await createRepo(workspaceId);
      const prId = await createPull(workspaceId, repoId);

      const get = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
      expect(get.statusCode).toBe(200);
      expect(get.json().status).toBe('none');

      const post = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief/generate`, payload: {} });
      expect(post.statusCode).toBe(200);
      expect(post.json().status).toBe('refused');
      expect(llm.calls).toHaveLength(0);

      await app.close();
    });

    it('AC-10/AC-22/AC-24: generate stores a real brief, GET serves it with zero further provider calls', async () => {
      const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefGenerationOutput: RAW_OUTPUT } });
      const app = await makeApp({ llm: { openai: llm } });
      const repoId = await createRepo(workspaceId);
      const prId = await createPull(workspaceId, repoId);
      await addPrFile(prId);

      const generate = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief/generate`, payload: {} });
      expect(generate.statusCode).toBe(200);
      const generated = generate.json();
      expect(generated.status).toBe('generated');
      expect(generated.brief.what).toBe('Adds rate limiting.');
      expect(generated.provenance.model).toBeTruthy();
      expect(llm.calls.filter((c: { method: string }) => c.method === 'completeStructured')).toHaveLength(1);

      const persisted = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
      expect(persisted).toHaveLength(1);

      const afterGet = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
      expect(afterGet.statusCode).toBe(200);
      expect(afterGet.json().status).toBe('generated');
      expect(llm.calls.filter((c: { method: string }) => c.method === 'completeStructured')).toHaveLength(1); // still 1

      // AC-24: a second generate (no regenerate) with no head-sha change spends nothing further.
      const secondGenerate = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief/generate`, payload: {} });
      expect(secondGenerate.statusCode).toBe(200);
      expect(llm.calls.filter((c: { method: string }) => c.method === 'completeStructured')).toHaveLength(1);

      await app.close();
    });

    it('AC-44: a PR in a different workspace 404s on GET and POST, never disclosing its stored brief', async () => {
      const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'brief-other-ws' }).returning();
      const foreignRepoId = await createRepo(otherWs!.id);
      const foreignPrId = await createPull(otherWs!.id, foreignRepoId);
      await addPrFile(foreignPrId);
      await new BriefRepository(pg.handle.db).upsertBrief({
        prId: foreignPrId,
        json: { what: 'Secret', why: 'x', risk_level: 'low', risks: [], review_focus: [] },
        headSha: 'sha-head',
        indexSha: null,
        indexStatus: null,
        indexerVersion: null,
        intentResolvedAt: null,
        provider: 'openai',
        model: 'gpt-x',
        attempts: 1,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
        droppedInputs: 0,
      });

      const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefGenerationOutput: RAW_OUTPUT } });
      const app = await makeApp({ llm: { openai: llm } });

      const get = await app.inject({ method: 'GET', url: `/pulls/${foreignPrId}/brief` });
      expect(get.statusCode).toBe(404);
      expect(JSON.stringify(get.json())).not.toContain('Secret');

      const post = await app.inject({ method: 'POST', url: `/pulls/${foreignPrId}/brief/generate`, payload: {} });
      expect(post.statusCode).toBe(404);
      expect(llm.calls).toHaveLength(0);

      await app.close();
    });
  });
});
