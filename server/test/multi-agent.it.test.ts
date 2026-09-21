import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A unified diff touching src/config.ts (line 11 added) — same fixture shape
 *  reviews.it.test.ts uses, so grounding keeps a finding at line 11. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Agent A (openai) flags a CRITICAL finding at line 11. */
const REVIEW_A: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-a',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/** Agent B (anthropic) finds nothing — sets up a real "did not flag" conflict
 *  take against agent A's finding above. */
const REVIEW_B: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 95,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('specs/13-multi-agent-review.md — multi-agent review (Testcontainers pg)', () => {
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

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_A }),
          anthropic: new MockLLMProvider('anthropic', { structured: REVIEW_B }),
          // server/LEARNINGS.md:58-62 — `review_intent`'s FEATURE_MODELS
          // default is openrouter/deepseek-v4-flash, so every batch's
          // intent-resolution step calls container.llm('openrouter') too.
          // Mocking it here (unlike reviews.it.test.ts, which doesn't) keeps
          // this suite hermetic and avoids that documented network flake.
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: {
              IntentExtraction: { summary: 'Adds rate limiting.', in_scope: ['src/config.ts'], out_of_scope: [] },
            },
          }),
        },
      },
    });
  }

  async function makeAgents(app: Awaited<ReturnType<typeof appWith>>) {
    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Security Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Perf Reviewer', provider: 'anthropic', model: 'claude-x', system_prompt: 'perf' },
      })
    ).json();
    return { agentA, agentB };
  }

  it('AC-9, AC-11, AC-13, AC-21, AC-23: triggers one multi-agent run grouping one agent_runs row per selected agent, each source=local, response returned before completion, and the grouping is readable after the runs finish', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { agentA, agentB } = await makeAgents(app);

    const triggerRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    expect(triggerRes.statusCode).toBe(200);
    const triggered = triggerRes.json();
    expect(triggered.columns).toHaveLength(2);
    // AC-13: responded before any review completed.
    expect(triggered.columns.every((c: { status: string }) => c.status === 'running')).toBe(true);

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    // AC-11, AC-23: every grouped agent_runs row is source='local' and has
    // both agent_id and run_id set on its review.
    const runs = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.multiAgentRunId, triggered.id));
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(run.source).toBe('local');
      expect(run.status).toBe('done');
    }
    const reviews = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.prId, pr.id));
    for (const review of reviews) {
      expect(review.agentId).not.toBeNull();
      expect(review.runId).not.toBeNull();
    }

    // AC-21: reading the persisted grouping returns the SAME run ids the
    // trigger returned.
    const latestRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(latestRes.statusCode).toBe(200);
    const latest = latestRes.json();
    expect(latest.id).toBe(triggered.id);
    expect(latest.columns.map((c: { run_id: string }) => c.run_id).sort()).toEqual(
      triggered.columns.map((c: { run_id: string }) => c.run_id).sort(),
    );

    // AC-30, AC-35, AC-37, AC-39: agent A flagged line 11, agent B (done, no
    // findings) did not -> exactly one conflict with a flagging + an ignored take.
    expect(latest.conflicts).toHaveLength(1);
    const conflict = latest.conflicts[0];
    expect(conflict.file).toBe('src/config.ts');
    expect(conflict.line).toBe(11);
    expect(conflict.takes).toHaveLength(2);
    expect(conflict.takes.some((t: { verdict: string }) => t.verdict === 'CRITICAL')).toBe(true);
    expect(conflict.takes.some((t: { verdict: string }) => t.verdict === 'ignored')).toBe(true);

    // AC-24: wall-clock duration/cost aggregation renders numerically.
    expect(typeof latest.total_duration_ms).toBe('number');

    await app.close();
  });

  it('AC-14, AC-55: a request mixing one valid and one foreign agent id starts zero runs and creates no multi-agent run record', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { agentA } = await makeAgents(app);

    const before = await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agentIds: [agentA.id, '00000000-0000-0000-0000-000000000000'] },
    });
    expect(res.statusCode).toBe(404);

    const after = await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));
    expect(after).toHaveLength(before.length);
    const runs = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(runs).toHaveLength(0);

    await app.close();
  });

  it('AC-12: surfaces the in-flight run rather than starting a second one', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { agentA } = await makeAgents(app);

    // Simulate a genuinely in-flight grouping directly against the DB — the
    // deterministic way to prove the in-flight GUARD (not a network-timing
    // race; server/LEARNINGS.md:103-127's recipe is for a same-process
    // in-flight window, not an HTTP round trip against a fire-and-forget
    // background job).
    const [maRun] = await pg.handle.db.insert(t.multiAgentRuns).values({ workspaceId, prId: pr.id }).returning();
    const [runningRun] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agentA.id,
        prId: pr.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'running',
        source: 'local',
        multiAgentRunId: maRun!.id,
      })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agentIds: [agentA.id] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(maRun!.id);
    expect(body.columns.map((c: { run_id: string }) => c.run_id)).toEqual([runningRun!.id]);

    // No second grouping was created.
    const groupings = await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));
    expect(groupings).toHaveLength(1);

    await app.close();
  });

  it('AC-5, AC-6: estimates reflect only DONE runs, per agent, and workspace-scoped', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { agentA, agentB } = await makeAgents(app);

    // Agent B has no completed run yet -> null estimate, not 0.
    const before = await app.inject({ method: 'GET', url: '/multi-agent/estimates' });
    expect(before.statusCode).toBe(200);
    const beforeList = before.json() as { agent_id: string; runs: number; avg_duration_ms: number | null }[];
    const bBefore = beforeList.find((e) => e.agent_id === agentB.id)!;
    expect(bBefore.runs).toBe(0);
    expect(bBefore.avg_duration_ms).toBeNull();

    await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const after = await app.inject({ method: 'GET', url: '/multi-agent/estimates' });
    const afterList = after.json() as { agent_id: string; runs: number; avg_duration_ms: number | null }[];
    const aAfter = afterList.find((e) => e.agent_id === agentA.id)!;
    expect(aAfter.runs).toBe(1);
    expect(aAfter.avg_duration_ms).not.toBeNull();

    await app.close();
  });

  it('Learn (D24, AC-63, AC-64): records exactly one memory row scoped to the repo, idempotent on a second activation', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { agentA, agentB } = await makeAgents(app);

    await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const latest = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` })).json();
    const findingId = latest.columns.flatMap((c: { findings: { id: string }[] }) => c.findings).find(Boolean)!.id;

    const first = await app.inject({ method: 'POST', url: `/findings/${findingId}/learn` });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.memoryId).toBeTruthy();

    const second = await app.inject({ method: 'POST', url: `/findings/${findingId}/learn` });
    const secondBody = second.json();
    expect(secondBody.memoryId).toBe(firstBody.memoryId);

    const memoryRows = await pg.handle.db.select().from(t.memory).where(eq(t.memory.workspaceId, workspaceId));
    const learningRows = memoryRows.filter((m) => m.kind === 'learning');
    expect(learningRows).toHaveLength(1);
    expect(learningRows[0]!.scope).toBe('repo');

    await app.close();
  });
});
