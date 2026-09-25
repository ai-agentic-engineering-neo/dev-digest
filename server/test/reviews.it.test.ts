import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { LLMProvider, Review, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (env: Record<string, string> = {}) =>
  // REVIEW_INTENT_ENABLED: 'false' — these tests inject only openai (server/INSIGHTS.md:
  // overrides.llm must cover every provider id); intent defaults to openrouter, so leaving
  // it on would make a real, paid openrouter call.
  loadConfig({ ...process.env, NODE_ENV: 'test', REVIEW_INTENT_ENABLED: 'false', ...env } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Two changed files ⇒ a map-reduce agent makes one LLM call per file. */
const DIFF_TWO_FILES = `${DIFF}
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
 export const a = 1;
+export const b = 2;`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
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
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
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
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
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

  function appWith(
    structured: unknown,
    provider: 'openai' | 'anthropic' = 'openai',
    opts: { llm?: LLMProvider; failStructuredFromCall?: number; diff?: string; env?: Record<string, string> } = {},
  ) {
    return buildApp({
      config: config(opts.env),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: opts.diff ?? DIFF }),
        // Never hit real GitHub from the list endpoint (a local token may exist).
        github: new MockGitHubClient({ pulls: [] }),
        llm: {
          [provider]:
            opts.llm ??
            new MockLLMProvider(provider, {
              structured,
              ...(opts.failStructuredFromCall != null
                ? { failStructuredFromCall: opts.failStructuredFromCall }
                : {}),
            }),
        },
      },
    });
  }

  async function createAgent(
    app: Awaited<ReturnType<typeof appWith>>,
    payload: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Cost-${repoSeq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 's', ...payload },
      })
    ).json();
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    // Run cost: the mock LLM reports 100/50 tokens at $0.001 per call (1 call).
    expect(run!.costUsd).toBeCloseTo(0.001);
    expect(trace.stats.cost_usd).toBeCloseTo(0.001);
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].cost_usd).toBeCloseTo(0.001);
    expect(review.cost_usd).toBeCloseTo(0.001);
    expect(review.tokens_in).toBe(100);
    expect(review.tokens_out).toBe(50);

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('response schemas: every contract field reaches the client', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);
    const started = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(started.statusCode).toBe(200);
    expect(Object.keys(started.json()).sort()).toEqual(['pr_id', 'reviews', 'runs']);
    const runId = started.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const active = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toEqual([]);

    const [review] = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(review).toMatchObject({ run_id: runId, agent_name: expect.any(String), tokens_in: 100, cost_usd: expect.any(Number) });
    expect(Object.keys(review.findings[0])).toEqual(
      expect.arrayContaining(['id', 'severity', 'file', 'start_line', 'review_id', 'accepted_at', 'dismissed_at']),
    );

    const [summary] = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(summary).toMatchObject({ run_id: runId, status: 'done', score: expect.any(Number), blockers: 1 });

    const del = await app.inject({ method: 'DELETE', url: `/reviews/${review.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    const again = await app.inject({ method: 'DELETE', url: `/reviews/${review.id}` });
    expect(again.statusCode).toBe(404);
    expect(again.json().error.code).toBe('not_found');
    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  describe('run cost', () => {
    it('failed run records the usage spent before the error (not 0)', async () => {
      const app = await appWith(REVIEW_FIXTURE, 'openai', { failStructuredFromCall: 1 });
      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
      const agent = await createAgent(app);
      const body = (
        await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
      ).json();
      const runId = body.runs[0].run_id;
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

      const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
      expect(run!.status).toBe('failed');
      expect(run!.tokensIn).toBe(100);
      expect(run!.tokensOut).toBe(50);
      expect(run!.costUsd).toBeCloseTo(0.001);
      const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
      expect(trace.stats.tokens_in).toBe(100);
      expect(trace.stats.cost_usd).toBeCloseTo(0.001);
      await app.close();
    });

    it('cancelled run keeps the usage spent before the cancel', async () => {
      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
      let app!: Awaited<ReturnType<typeof appWith>>;
      const inner = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
      let calls = 0;
      // Chunk 1 spends tokens, then the user cancels; the engine stops at the
      // checkpoint before chunk 2 (concurrency pinned to 1 so chunk 2 is not
      // already in flight — the parallel case is covered in run-cancel.it).
      const cancelling: LLMProvider = {
        id: 'openai',
        listModels: () => inner.listModels(),
        complete: (req) => inner.complete(req),
        embed: (x) => inner.embed(x),
        async completeStructured<T>(req: Parameters<LLMProvider['completeStructured']>[0]) {
          const res = (await inner.completeStructured(req)) as StructuredResult<T>;
          if (++calls === 1) {
            const [running] = await pg.handle.db
              .select()
              .from(t.agentRuns)
              .where(eq(t.agentRuns.prId, pr.id));
            await app.inject({ method: 'POST', url: `/runs/${running!.id}/cancel` });
          }
          return res;
        },
      };
      app = await appWith(REVIEW_FIXTURE, 'openai', {
        llm: cancelling,
        diff: DIFF_TWO_FILES,
        env: { REVIEW_MAP_CONCURRENCY: '1' },
      });
      const agent = await createAgent(app, { strategy: 'map-reduce' });
      const body = (
        await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
      ).json();
      const runId = body.runs[0].run_id;
      // The route flips the row to 'cancelled' at once; wait for the executor's
      // final write (it carries the usage).
      const deadline = Date.now() + 10_000;
      let run: typeof t.agentRuns.$inferSelect | undefined;
      do {
        [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
        if (run?.costUsd != null) break;
        await new Promise((r) => setTimeout(r, 25));
      } while (Date.now() < deadline);

      expect(calls).toBe(1);
      expect(run!.status).toBe('cancelled');
      expect(run!.tokensIn).toBe(100);
      expect(run!.costUsd).toBeCloseTo(0.001);
      await app.close();
    });

    it('PR list: cost_usd = sum of known run costs (any status); null without runs', async () => {
      const app = await appWith(REVIEW_FIXTURE);
      const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
      const [other] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo.id,
          number: 483,
          title: 'No runs yet',
          author: 'a',
          branch: 'b',
          base: 'main',
          headSha: 'ffff',
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'needs_review',
        })
        .returning();
      await pg.handle.db.insert(t.agentRuns).values([
        { workspaceId, prId: pr.id, status: 'done', costUsd: 0.0013 },
        { workspaceId, prId: pr.id, status: 'failed', costUsd: 0.0007 },
        { workspaceId, prId: pr.id, status: 'done', costUsd: null }, // pre-tracking / unpriced
      ]);

      const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      const byNumber = new Map(list.map((p: { number: number }) => [p.number, p]));
      expect((byNumber.get(482) as { cost_usd: number }).cost_usd).toBeCloseTo(0.002);
      expect((byNumber.get(other!.number) as { cost_usd: number | null }).cost_usd).toBeNull();
      await app.close();
    });

    it("PR list: findings_counts sum each agent's newest review; latest_review_id/score/last_reviewed_at from the newest; null when unreviewed", async () => {
      const app = await appWith(REVIEW_FIXTURE);
      const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
      const [agentA, agentB] = await pg.handle.db.select({ id: t.agents.id }).from(t.agents).limit(2);
      const finding = (reviewId: string, severity: string) => ({
        reviewId,
        file: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        severity,
        category: 'bug',
        title: `${severity} finding`,
        rationale: 'r',
        confidence: 0.9,
      });
      const review = (agentId: string, score: number, createdAt: string) =>
        pg.handle.db
          .insert(t.reviews)
          .values({ workspaceId, prId: pr.id, agentId, kind: 'review', score, createdAt: new Date(createdAt) })
          .returning()
          .then((rows) => rows[0]!);
      const replaced = await review(agentA!.id, 10, '2026-01-01'); // superseded by A's re-run
      const other = await review(agentB!.id, 70, '2026-01-15'); // B's only review — still current
      const latest = await review(agentA!.id, 61, '2026-02-01');
      await pg.handle.db.insert(t.findings).values([
        finding(replaced.id, 'CRITICAL'),
        finding(other.id, 'WARNING'),
        finding(other.id, 'SUGGESTION'),
        finding(latest.id, 'CRITICAL'),
        finding(latest.id, 'CRITICAL'),
        finding(latest.id, 'SUGGESTION'),
      ]);

      const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      const row = list.find((p: { number: number }) => p.number === 482);
      expect(row.latest_review_id).toBe(latest.id);
      expect([...row.latest_review_ids].sort()).toEqual([latest.id, other.id].sort());
      expect(row.findings_counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 2 });
      expect(row.score).toBe(61);
      expect(row.last_reviewed_at).toBe(new Date('2026-02-01').toISOString());
      await app.close();

      // A PR with no review has no breakdown.
      await pg.handle.db.delete(t.reviews).where(eq(t.reviews.prId, pr.id));
      const app2 = await appWith(REVIEW_FIXTURE);
      const list2 = (await app2.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      const row2 = list2.find((p: { number: number }) => p.number === 482);
      expect(row2.findings_counts).toBeNull();
      expect(row2.latest_review_id).toBeNull();
      expect(row2.latest_review_ids).toEqual([]);
      expect(row2.last_reviewed_at).toBeNull();
      await app2.close();
    });
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
