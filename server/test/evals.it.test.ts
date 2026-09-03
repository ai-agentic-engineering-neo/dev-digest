import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[evals] Docker not available — skipping integration tests.');
}

/** A diff with one addable line (11) so a CRITICAL/security finding there grounds. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "FAKE_SECRET_FOR_TESTING_ONLY",
   redisUrl: x,`;

const ONE_CRITICAL_SECURITY: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret.',
  score: 40,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

const NO_FINDINGS: Review = { verdict: 'approve', summary: 'Clean.', score: 95, findings: [] };

d('evals module', () => {
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

  function appWith(structured: unknown) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  /** Same as `appWith` but also registers the mock under 'openrouter' — the
   *  harness provider a SKILL-owned eval case runs through. */
  function appWithHarness(structured: unknown) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  async function makeAgent(app: Awaited<ReturnType<typeof appWith>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Eval Target', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    return res.json().id as string;
  }

  async function makeSkill(app: Awaited<ReturnType<typeof appWith>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'secret-leakage-gate',
        description: 'Flags hardcoded secrets.',
        type: 'security',
        body: '# Secret leakage gate\nFlag any hardcoded secret or API key.',
      },
    });
    return res.json().id as string;
  }

  it('CRUD round-trip', async () => {
    const app = await appWith(NO_FINDINGS);
    const agentId = await makeAgent(app);
    const created = await app.inject({
      method: 'POST',
      url: '/evals',
      payload: {
        owner_kind: 'agent',
        owner_id: agentId,
        name: 'clean-case',
        input_diff: DIFF,
        expected_output: [],
      },
    });
    expect(created.statusCode).toBe(201);
    const evalCase = created.json();
    expect(evalCase).toMatchObject({ name: 'clean-case', owner_kind: 'agent', owner_id: agentId });

    const got = await app.inject({ method: 'GET', url: `/evals/${evalCase.id}` });
    expect(got.statusCode).toBe(200);

    const updated = await app.inject({
      method: 'PUT',
      url: `/evals/${evalCase.id}`,
      payload: { name: 'renamed-case' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe('renamed-case');

    const deleted = await app.inject({ method: 'DELETE', url: `/evals/${evalCase.id}` });
    expect(deleted.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/evals/${evalCase.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('an exact-match case passes and is graded 1/1', async () => {
    const app = await appWith(ONE_CRITICAL_SECURITY);
    const agentId = await makeAgent(app);
    const created = await app.inject({
      method: 'POST',
      url: '/evals',
      payload: {
        owner_kind: 'agent',
        owner_id: agentId,
        name: 'stripe-key-leak',
        input_diff: DIFF,
        expected_output: [{ severity: 'CRITICAL', category: 'security' }],
      },
    });
    const caseId = created.json().id as string;

    const run = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    expect(run.statusCode).toBe(200);
    const body = run.json();
    expect(body.result.recall).toBe(1);
    expect(body.result.precision).toBe(1);
    expect(body.result.traces_passed).toBe(1);
    expect(body.result.traces_total).toBe(1);

    const summary = await app.inject({
      method: 'GET',
      url: `/evals/summary?owner_kind=agent&owner_id=${agentId}`,
    });
    expect(summary.json()).toEqual({ total: 1, passing: 1 });
    await app.close();
  });

  it('a count-mismatch case fails (expected 1, got 0)', async () => {
    const app = await appWith(NO_FINDINGS);
    const agentId = await makeAgent(app);
    const created = await app.inject({
      method: 'POST',
      url: '/evals',
      payload: {
        owner_kind: 'agent',
        owner_id: agentId,
        name: 'missing-retry-after',
        input_diff: DIFF,
        expected_output: [{ severity: 'WARNING', category: 'bug' }],
      },
    });
    const caseId = created.json().id as string;

    const run = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    const body = run.json();
    expect(body.result.recall).toBe(0);

    const summary = await app.inject({
      method: 'GET',
      url: `/evals/summary?owner_kind=agent&owner_id=${agentId}`,
    });
    expect(summary.json()).toEqual({ total: 1, passing: 0 });
    await app.close();
  });

  it('an empty-expected case passes against a clean review', async () => {
    const app = await appWith(NO_FINDINGS);
    const agentId = await makeAgent(app);
    const created = await app.inject({
      method: 'POST',
      url: '/evals',
      payload: {
        owner_kind: 'agent',
        owner_id: agentId,
        name: 'clean-refactor-no-flags',
        input_diff: DIFF,
        expected_output: [],
      },
    });
    const caseId = created.json().id as string;

    const run = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    expect(run.json().result.traces_passed).toBe(1);
    await app.close();
  });

  it('a SKILL-owned case runs through the isolated harness (openrouter, not any agent)', async () => {
    const app = await appWithHarness(ONE_CRITICAL_SECURITY);
    const skillId = await makeSkill(app);
    const created = await app.inject({
      method: 'POST',
      url: '/evals',
      payload: {
        owner_kind: 'skill',
        owner_id: skillId,
        name: 'skill-stripe-key-leak',
        input_diff: DIFF,
        expected_output: [{ severity: 'CRITICAL', category: 'security' }],
      },
    });
    expect(created.statusCode).toBe(201);
    const caseId = created.json().id as string;

    const run = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    expect(run.statusCode).toBe(200);
    const body = run.json();
    expect(body.result.recall).toBe(1);
    expect(body.result.precision).toBe(1);
    expect(body.result.traces_passed).toBe(1);

    const summary = await app.inject({
      method: 'GET',
      url: `/evals/summary?owner_kind=skill&owner_id=${skillId}`,
    });
    expect(summary.json()).toEqual({ total: 1, passing: 1 });
    await app.close();
  });

  it('running a SKILL-owned case 404s when the skill has been deleted', async () => {
    const app = await appWithHarness(NO_FINDINGS);
    const skillId = await makeSkill(app);
    const created = await app.inject({
      method: 'POST',
      url: '/evals',
      payload: {
        owner_kind: 'skill',
        owner_id: skillId,
        name: 'orphaned-case',
        input_diff: DIFF,
        expected_output: [],
      },
    });
    const caseId = created.json().id as string;
    await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });

    const run = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    expect(run.statusCode).toBe(404);
    await app.close();
  });

  it('eval cases are workspace-scoped: another tenant cannot read them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-evals' }).returning();
    const [otherAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'x',
      })
      .returning();
    const [foreignCase] = await db
      .insert(t.evalCases)
      .values({
        workspaceId: otherWs!.id,
        ownerKind: 'agent',
        ownerId: otherAgent!.id,
        name: 'foreign-case',
        expectedOutput: [],
      })
      .returning();

    const app = await appWith(NO_FINDINGS);
    const res = await app.inject({ method: 'GET', url: `/evals/${foreignCase!.id}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
