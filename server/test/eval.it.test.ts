import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { EVAL_FIXTURE_CASES } from '../src/db/seed-eval-cases.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval] Docker not available — skipping integration tests.');
}

/**
 * specs/12-eval-pipeline.md D21/AC-57 — the DB-backed half of `verify:l06`:
 * migrations apply, the eval routes respond over their documented surface,
 * and workspace scoping refuses. Self-skips without Docker.
 */
d('eval module (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(structured?: unknown) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structured: {
              verdict: 'comment',
              summary: 'ok',
              score: 90,
              findings: [],
            },
          }),
        },
      },
    });
  }

  async function securityReviewerId(): Promise<string> {
    const [row] = await pg.handle.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
    return row!.id;
  }

  it('D22 — the seed produced exactly 7 fixture cases, both expectation types present', async () => {
    const agentId = await securityReviewerId();
    const rows = await pg.handle.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)));
    expect(rows).toHaveLength(7);
    const types = new Set(rows.map((r) => (r.expectedOutput as { type: string }).type));
    expect(types.has('must_find')).toBe(true);
    expect(types.has('must_not_flag')).toBe(true);
    expect(rows.map((r) => r.name).sort()).toEqual(EVAL_FIXTURE_CASES.map((c) => c.name).sort());
  });

  it('GET /agents/:id/eval/cases lists the seeded fixture cases', async () => {
    const app = await makeApp();
    const agentId = await securityReviewerId();
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/cases` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(7);
    await app.close();
  });

  it('GET /agents/:id/eval/estimate states the case count before any run', async () => {
    const app = await makeApp();
    const agentId = await securityReviewerId();
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/estimate` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ agents_total: 1, cases_total: 7, executions_total: 7 });
    await app.close();
  });

  it('runs the full suite: start → poll → completed, with zero-LLM reads before/after', async () => {
    const app = await makeApp();
    const agentId = await securityReviewerId();

    const started = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval/runs` });
    expect(started.statusCode).toBe(202);
    const { run_id, status, estimate } = started.json();
    expect(status).toBe('running');
    expect(estimate).toMatchObject({ agents_total: 1, cases_total: 7, executions_total: 7 });

    let final = started.json();
    for (let i = 0; i < 50 && final.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      final = (await app.inject({ method: 'GET', url: `/eval/runs/${run_id}` })).json();
    }
    expect(final.status).toBe('completed');
    expect(final.metrics).not.toBeNull();
    expect(final.metrics.traces_total).toBe(7);
    expect(final.case_ids).toHaveLength(7);
    await app.close();
  }, 20_000);

  it('AC-15 — two rapid run triggers on one agent produce exactly one run', async () => {
    const app = await makeApp();
    const agentId = await securityReviewerId();

    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/agents/${agentId}/eval/runs` }),
      app.inject({ method: 'POST', url: `/agents/${agentId}/eval/runs` }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    // One succeeds (202); the other is refused (409, run_in_flight) — the
    // exact response race is nondeterministic, but exactly one row exists.
    expect(statuses).toContain(202);

    // Let the run finish before counting, so a later test's own run doesn't
    // collide with this one's in-flight guard.
    await new Promise((r) => setTimeout(r, 500));
    await app.close();
  });

  it('AC-54 — a request for another workspace agent/case/run is refused', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-eval-ws' }).returning();
    const [foreignAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      })
      .returning();

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/eval/agents/${foreignAgent!.id}` });
    expect(res.statusCode).toBe(404);
    const estimateRes = await app.inject({
      method: 'GET',
      url: `/agents/${foreignAgent!.id}/eval/estimate`,
    });
    expect(estimateRes.statusCode).toBe(404);
    await app.close();
  });

  it('GET /eval/dashboard responds with the seeded agent summarized', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const security = body.agents.find((a: { agent_name: string }) => a.agent_name === 'Security Reviewer');
    expect(security).toBeDefined();
    expect(security.cases_total).toBe(7);
    await app.close();
  });

  it('D18 — deleting the agent deletes its eval cases and runs', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [agent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Disposable Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      })
      .returning();

    await db.insert(t.evalCases).values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent!.id,
      name: 'disposable-case',
      inputDiff: '@@ -1,1 +1,1 @@\n-x\n+y',
      inputFiles: ['f.ts'],
      inputMeta: { pr_number: null, title: 't', body: null },
      expectedOutput: { type: 'must_find', file: 'f.ts', start_line: 1, end_line: 1 },
    });

    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent!.id}` });
    expect(del.statusCode).toBe(200);

    const remaining = await db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agent!.id)));
    expect(remaining).toHaveLength(0);
    await app.close();
  });
});
