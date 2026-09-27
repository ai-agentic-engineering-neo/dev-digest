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

    // Cost is persisted (not recomputed on read) and the trace agrees with the
    // row — the mock provider reports a per-call cost, so this must be > 0.
    expect(run!.costUsd).toBeGreaterThan(0);
    expect(trace.stats.cost_usd).toBe(run!.costUsd);

    // …and it survives a reload: the run-history endpoint carries it too.
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs.find((x: { run_id: string }) => x.run_id === runId).cost_usd).toBe(run!.costUsd);

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

  it('PR list sums run cost per PR, and reports null (not 0) when nothing is known', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // A second PR in the SAME repo, so one list response covers both cases.
    const [untouched] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 483,
        title: 'Bump ioredis',
        author: 'dependabot',
        branch: 'deps/ioredis',
        base: 'main',
        headSha: 'e5f6a7b8',
        additions: 1,
        deletions: 1,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    // Three runs on one PR: two priced, one whose model had no price. SUM skips
    // the NULL, so the total is the two known ones — deliberately partial.
    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: pr.id, status: 'done', costUsd: 0.01 },
      { workspaceId, prId: pr.id, status: 'failed', costUsd: 0.002 },
      { workspaceId, prId: pr.id, status: 'done', costUsd: null },
    ]);
    // The second PR gets a run with an UNKNOWN cost only — an all-NULL group
    // must stay null, never collapse to $0.00.
    await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: untouched!.id, status: 'done', costUsd: null });

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const row = list.find((p: { id: string }) => p.id === pr.id);
    const other = list.find((p: { id: string }) => p.id === untouched!.id);

    expect(row.cost_usd).toBeCloseTo(0.012, 10);
    expect(other.cost_usd).toBeNull();

    await app.close();
  });

  // This PR has no `agent_runs` at all, so it exercises the rollup's FALLBACK
  // path: with no run to group by, the column still reports the latest review.
  it('PR list falls back to the LATEST review when the PR has no runs, and is null when never reviewed', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Two more PRs in the SAME repo so one list response covers all three cases.
    const [cleanPr, neverPr] = await pg.handle.db
      .insert(t.pullRequests)
      .values(
        [484, 485].map((number) => ({
          workspaceId,
          repoId: repo.id,
          number,
          title: `PR ${number}`,
          author: 'dependabot',
          branch: `deps/${number}`,
          base: 'main',
          headSha: `sha-${number}`,
          additions: 1,
          deletions: 1,
          filesCount: 1,
          status: 'needs_review' as const,
        })),
      )
      .returning();

    // Two reviews on the SAME PR with EXPLICIT, distinct timestamps. The route
    // picks the latest by created_at and takes the first row per PR, so a
    // same-millisecond tie would make this assertion nondeterministic.
    const [oldReview, newReview] = await pg.handle.db
      .insert(t.reviews)
      .values([
        {
          workspaceId,
          prId: pr.id,
          kind: 'review' as const,
          verdict: 'approve' as const,
          score: 90,
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
        {
          workspaceId,
          prId: pr.id,
          kind: 'review' as const,
          verdict: 'request_changes' as const,
          score: 41,
          createdAt: new Date('2026-09-02T00:00:00Z'),
        },
      ])
      .returning();

    // The OLD review has findings that must NOT leak into the rollup.
    await pg.handle.db.insert(t.findings).values({
      reviewId: oldReview!.id,
      file: 'src/old.ts',
      startLine: 1,
      endLine: 1,
      severity: 'CRITICAL',
      category: 'bug',
      title: 'From the superseded run',
      rationale: 'stale',
      confidence: 0.9,
    });

    // The LATEST review: 7 findings across all three severities.
    await pg.handle.db.insert(t.findings).values([
      ...[0.99, 0.8].map((confidence, i) => ({
        reviewId: newReview!.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: `Critical ${i}`,
        rationale: 'A `secret` is committed in **plain text**.',
        confidence,
      })),
      ...[0.7, 0.6, 0.5].map((confidence, i) => ({
        reviewId: newReview!.id,
        file: 'src/a.ts',
        startLine: 2,
        endLine: 3,
        severity: 'WARNING',
        category: 'perf',
        title: `Warning ${i}`,
        rationale: 'N+1 query.',
        confidence,
      })),
      ...[0.4, 0.3].map((confidence, i) => ({
        reviewId: newReview!.id,
        file: 'src/b.ts',
        startLine: 9,
        endLine: 9,
        severity: 'SUGGESTION',
        category: 'style',
        title: `Suggestion ${i}`,
        rationale: 'Magic number.',
        confidence,
      })),
    ]);

    // A review that found nothing — a real, all-zero rollup, NOT null.
    await pg.handle.db.insert(t.reviews).values({
      workspaceId,
      prId: cleanPr!.id,
      kind: 'review' as const,
      verdict: 'approve' as const,
      score: 100,
      createdAt: new Date('2026-09-02T00:00:00Z'),
    });

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const reviewed = list.find((p: { id: string }) => p.id === pr.id);
    const clean = list.find((p: { id: string }) => p.id === cleanPr!.id);
    const never = list.find((p: { id: string }) => p.id === neverPr!.id);

    // Latest run only — the superseded review's critical must not be counted.
    expect(reviewed.latest_findings.total).toBe(7);
    expect(reviewed.latest_findings.by_severity).toEqual({
      CRITICAL: 2,
      WARNING: 3,
      SUGGESTION: 2,
    });
    // Score is computed from those same findings, not read off the review row
    // (which stored 41): 100 − 2×35 − 3×12 − 2×3 < 0 → clamped to 0.
    expect(reviewed.score).toBe(0);
    expect(reviewed.score_partial).toBe(false);

    // Worst-first, with markdown flattened. Seven findings sit under the cap,
    // so all of them ride along — the cap itself is covered by the unit test,
    // which is written against PR_FINDING_PREVIEW_LIMIT rather than a literal.
    expect(reviewed.latest_findings.preview).toHaveLength(7);
    expect(reviewed.latest_findings.preview.map((f: { severity: string }) => f.severity)).toEqual([
      'CRITICAL',
      'CRITICAL',
      'WARNING',
      'WARNING',
      'WARNING',
      'SUGGESTION',
      'SUGGESTION',
    ]);
    expect(reviewed.latest_findings.preview[0].confidence).toBe(0.99);
    expect(reviewed.latest_findings.preview[0].description).toBe(
      'A secret is committed in plain text.',
    );
    // Read-only: no action state rides along to the list.
    expect(reviewed.latest_findings.preview[0]).not.toHaveProperty('accepted_at');

    // Reviewed and clean ⇒ zeros, never null.
    expect(clean.latest_findings).toEqual({
      total: 0,
      by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      preview: [],
    });
    // Never reviewed ⇒ null, so the UI can render "—" instead of a confident 0.
    expect(never.latest_findings).toBeNull();
    // Same split for the score: clean ⇒ a real 100, never reviewed ⇒ null.
    expect(clean.score).toBe(100);
    expect(never.score).toBeNull();
    expect(never.score_partial).toBe(false);

    await app.close();
  });

  it("PR list sums the LAST RUN's findings across every agent, ignoring older runs", async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // An older run, then a batch of THREE agents sharing ONE `ran_at` — which
    // is exactly what ReviewService.runReview now stamps. Grouping is exact
    // equality on that instant, so the shared timestamp is the fixture's point:
    // stagger these by a millisecond and the batch falls apart into singletons.
    const oldRanAt = new Date('2026-09-01T00:00:00Z');
    const lastRanAt = new Date('2026-09-02T00:00:00Z');
    const [oldRun, runA, runB, runC] = await pg.handle.db
      .insert(t.agentRuns)
      .values([
        { workspaceId, prId: pr.id, ranAt: oldRanAt, status: 'done' },
        { workspaceId, prId: pr.id, ranAt: lastRanAt, status: 'done' },
        { workspaceId, prId: pr.id, ranAt: lastRanAt, status: 'done' },
        { workspaceId, prId: pr.id, ranAt: lastRanAt, status: 'done' },
      ])
      .returning();

    // One review per run. Agent C persisted a review but found nothing, which
    // must not stop A and B from counting.
    const [oldReview, reviewA, reviewB] = await pg.handle.db
      .insert(t.reviews)
      .values([
        {
          workspaceId,
          prId: pr.id,
          runId: oldRun!.id,
          kind: 'review' as const,
          verdict: 'request_changes' as const,
          score: 10,
          createdAt: oldRanAt,
        },
        {
          workspaceId,
          prId: pr.id,
          runId: runA!.id,
          kind: 'review' as const,
          verdict: 'request_changes' as const,
          score: 38,
          createdAt: lastRanAt,
        },
        {
          workspaceId,
          prId: pr.id,
          runId: runB!.id,
          kind: 'review' as const,
          verdict: 'request_changes' as const,
          score: 44,
          createdAt: lastRanAt,
        },
        {
          workspaceId,
          prId: pr.id,
          runId: runC!.id,
          kind: 'review' as const,
          verdict: 'approve' as const,
          score: 92,
          createdAt: lastRanAt,
        },
      ])
      .returning();

    await pg.handle.db.insert(t.findings).values([
      // Superseded run — must NOT leak into the rollup.
      {
        reviewId: oldReview!.id,
        file: 'src/old.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'From the superseded run',
        rationale: 'stale',
        confidence: 0.95,
      },
      // Agent A: one CRITICAL.
      {
        reviewId: reviewA!.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Committed secret',
        rationale: 'A `sk_live_` key is committed.',
        confidence: 0.98,
      },
      // Agent B: one CRITICAL and two WARNINGs.
      {
        reviewId: reviewB!.id,
        file: 'src/webhook.ts',
        startLine: 20,
        endLine: 22,
        severity: 'CRITICAL',
        category: 'security',
        title: 'SSRF in the forwarder',
        rationale: 'The target URL is attacker-controlled.',
        confidence: 0.9,
      },
      ...[0.7, 0.6].map((confidence, i) => ({
        reviewId: reviewB!.id,
        file: 'src/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: `Warning ${i}`,
        rationale: 'N+1 query.',
        confidence,
      })),
    ]);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const reviewed = list.find((p: { id: string }) => p.id === pr.id);

    // 1 CRITICAL from A + (1 CRITICAL + 2 WARNING) from B, C contributing none
    // and the older run contributing none.
    expect(reviewed.latest_findings.total).toBe(4);
    expect(reviewed.latest_findings.by_severity).toEqual({
      CRITICAL: 2,
      WARNING: 2,
      SUGGESTION: 0,
    });
    // Worst-first across agents — the union is sorted as one list, not
    // concatenated per agent.
    expect(reviewed.latest_findings.preview.map((f: { severity: string }) => f.severity)).toEqual([
      'CRITICAL',
      'CRITICAL',
      'WARNING',
      'WARNING',
    ]);
    expect(reviewed.latest_findings.preview.map((f: { title: string }) => f.title)).not.toContain(
      'From the superseded run',
    );
    // The score spans the same union as the counters — every agent of the run,
    // not whichever agent's stored score (38 / 44 / 92) happened to be newest:
    // 100 − 2×35 − 2×12 = 6.
    expect(reviewed.score).toBe(6);
    expect(reviewed.score_partial).toBe(false);

    await app.close();
  });

  it('PR list score skips dismissed findings and flags a run where an agent failed', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // One batch: agent A finished, agent B failed before persisting a review.
    const ranAt = new Date('2026-09-02T00:00:00Z');
    const [runA] = await pg.handle.db
      .insert(t.agentRuns)
      .values([
        { workspaceId, prId: pr.id, ranAt, status: 'done' },
        { workspaceId, prId: pr.id, ranAt, status: 'failed', error: '429 quota exceeded' },
      ])
      .returning();
    const [reviewA] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        runId: runA!.id,
        kind: 'review' as const,
        verdict: 'request_changes' as const,
        score: 53,
        createdAt: ranAt,
      })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: reviewA!.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Dismissed as a false positive',
        rationale: 'not real',
        confidence: 0.9,
        dismissedAt: new Date('2026-09-03T00:00:00Z'),
      },
      {
        reviewId: reviewA!.id,
        file: 'src/a.ts',
        startLine: 2,
        endLine: 3,
        severity: 'WARNING',
        category: 'perf',
        title: 'Open warning',
        rationale: 'N+1 query.',
        confidence: 0.8,
      },
    ]);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const reviewed = list.find((p: { id: string }) => p.id === pr.id);

    // Counters still show the dismissed CRITICAL; the score does not charge it.
    expect(reviewed.latest_findings.by_severity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    expect(reviewed.score).toBe(88);
    // Agent B failed, so the 88 covers only part of the run.
    expect(reviewed.score_partial).toBe(true);

    await app.close();
  });

  it('PR list falls back to the latest review when the last run produced none', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // A good run, then a newer batch in which EVERY agent failed before
    // persisting a review. Reporting that batch's empty result as 0 would claim
    // the PR is clean when nothing actually looked at it — so the column keeps
    // showing the last real result instead.
    const [goodRun] = await pg.handle.db
      .insert(t.agentRuns)
      .values([
        {
          workspaceId,
          prId: pr.id,
          ranAt: new Date('2026-09-01T00:00:00Z'),
          status: 'done',
        },
        {
          workspaceId,
          prId: pr.id,
          ranAt: new Date('2026-09-02T00:00:00Z'),
          status: 'failed',
          error: '429 quota exceeded',
        },
        {
          workspaceId,
          prId: pr.id,
          ranAt: new Date('2026-09-02T00:00:00Z'),
          status: 'failed',
          error: '429 quota exceeded',
        },
      ])
      .returning();

    const [goodReview] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        runId: goodRun!.id,
        kind: 'review' as const,
        verdict: 'request_changes' as const,
        score: 38,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      })
      .returning();

    await pg.handle.db.insert(t.findings).values({
      reviewId: goodReview!.id,
      file: 'src/config.ts',
      startLine: 11,
      endLine: 11,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Committed secret',
      rationale: 'A `sk_live_` key is committed.',
      confidence: 0.98,
    });

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const reviewed = list.find((p: { id: string }) => p.id === pr.id);

    expect(reviewed.latest_findings.total).toBe(1);
    expect(reviewed.latest_findings.by_severity.CRITICAL).toBe(1);
    // The score falls back with the counters (one CRITICAL ⇒ 65), and is
    // marked partial: the newest run's agents all failed, so it is not what
    // that run found.
    expect(reviewed.score).toBe(65);
    expect(reviewed.score_partial).toBe(true);

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
});
