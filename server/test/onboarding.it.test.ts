import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { Onboarding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { DRAFT, FILES } from './helpers/onboarding.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[onboarding] Docker not available, skipping integration tests.');

type App = Awaited<ReturnType<typeof buildApp>>;

async function waitRun(app: App, repoId: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json();
    if (view.run && view.run.status !== 'running') return view;
    if (Date.now() - start > timeoutMs) throw new Error('run did not finish');
    await new Promise((r) => setTimeout(r, 100));
  }
}

d('onboarding tour (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let noCloneId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'tour-api', fullName: 'acme/tour-api', clonePath: '/tmp/tour-api' })
      .returning();
    repoId = repo!.id;
    const [bare] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'bare-api', fullName: 'acme/bare-api', clonePath: null })
      .returning();
    noCloneId = bare!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(structured: unknown = DRAFT) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const repoIntel = {
      getIndexState: async () => ({ status: 'full', filesIndexed: 120, updatedAt: new Date(0) }),
      getTopFilesByRank: async () => ['src/server.ts', 'src/lib/redis.ts'],
      getCriticalPaths: async () => [],
      getFileRank: async (_id: string, paths: string[]) => paths.filter((p) => p in FILES).map((path) => ({ path, percentile: 50 })),
    } as unknown as RepoIntel;
    return buildApp({
      config: { ...config, repoIntelEnabled: true },
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ files: FILES }),
        repoIntel,
        llm: { openai: new MockLLMProvider('openai', { structured }), openrouter: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  it('routes: unknown repo 404, no clone 422 and no run, GET on an empty repo', async () => {
    const app = await makeApp();
    const missing = await app.inject({ method: 'GET', url: '/repos/22222222-2222-4222-8222-222222222222/onboarding' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    const noClone = await app.inject({ method: 'POST', url: `/repos/${noCloneId}/onboarding/generate` });
    expect(noClone.statusCode).toBe(422);
    const rows = await pg.handle.db.select().from(t.onboardingRuns).where(eq(t.onboardingRuns.repoId, noCloneId));
    expect(rows).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json()).toEqual({ tour: null, run: null, stale: false });
    await app.close();
  });

  it('the seeded demo tour validates against the contract', async () => {
    const app = await makeApp();
    const [demo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    const view = (await app.inject({ method: 'GET', url: `/repos/${demo!.id}/onboarding` })).json();
    expect(Onboarding.safeParse(view.tour).success).toBe(true);
    expect(view.tour.sections[2].items[2].command).toBe('pnpm dev');
    await app.close();
  });

  it('generate: 202 running run, one model call, tour stored, a second start returns the same run', async () => {
    const app = await makeApp();
    const started = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(started.statusCode).toBe(202);
    expect(started.json().run.status).toBe('running');
    const again = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(again.json().run.id === started.json().run.id || again.json().run.status !== 'running').toBe(true);

    const view = await waitRun(app, repoId);
    expect(view.run).toMatchObject({ status: 'done', files_indexed: 120 });
    expect(view.tour.sections[1].items.map((i: { path: string }) => i.path)).toEqual(['src/server.ts']);
    expect(view.tour.sections[2].items.map((i: { command: string }) => i.command)).toEqual(['pnpm install', 'pnpm dev']);
    expect(view.stale).toBe(false);
    await app.close();
  });

  it('a second running insert violates the partial unique index (23505)', async () => {
    await pg.handle.db.insert(t.onboardingRuns).values({ workspaceId, repoId, status: 'running' });
    const second = pg.handle.db.insert(t.onboardingRuns).values({ workspaceId, repoId, status: 'running' });
    await expect(second).rejects.toMatchObject({ code: '23505' });
    await pg.handle.db.update(t.onboardingRuns).set({ status: 'failed' }).where(eq(t.onboardingRuns.status, 'running'));
  });

  it('a failed run keeps the stored tour (AC-33) and an invalid output carries the contract message (AC-35)', async () => {
    const before = (await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)))[0]!;
    const app = await makeApp({ nope: true });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    const view = await waitRun(app, repoId);
    expect(view.run).toMatchObject({ status: 'failed', error: 'The model returned an invalid tour' });
    expect(view.tour).not.toBeNull();
    const after = (await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)))[0]!;
    expect(after.generatedAt.getTime()).toBe(before.generatedAt.getTime());
    await app.close();
  });

  it('an old-shape json row reads as no tour (AC-51); a repo sync after generation makes it stale (AC-38)', async () => {
    const [old] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'old-api', fullName: 'acme/old-api', clonePath: '/tmp/old' })
      .returning();
    await pg.handle.db
      .insert(t.onboarding)
      .values({ repoId: old!.id, json: { sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }] } });
    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: `/repos/${old!.id}/onboarding` })).json().tour).toBeNull();

    await pg.handle.db.update(t.repos).set({ lastPolledAt: new Date(Date.now() + 60_000) }).where(eq(t.repos.id, repoId));
    expect((await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json().stale).toBe(true);
    await app.close();
  });

  it('deleting a repo cascades to the tour and its runs', async () => {
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));
    expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.onboardingRuns).where(eq(t.onboardingRuns.repoId, repoId))).toHaveLength(0);
  });
});
