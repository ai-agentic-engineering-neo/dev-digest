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

/**
 * Directly seed one "agent run + its review + one finding" — bypassing the
 * LLM/executor pipeline (MockLLMProvider returns one fixture per app/provider,
 * so it can't produce two DIFFERENT agents' findings within one round). Lets
 * a test pin `ranAt` precisely to simulate two agents finishing at different
 * times within (or outside) the same "review all" round.
 */
async function seedRoundReview(
  db: PgFixture['handle']['db'],
  opts: {
    workspaceId: string;
    prId: string;
    ranAt: Date;
    severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
    title: string;
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({ workspaceId: opts.workspaceId, prId: opts.prId, ranAt: opts.ranAt, status: 'done' })
    .returning();
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: opts.workspaceId,
      prId: opts.prId,
      runId: run!.id,
      kind: 'review',
      verdict: 'comment',
      summary: 'seeded',
      score: 80,
      model: 'seed',
    })
    .returning();
  await db.insert(t.findings).values({
    reviewId: review!.id,
    file: 'src/config.ts',
    startLine: 1,
    endLine: 1,
    severity: opts.severity,
    category: 'bug',
    title: opts.title,
    rationale: 'seeded finding',
    confidence: 0.9,
  });
  return { run: run!, review: review! };
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

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
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

    await app.close();
  });

  it('persists cost_usd for a successful run and surfaces it on the run row, trace, reviews, and PR list', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CostAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // MockLLMProvider.completeStructured returns costUsd: 0.001 per call; single-pass = 1 call.
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.costUsd).toBe(0.001);

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.stats.cost_usd).toBe(0.001);

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews[0].cost_usd).toBe(0.001);

    // PR list surfaces the total cost across this PR's successful runs (one so far).
    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.cost_usd).toBe(0.001);

    await app.close();
  });

  it('PR list cost_usd is the SUM across every successful run, not just the latest', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SumAgentA', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SumAgentB', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agentA.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agentB.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    // Two successful single-pass runs, each costing $0.001 per the mock → $0.002 total,
    // not $0.001 (which is what "latest review only" would have given).
    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.cost_usd).toBeCloseTo(0.002, 10);

    await app.close();
  });

  it('a successful run with no captured cost (pre-migration data) does not make the PR list read $0.00', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'LegacyAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // Simulate a row written before cost tracking existed: status='done' but no cost_usd.
    await pg.handle.db.update(t.agentRuns).set({ costUsd: null }).where(eq(t.agentRuns.id, runId));

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.cost_usd).toBeNull();

    await app.close();
  });

  it('a run that fails before producing output persists cost_usd = null (never 0), everywhere it is surfaced', async () => {
    // A fixture that fails Review schema validation makes completeStructured
    // throw (simulates an LLM/parse failure) before any usage/cost is attached.
    const app = await appWith({ not_a_review: true });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'BrokenAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(run!.status).toBe('failed');
    expect(run!.costUsd).toBeNull();

    const trace = (await app.inject({ method: 'GET', url: `/runs/${run!.id}/trace` })).json();
    expect(trace.stats.cost_usd).toBeNull();

    // No review was ever persisted for this failed run, so the PR list has
    // nothing to key a cost off — stays null, not 0.
    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.cost_usd).toBeNull();

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

  it('PR list findings_summary is null when the PR has no review yet', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.findings_summary).toBeNull();

    await app.close();
  });

  it('PR list findings_summary groups the latest review\'s grounded findings by severity, no LLM call involved', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SummaryAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // Two fetches of the list must be stable (pure grouping, not another LLM call).
    for (let i = 0; i < 2; i++) {
      const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      const listed = pulls.find((p: { id: string }) => p.id === pr.id);
      // Grounding drops the line-999 WARNING, keeping only the line-11 CRITICAL.
      expect(listed.findings_summary.counts).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
      expect(listed.findings_summary.items).toHaveLength(1);
      expect(listed.findings_summary.items[0].severity).toBe('CRITICAL');
      expect(listed.findings_summary.items[0].file).toBe('src/config.ts');
    }

    await app.close();
  });

  it('PR list findings_summary excludes a dismissed finding from counts and items', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'DismissAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    const findingId = reviews[0].findings[0].id;

    await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` });

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.findings_summary.counts).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(listed.findings_summary.items).toHaveLength(0);

    await app.close();
  });

  it('PR list findings_summary SUMS every agent from the latest round (a "review all" click), not just one review', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Two agents "run together": their agent_runs.ranAt land seconds apart
    // (well inside ROUND_WINDOW_MS), exactly like two agents from one
    // "review all" click finishing their (independently slow) LLM calls at
    // different times.
    const now = new Date();
    await seedRoundReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      ranAt: now,
      severity: 'CRITICAL',
      title: 'Security agent: hardcoded secret',
    });
    await seedRoundReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      ranAt: new Date(now.getTime() + 3_000),
      severity: 'WARNING',
      title: 'Performance agent: N+1 query',
    });

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.findings_summary.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    expect(listed.findings_summary.items).toHaveLength(2);
    expect(listed.findings_summary.items.map((f: { title: string }) => f.title)).toEqual([
      'Security agent: hardcoded secret',
      'Performance agent: N+1 query',
    ]);

    await app.close();
  });

  it('PR list findings_summary excludes an OLDER, separate round outside the round window', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const now = new Date();
    // An earlier "review all" click, well outside ROUND_WINDOW_MS (10s).
    await seedRoundReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      ranAt: new Date(now.getTime() - 60_000),
      severity: 'CRITICAL',
      title: 'Old round: hardcoded secret',
    });
    // The latest, separate click — the only one that should count.
    await seedRoundReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      ranAt: now,
      severity: 'WARNING',
      title: 'Latest round: N+1 query',
    });

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.findings_summary.counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    expect(listed.findings_summary.items).toHaveLength(1);
    expect(listed.findings_summary.items[0].title).toBe('Latest round: N+1 query');

    await app.close();
  });
});
