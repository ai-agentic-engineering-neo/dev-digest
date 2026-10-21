import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
const INTENT = { intent: 'Adds rate limiting to the public API.', in_scope: ['limiter'], out_of_scope: [] };
const PLAN = 'docs/plans/rate-limit.md';
const BODY = `Add rate limiting to the public endpoints. Closes #471. Plan: ${PLAN}. `.repeat(3);

type App = Awaited<ReturnType<typeof buildApp>>;

d('PR intent (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(ws = workspaceId) {
    const name = `intent-api-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        status: 'needs_review',
        body: BODY,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "x",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function appWith(opts: { intentLlm?: MockLLMProvider | null; github?: MockGitHubClient } = {}) {
    const intentLlm =
      opts.intentLlm === undefined
        ? new MockLLMProvider('openai', { structuredBySchema: { IntentDerivation: INTENT } })
        : opts.intentLlm;
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF, files: { [PLAN]: '# Plan\nRate limit the API.' } }),
        secrets: new MockSecretsProvider(),
        github:
          opts.github ??
          new MockGitHubClient({
            closingIssues: [471],
            issues: { 471: { number: 471, title: 'Rate limit', body: 'Throttle abusive clients', state: 'open' } },
          }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW }),
          ...(intentLlm ? { openrouter: intentLlm } : {}),
        },
      },
    });
    return { app, intentLlm };
  }

  async function makeAgent(app: App, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
  }

  const intentCalls = (llm: MockLLMProvider | null) =>
    llm ? llm.calls.filter((c) => c.method === 'completeStructured').length : 0;

  async function review(app: App, prId: string, agentId: string, expected: number) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, prId, { expected });
    return res.json().runs[0].run_id as string;
  }

  const trace = async (app: App, runId: string) =>
    (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

  it('derives intent before the agent and passes it into the prompt and trace', async () => {
    const { app, intentLlm } = await appWith();
    const pr = await newPr();
    const agent = await makeAgent(app, 'IntentAgent');
    const runId = await review(app, pr.id, agent.id, 1);

    const tr = await trace(app, runId);
    expect(tr.prompt_assembly.intent).toContain('Adds rate limiting');
    expect(tr.prompt_assembly.intent_confidence).toBe('high');
    expect(tr.prompt_assembly.user).toContain('<untrusted source="pr-intent">');
    expect(tr.prompt_assembly.user.indexOf('## PR intent')).toBeLessThan(
      tr.prompt_assembly.user.indexOf('## Diff to review'),
    );
    expect(tr.specs_read).toEqual(expect.arrayContaining(['#471', PLAN]));
    expect(tr.tool_calls[0]).toMatchObject({ tool: 'derive_intent', meta: 'fresh' });
    expect(
      tr.log.some((l: { msg: string }) => l.msg.startsWith('Intent derived: confidence=high')),
    ).toBe(true);
    expect(tr.log.some((l: { kind: string }) => l.kind === 'error')).toBe(false);
    expect(intentCalls(intentLlm)).toBe(1);
    await app.close();
  });

  it('reuses the cached intent across reviews and re-derives when the body changes', async () => {
    const { app, intentLlm } = await appWith();
    const pr = await newPr();
    const agent = await makeAgent(app, 'CacheAgent');
    await review(app, pr.id, agent.id, 1);
    const second = await review(app, pr.id, agent.id, 2);
    expect(intentCalls(intentLlm)).toBe(1);
    const tr = await trace(app, second);
    expect(tr.tool_calls[0]).toMatchObject({ tool: 'derive_intent', meta: 'cached' });
    expect(tr.prompt_assembly.intent).toContain('Adds rate limiting');

    await pg.handle.db
      .update(t.pullRequests)
      .set({ body: BODY + ' Now also covers admin routes.' })
      .where(eq(t.pullRequests.id, pr.id));
    await review(app, pr.id, agent.id, 3);
    expect(intentCalls(intentLlm)).toBe(2);
    await app.close();
  });

  it('AC2: derivation uses the review_intent feature model; a workspace override wins', async () => {
    const { app, intentLlm } = await appWith();
    const pr = await newPr();
    const agent = await makeAgent(app, 'ModelAgent');
    await review(app, pr.id, agent.id, 1);
    expect((intentLlm!.calls[0]!.req as { model: string }).model).toBe('deepseek/deepseek-v4-flash');

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } } },
    });
    expect(put.statusCode).toBe(200);
    await review(app, pr.id, agent.id, 2);
    expect((intentLlm!.calls.at(-1)!.req as { model: string }).model).toBe('z-ai/glm-4.7-flash');
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' } } },
    });
    await app.close();
  });

  it('AC6: no OpenRouter key never fails the review: intent null, info log, no error event', async () => {
    const { app } = await appWith({ intentLlm: null });
    const pr = await newPr();
    const agent = await makeAgent(app, 'NoKeyAgent');
    const runId = await review(app, pr.id, agent.id, 1);
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    const tr = await trace(app, runId);
    expect(tr.prompt_assembly.intent ?? null).toBeNull();
    expect(tr.prompt_assembly.user).not.toContain('## PR intent');
    const unavailable = tr.log.find((l: { msg: string }) => l.msg.startsWith('Intent unavailable:'));
    expect(unavailable?.kind).toBe('info');
    expect(tr.log.some((l: { kind: string }) => l.kind === 'error')).toBe(false);
    expect(tr.tool_calls[0]).toMatchObject({ tool: 'derive_intent', meta: 'failed' });
    await app.close();
  });

  it('AC6: GitHub down only drops the GitHub sources; the plan is still read from git', async () => {
    const { app } = await appWith({ github: new MockGitHubClient({ failReads: true }) });
    const pr = await newPr();
    const agent = await makeAgent(app, 'GhDownAgent');
    const runId = await review(app, pr.id, agent.id, 1);
    const tr = await trace(app, runId);
    expect(tr.prompt_assembly.intent_confidence).toBe('high');
    const intent = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(intent.sources).toContainEqual({
      kind: 'github_issue',
      ref: '#471',
      status: 'failed',
      reason: 'not_found_or_no_access',
    });
    await app.close();
  });

  it('GET /pulls/:id/intent: 404 before derivation, record + stale after, 404 for a foreign workspace', async () => {
    const { app } = await appWith();
    const pr = await newPr();
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).statusCode).toBe(404);

    const agent = await makeAgent(app, 'GetAgent');
    await review(app, pr.id, agent.id, 1);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      pr_id: pr.id,
      confidence: 'high',
      stale: false,
      provider: 'openrouter',
      head_sha: 'a1b2c3d4',
    });
    expect(body.sources.map((s: { kind: string }) => s.kind)).toEqual(
      expect.arrayContaining(['title', 'github_issue', 'repo_doc']),
    );
    expect(JSON.stringify(body)).not.toContain('Throttle abusive clients'); // content is never stored

    // Rows that no longer match the IntentSource contract are dropped on read, not cast.
    const stored = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    await pg.handle.db
      .update(t.prIntent)
      .set({ sources: [...stored[0]!.sources, { kind: 'bogus', ref: 'x', status: 'used' }] as never })
      .where(eq(t.prIntent.prId, pr.id));
    const after = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(after.sources).toHaveLength(body.sources.length);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'deadbeef' }).where(eq(t.pullRequests.id, pr.id));
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json().stale).toBe(true);

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await newPr(other!.id);
    expect((await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/intent` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/pulls/${foreign.id}/intent/refresh` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('POST /pulls/:id/intent/refresh re-derives; 502 when the provider fails', async () => {
    const { app, intentLlm } = await appWith();
    const pr = await newPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/refresh` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pr_id: pr.id, stale: false, intent: INTENT.intent });
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/refresh` });
    expect(intentCalls(intentLlm)).toBe(2);
    await app.close();

    const { app: bad } = await appWith({
      intentLlm: new MockLLMProvider('openai', { structuredBySchema: { IntentDerivation: { nope: 1 } } }),
    });
    const pr2 = await newPr();
    const failed = await bad.inject({ method: 'POST', url: `/pulls/${pr2.id}/intent/refresh` });
    expect(failed.statusCode).toBe(502);
    await bad.close();
  });
});
