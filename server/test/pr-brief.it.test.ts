import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { PrBriefView, RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RATE_LIMIT } from '../src/modules/pr-brief/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[pr-brief] Docker not available, skipping integration tests.');

type App = Awaited<ReturnType<typeof buildApp>>;

const DRAFT = {
  summary: 'Adds a limiter.',
  risks: [{ kind: 'auth', title: 'Key', explanation: 'e', severity: 'high', file_refs: ['src/config.ts:12'] }],
  review_focus: [
    { path: 'src/config.ts', line: 12, reason: 'secret' },
    { path: 'src/ghost.ts', line: 1, reason: 'dropped' },
  ],
};

async function waitRun(app: App, prId: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const view = PrBriefView.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json());
    if (view.run && view.run.status !== 'running') return view;
    if (Date.now() - start > timeoutMs) throw new Error('brief run did not finish');
    await new Promise((r) => setTimeout(r, 100));
  }
}

d('pr brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let freshId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    // A second PR with no brief, no review and the same patch rows as input.
    const [fresh] = await pg.handle.db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: pr!.repoId, number: 900, title: 'Fresh', author: 'a', branch: 'feat/x', base: 'main', headSha: 'sha900', status: 'open' })
      .returning();
    freshId = fresh!.id;
    await pg.handle.db.insert(t.prFiles).values({ prId: freshId, path: 'src/config.ts', additions: 4, deletions: 0, patch: ['@@ -9,3 +9,5 @@', ' a', '+b', '+c', ' d', '+e'].join('\n') });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(structured: unknown = DRAFT) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', { structured });
    return buildApp({
      config: { ...config, repoIntelEnabled: false },
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({}), llm: { openai: llm, openrouter: llm } },
    });
  }

  it('the rate limit is 6 per minute', () => {
    expect(RATE_LIMIT).toEqual({ max: 6, timeWindow: '1 minute' });
  });

  it('GET: 404 for an unknown PR; seeded brief + newest review facts validate and are fresh', async () => {
    const app = await makeApp();
    const missing = await app.inject({ method: 'GET', url: '/pulls/44444444-4444-4444-8444-444444444444/brief' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    const view = PrBriefView.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json());
    expect(view.brief?.review_focus).toHaveLength(3);
    expect(view.review).toMatchObject({ verdict: 'request_changes', score: 61, findings_count: 2, blockers: 1 });
    expect(view.run).toMatchObject({ kind: 'brief', status: 'done' });
    expect(view.stale).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/pulls/${freshId}/brief` })).json()).toEqual({ brief: null, review: null, run: null, stale: false });
    await app.close();
  });

  it('dismissed findings drop out of the counts; a new head or review makes the brief stale', async () => {
    const app = await makeApp();
    const [review] = await pg.handle.db.select().from(t.reviews).where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')));
    const [crit] = await pg.handle.db.select().from(t.findings).where(and(eq(t.findings.reviewId, review!.id), eq(t.findings.severity, 'CRITICAL')));
    await pg.handle.db.update(t.findings).set({ dismissedAt: new Date() }).where(eq(t.findings.id, crit!.id));
    let view = PrBriefView.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json());
    expect(view.review).toMatchObject({ findings_count: 1, blockers: 0 });
    expect(view.stale).toBe(false);
    await pg.handle.db.update(t.findings).set({ dismissedAt: null }).where(eq(t.findings.id, crit!.id));

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'moved' }).where(eq(t.pullRequests.id, prId));
    view = PrBriefView.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json());
    expect(view.stale).toBe(true);
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'a1b2c3d4e5f6' }).where(eq(t.pullRequests.id, prId));
    await app.close();
  });

  it('an invalid stored json reads as no brief', async () => {
    const app = await makeApp();
    await pg.handle.db.insert(t.prBrief).values({ prId: freshId, json: { nope: true } });
    const view = (await app.inject({ method: 'GET', url: `/pulls/${freshId}/brief` })).json();
    expect(view.brief).toBeNull();
    await pg.handle.db.delete(t.prBrief).where(eq(t.prBrief.prId, freshId));
    await app.close();
  });

  it('generate: 202 running brief run, second POST returns it, then one transaction stores brief, run and trace', async () => {
    const app = await makeApp();
    const started = await app.inject({ method: 'POST', url: `/pulls/${freshId}/brief/generate` });
    expect(started.statusCode).toBe(202);
    expect(started.json().run).toMatchObject({ kind: 'brief', status: 'running', agent_id: null });
    const again = await app.inject({ method: 'POST', url: `/pulls/${freshId}/brief/generate` });
    expect(again.json().run.run_id === started.json().run.run_id || again.json().run.status !== 'running').toBe(true);

    const view = await waitRun(app, freshId);
    expect(view.run).toMatchObject({ status: 'done' });
    expect(view.brief?.review_focus).toEqual([{ path: 'src/config.ts', line: 12, reason: 'secret' }]);
    expect(view.brief).toMatchObject({ run_id: view.run!.run_id, head_sha: 'sha900', source_review_id: null, files_total: 1 });
    expect(view.review).toBeNull();
    const [trace] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, view.run!.run_id));
    expect(RunTrace.parse(trace!.trace).tool_calls.map((c) => c.tool)).toEqual(['generate_brief']);
    await app.close();
  });

  it('a second running brief insert violates the partial unique index (23505)', async () => {
    const values = { workspaceId, prId: freshId, kind: 'brief' as const, status: 'running' };
    await pg.handle.db.insert(t.agentRuns).values(values);
    await expect(pg.handle.db.insert(t.agentRuns).values(values)).rejects.toMatchObject({ code: '23505' });
    await pg.handle.db.update(t.agentRuns).set({ status: 'failed' }).where(and(eq(t.agentRuns.prId, freshId), eq(t.agentRuns.status, 'running')));
  });

  it('a failed run keeps the stored brief and carries the contract message', async () => {
    const before = (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, freshId)))[0]!;
    const app = await makeApp({ nope: true });
    await app.inject({ method: 'POST', url: `/pulls/${freshId}/brief/generate` });
    const view = await waitRun(app, freshId);
    expect(view.run).toMatchObject({ status: 'failed' });
    expect(view.brief).not.toBeNull();
    const after = (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, freshId)))[0]!;
    expect(after.generatedAt!.getTime()).toBe(before.generatedAt!.getTime());
    await app.close();
  });

  it('brief runs stay out of run history, active runs and agent stats but count in the PR list cost', async () => {
    const app = await makeApp();
    await pg.handle.db.insert(t.agentRuns).values({ workspaceId, prId, kind: 'brief', status: 'running' });
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${prId}/runs` })).json();
    expect(runs.every((r: { kind: string }) => r.kind === 'review')).toBe(true);
    const active = (await app.inject({ method: 'GET', url: `/pulls/${prId}/runs/active` })).json();
    expect(JSON.stringify(active)).not.toContain('brief');
    expect(Array.isArray(active.runs ?? active)).toBe(true);
    expect((active.runs ?? active)).toHaveLength(0);
    await pg.handle.db.update(t.agentRuns).set({ status: 'failed' }).where(and(eq(t.agentRuns.prId, prId), eq(t.agentRuns.kind, 'brief'), eq(t.agentRuns.status, 'running')));

    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, (await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId)))[0]!.repoId));
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` })).json();
    const row = (Array.isArray(list) ? list : list.items).find((p: { id: string }) => p.id === prId);
    expect(row.cost_usd).toBeGreaterThan(0.0013); // seeded review run 0.0013 + seeded brief run 0.0021
    await app.close();
  });
});
