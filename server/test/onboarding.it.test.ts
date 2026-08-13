import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Onboarding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

/**
 * specs/10-onboarding-generator.md — DB-backed coverage: `onboarding` table
 * jsonb round-trip (AC-21), the real `GET`/`POST /repos/:id/tour[/generate]`
 * routes end-to-end (AC-19, AC-22, AC-37, AC-38), and workspace scoping
 * through the ACTUAL route, not just the service layer (AC-49).
 */
d('onboarding (Testcontainers pg)', () => {
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
    const name = `onboarding-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!.id;
  }

  /** Seeds a minimal but genuinely GENERATABLE index directly into Postgres
   *  (repo_index_state + file_rank) — no real clone/indexer run needed. */
  async function seedGeneratableIndex(repoId: string): Promise<void> {
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'sha-abc123',
      indexerVersion: 2,
      status: 'full',
      filesIndexed: 2,
      filesSkipped: 0,
      stats: { durationMs: 5, hotnessPrs: 0, hotnessWindowDays: 180 },
    });
    await pg.handle.db.insert(t.fileRank).values([
      { repoId, filePath: 'src/a.ts', pagerank: 1, hotness: 0, rank: 1, percentile: 99 },
      { repoId, filePath: 'src/b.ts', pagerank: 0.5, hotness: 0, rank: 0.5, percentile: 80 },
    ]);
  }

  const RAW_OUTPUT = {
    architecture: { title: 'Overview', body: 'A small demo service.' },
    critical_paths: { title: 'Critical paths', entries: [] },
    run_locally: { title: 'Run locally', steps: [] },
    reading_path: { title: 'Reading path', entries: [{ path: 'src/a.ts', reason: 'entry point' }] },
    first_tasks: {
      title: 'First tasks',
      tasks: [{ title: 'Add a test', body: 'Write a test for a.ts', files: ['src/a.ts'] }],
    },
  };

  describe('OnboardingRepository — jsonb round-trip', () => {
    it('persists and reads back a tour, including its nested `sections` jsonb, and re-upsert replaces the one row (D5)', async () => {
      const repo = new OnboardingRepository(pg.handle.db);
      const repoId = await createRepo(workspaceId);

      const tour: Onboarding = {
        sections: [
          {
            kind: 'reading_path',
            title: 'Reading path',
            body: 'Start here.',
            links: [],
            entries: [{ path: 'src/a.ts', chain: ['src/b.ts'], reason: 'entry point' }],
          },
        ],
      };

      await repo.upsertTour({
        repoId,
        json: tour,
        indexSha: 'sha-1',
        indexerVersion: 2,
        indexUpdatedAt: new Date('2026-01-01T00:00:00Z'),
        filesIndexed: 10,
        filesExcluded: 1,
        prsWeighted: 2,
        provider: 'openai',
        model: 'gpt-x',
        attempts: 1,
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.01,
      });

      const row = await repo.getTour(repoId);
      expect(row).toBeDefined();
      expect(row!.json).toEqual(tour); // nested entries/chain survive the jsonb round-trip intact
      expect(row!.indexSha).toBe('sha-1');
      expect(row!.filesExcluded).toBe(1);
      expect(row!.costUsd).toBeCloseTo(0.01);

      // Regeneration (D5: "one repo, one current tour") replaces the SAME row.
      const secondTour: Onboarding = {
        sections: [{ kind: 'architecture', title: 'V2', body: 'Updated.', links: [] }],
      };
      await repo.upsertTour({
        repoId,
        json: secondTour,
        indexSha: 'sha-2',
        indexerVersion: 2,
        indexUpdatedAt: new Date('2026-02-01T00:00:00Z'),
        filesIndexed: 12,
        filesExcluded: 0,
        prsWeighted: 3,
        provider: 'openai',
        model: 'gpt-y',
        attempts: 2,
        tokensIn: 200,
        tokensOut: 80,
        costUsd: 0.02,
      });

      const updated = await repo.getTour(repoId);
      expect(updated!.json).toEqual(secondTour);
      expect(updated!.indexSha).toBe('sha-2');

      const allRows = await pg.handle.db.select().from(t.onboarding);
      expect(allRows.filter((r) => r.repoId === repoId)).toHaveLength(1); // still exactly one row
    });
  });

  describe('GET/POST /repos/:id/tour — real routes', () => {
    it('AC-37/AC-38: no checkout and no index at all → empty state on GET, and generation refuses with zero provider calls', async () => {
      const llm = new MockLLMProvider('openai', { structuredBySchema: { OnboardingGenerationOutput: RAW_OUTPUT } });
      const app = await makeApp({ llm: { openrouter: llm } });
      const repoId = await createRepo(workspaceId, null);

      const get = await app.inject({ method: 'GET', url: `/repos/${repoId}/tour` });
      expect(get.statusCode).toBe(200);
      expect(get.json().status).toBe('empty');
      expect(get.json().tour).toBeNull();

      const post = await app.inject({ method: 'POST', url: `/repos/${repoId}/tour/generate` });
      expect(post.statusCode).toBe(200);
      expect(post.json().status).toBe('empty');
      expect(llm.calls).toHaveLength(0); // AC-38: zero provider calls

      await app.close();
    });

    it('AC-13/AC-19/AC-21/AC-22: generate stores a real tour, GET serves it with zero further provider calls', async () => {
      const llm = new MockLLMProvider('openai', { structuredBySchema: { OnboardingGenerationOutput: RAW_OUTPUT } });
      const app = await makeApp({ llm: { openrouter: llm } });
      const repoId = await createRepo(workspaceId, null);
      await seedGeneratableIndex(repoId);

      // AC-19: opening the page before ever generating makes zero provider calls.
      const beforeGet = await app.inject({ method: 'GET', url: `/repos/${repoId}/tour` });
      expect(beforeGet.statusCode).toBe(200);
      expect(beforeGet.json().status).toBe('skeleton');
      expect(llm.calls).toHaveLength(0);

      const generate = await app.inject({ method: 'POST', url: `/repos/${repoId}/tour/generate` });
      expect(generate.statusCode).toBe(200);
      const generated = generate.json();
      expect(generated.status).toBe('generated');
      expect(generated.tour.sections.map((s: { kind: string }) => s.kind)).toEqual([
        'architecture',
        'critical_paths',
        'run_locally',
        'reading_path',
        'first_tasks',
      ]);
      expect(generated.provenance.index_sha).toBe('sha-abc123');
      expect(generated.provenance.model).toBeTruthy();
      expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1); // AC-13

      // Persisted for real — confirm the row exists directly against Postgres.
      const persisted = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
      expect(persisted).toHaveLength(1);
      expect((persisted[0]!.json as Onboarding).sections).toHaveLength(5);

      // AC-22: a subsequent GET serves the stored tour — no new provider call.
      const afterGet = await app.inject({ method: 'GET', url: `/repos/${repoId}/tour` });
      expect(afterGet.statusCode).toBe(200);
      expect(afterGet.json().status).toBe('generated');
      expect(afterGet.json().tour.sections).toHaveLength(5);
      expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1); // still 1 — GET spent nothing

      await app.close();
    });

    it('AC-49: a repo in a different workspace is not disclosed on GET or POST (404, not the tour)', async () => {
      const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'onboarding-other-ws' }).returning();
      const foreignRepoId = await createRepo(otherWs!.id, null);
      await seedGeneratableIndex(foreignRepoId);
      // Even give the foreign repo a REAL stored tour — it must still 404, not leak.
      await new OnboardingRepository(pg.handle.db).upsertTour({
        repoId: foreignRepoId,
        json: { sections: [{ kind: 'architecture', title: 'Secret', body: 'x', links: [] }] },
        indexSha: 'sha-foreign',
        indexerVersion: 2,
        indexUpdatedAt: new Date(),
        filesIndexed: 1,
        filesExcluded: 0,
        prsWeighted: 0,
        provider: 'openai',
        model: 'gpt-x',
        attempts: 1,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
      });

      const llm = new MockLLMProvider('openai', { structuredBySchema: { OnboardingGenerationOutput: RAW_OUTPUT } });
      const app = await makeApp({ llm: { openrouter: llm } });

      const get = await app.inject({ method: 'GET', url: `/repos/${foreignRepoId}/tour` });
      expect(get.statusCode).toBe(404);
      expect(JSON.stringify(get.json())).not.toContain('Secret'); // never leaked in the error body either

      const post = await app.inject({ method: 'POST', url: `/repos/${foreignRepoId}/tour/generate` });
      expect(post.statusCode).toBe(404);
      expect(llm.calls).toHaveLength(0); // never even attempted generation for a foreign repo

      await app.close();
    });
  });
});
