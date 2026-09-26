import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import type { RunTrace } from '@devdigest/shared';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  BRANCH_COVERAGE_GATE_BODY,
  CORNER_CASE_CHECKLIST_BODY,
  MOCK_DISCIPLINE_BODY,
  FLAKY_TEST_PATTERNS_BODY,
} from './seed-skills.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the four built-in agents (General + Security +
 * Performance + Test Quality), all on the default openrouter/deepseek-v4-flash
 * provider+model. Test Quality Reviewer also gets four seeded skills (linked
 * via agent_skills) — see `seedTestQualitySkills` below.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  // Set only when this run creates the demo review, so the matching seeded
  // agent_run below can claim it (see seedAgentRuns).
  let seedReviewId: string | null = null;
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
      {
        // The third severity bucket. Without a SUGGESTION the FINDINGS column
        // and its hover preview can only ever be demoed two-thirds lit.
        reviewId: review!.id,
        file: 'src/middleware/ratelimit.ts',
        startLine: 28,
        endLine: 28,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Extract magic number 3600',
        rationale: 'The number 3600 appears twice without explanation.',
        suggestion: 'Name it SECONDS_IN_AN_HOUR.',
        confidence: 0.62,
      },
    ]);
    seedReviewId = review!.id;
  }

  // ---- built-in agents (the four starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        'Reviews test coverage — flags happy-path-only tests, missing edge cases, and mocking that hides real bugs.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  const agentIds: Record<string, string> = {};
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (existing) {
      agentIds[a.name] = existing.id;
    } else {
      const [inserted] = await db.insert(t.agents).values(a).returning();
      agentIds[a.name] = inserted!.id;
    }
  }

  // ---- seeded skills for Test Quality Reviewer ----
  // Independent of the `pr`-exists early-skip above: this block upserts by
  // (workspace_id, name) / (agent_id, skill_id) on every call, so it takes
  // effect even against an already-seeded dev DB (see server/INSIGHTS.md).
  await seedTestQualitySkills(db, workspaceId, agentIds);

  await seedAgentRuns(db, workspaceId, pr!.id, agentIds, seedReviewId);

  return { workspaceId, userId };
}

/**
 * Four built-in skills (rubric/convention, source 'manual') linked to Test
 * Quality Reviewer via `agent_skills`, in this array's order.
 *
 * Idempotent on its OWN condition — upsert by (workspace_id, name) for skills,
 * by the `agent_skills` primary key (agent_id, skill_id) for the link — never
 * gated behind the PR-exists skip in `seed()`, per the seeded-review trap in
 * `server/INSIGHTS.md` ("editing seeded rows changes NOTHING on an
 * already-seeded dev DB" unless the addition upserts on its own key).
 */
async function seedTestQualitySkills(
  db: Db,
  workspaceId: string,
  agentIds: Record<string, string>,
): Promise<void> {
  type SkillInsert = typeof t.skills.$inferInsert;
  const seedSkills: Array<{
    name: string;
    description: string;
    type: SkillInsert['type'];
    body: string;
  }> = [
    {
      name: 'branch-coverage-gate',
      description: 'Flag any changed function with an untested conditional branch.',
      type: 'rubric',
      body: BRANCH_COVERAGE_GATE_BODY,
    },
    {
      name: 'corner-case-checklist',
      description:
        'Check every new code path for null/undefined, empty collections, boundary offsets, negative numbers, and encoding edge cases.',
      type: 'rubric',
      body: CORNER_CASE_CHECKLIST_BODY,
    },
    {
      name: 'mock-discipline',
      description:
        'Flag tests whose mocking of the system under test would let real breakage still pass.',
      type: 'convention',
      body: MOCK_DISCIPLINE_BODY,
    },
    {
      name: 'flaky-test-patterns',
      description:
        'Flag tests whose pass/fail outcome is nondeterministic — timeouts that do not throw, unseeded randomness, real-clock or ordering dependence.',
      type: 'convention',
      body: FLAKY_TEST_PATTERNS_BODY,
    },
  ];

  const skillIds: Record<string, string> = {};
  for (const s of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (existing) {
      skillIds[s.name] = existing.id;
      continue;
    }
    const [inserted] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: s.name,
        description: s.description,
        type: s.type,
        source: 'manual',
        body: s.body,
        enabled: true,
        version: 1,
      })
      .returning();
    skillIds[s.name] = inserted!.id;

    // skill_versions is the append-only history; the skill's own body/version
    // columns hold the CURRENT text — both must be written (see specs/skills.md S4).
    await db.insert(t.skillVersions).values({
      skillId: inserted!.id,
      version: 1,
      body: s.body,
      note: 'Initial',
    });
  }

  const testQualityAgentId = agentIds['Test Quality Reviewer'];
  if (!testQualityAgentId) return;

  for (const [order, s] of seedSkills.entries()) {
    const skillId = skillIds[s.name];
    if (!skillId) continue;
    const [existingLink] = await db
      .select()
      .from(t.agentSkills)
      .where(
        and(eq(t.agentSkills.agentId, testQualityAgentId), eq(t.agentSkills.skillId, skillId)),
      );
    if (existingLink) continue;
    await db.insert(t.agentSkills).values({
      agentId: testQualityAgentId,
      skillId,
      order,
      enabled: true,
    });
  }
}

/**
 * Demo `agent_runs` (+ their traces) for the seeded PR.
 *
 * Without these the run timeline and the trace drawer are empty after a fresh
 * seed, so cost has nothing to render against. The set covers every branch the
 * PR list's COST column must handle. That column is the PR's LIFETIME total, so
 * all of these land in one figure ($0.00254 as seeded):
 *   - several priced runs       → summed, across rounds and outside them
 *   - a run on an unpriced model → contributes nothing, the sum stays partial
 *   - a failed run               → ignored, it never reached the model
 *   - a run with no round        → still counted; rounds do not gate the total
 * A null cost renders an em dash, NEVER "$0.00".
 *
 * One of these runs also CLAIMS the demo review seeded above (`ownsSeedReview`)
 * by writing its id into `reviews.run_id` — that link is what lets the run
 * timeline show a per-run severity breakdown on freshly seeded data.
 *
 * Idempotent: skipped entirely once the PR has any run.
 */
async function seedAgentRuns(
  db: Db,
  workspaceId: string,
  prId: string,
  agentIds: Record<string, string>,
  seedReviewId: string | null,
): Promise<void> {
  const [existingRun] = await db
    .select({ id: t.agentRuns.id })
    .from(t.agentRuns)
    .where(eq(t.agentRuns.prId, prId));
  if (existingRun) return;

  const now = Date.now();
  const [round] = await db
    .insert(t.multiAgentRuns)
    .values({ workspaceId, prId })
    .returning({ id: t.multiAgentRuns.id });

  interface SeedRun {
    agent: string;
    model: string;
    roundId: string | null;
    minutesAgo: number;
    status: 'done' | 'failed';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number | null;
    findings: number;
    grounding: string;
    score: number | null;
    blockers: number | null;
    error?: string;
    /** This run produced the demo review seeded above — link the two. */
    ownsSeedReview?: boolean;
  }

  // Ordered oldest → newest. Within the round the UNPRICED run is deliberately
  // the newest completed one: before round totals existed, that single null
  // blanked the whole PR's cost even though $0.00164 had really been spent.
  const seedRuns: SeedRun[] = [
    {
      agent: 'Performance Reviewer',
      model: DEFAULT_MODEL,
      roundId: null, // legacy: predates round tracking
      minutesAgo: 20,
      status: 'done',
      durationMs: 6400,
      tokensIn: 11_800,
      tokensOut: 211,
      costUsd: 0.0009,
      findings: 1,
      grounding: '1/1 passed',
      score: 73,
      blockers: 0,
    },
    {
      agent: 'Security Reviewer',
      model: DEFAULT_MODEL,
      roundId: round!.id,
      minutesAgo: 5,
      status: 'done',
      durationMs: 8200,
      tokensIn: 9000,
      tokensOut: 119,
      costUsd: 0.0013,
      // Counts mirror the demo review this run claims below — the timeline row
      // and the findings it links to must not disagree.
      findings: 3,
      grounding: '3/3 passed',
      score: 61,
      blockers: 1,
      ownsSeedReview: true,
    },
    {
      agent: 'General Reviewer',
      model: DEFAULT_MODEL,
      roundId: round!.id,
      minutesAgo: 4,
      status: 'done',
      durationMs: 4165,
      tokensIn: 1400,
      tokensOut: 131,
      costUsd: 0.00034,
      findings: 0,
      grounding: '0/0 passed',
      score: 100,
      blockers: 0,
    },
    {
      agent: 'Performance Reviewer',
      model: 'acme/unpriced-model-v1',
      roundId: round!.id,
      minutesAgo: 3,
      status: 'done',
      durationMs: 3400,
      tokensIn: 3300,
      tokensOut: 147,
      costUsd: null, // model has no price -> contributes nothing to the sum
      findings: 0,
      grounding: '0/0 passed',
      score: 100,
      blockers: 0,
    },
    {
      agent: 'General Reviewer',
      model: DEFAULT_MODEL,
      roundId: round!.id,
      minutesAgo: 2,
      status: 'failed',
      durationMs: 1400,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      findings: 0,
      grounding: '0/0 passed',
      score: null,
      blockers: null,
      error: '429 You exceeded your current quota, please check your plan and billing details.',
    },
  ];

  for (const r of seedRuns) {
    const stats: RunTrace['stats'] = {
      duration_ms: r.durationMs,
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      cost_usd: r.costUsd,
      findings: r.findings,
      grounding: r.grounding,
    };
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agentIds[r.agent] ?? null,
        prId,
        roundId: r.roundId,
        provider: DEFAULT_PROVIDER,
        model: r.model,
        ranAt: new Date(now - r.minutesAgo * 60_000),
        durationMs: r.durationMs,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costUsd: r.costUsd,
        status: r.status,
        error: r.error ?? null,
        findingsCount: r.findings,
        grounding: r.grounding,
        score: r.score,
        blockers: r.blockers,
      })
      .returning();

    // Hand the demo review to its run. `reviews.run_id` has no FK, and the
    // review is written before any agent exists — without this link the run
    // timeline cannot show the findings it produced.
    if (r.ownsSeedReview && seedReviewId) {
      await db
        .update(t.reviews)
        .set({ runId: run!.id, agentId: agentIds[r.agent] ?? null })
        .where(eq(t.reviews.id, seedReviewId));
    }

    await db.insert(t.runTraces).values({
      runId: run!.id,
      trace: {
        config: {
          agent: r.agent,
          version: '1',
          provider: DEFAULT_PROVIDER,
          model: r.model,
          pr: 482,
          source: 'local',
        },
        stats,
        prompt_assembly: {
          system: `${r.agent} system prompt (seed)`,
          skills: null,
          memory: null,
          specs: null,
          user: 'Review PR #482 — Add rate limiting to public API endpoints',
        },
        tool_calls:
          r.status === 'done'
            ? [{ tool: 'review_file', args: 'all files', meta: 'single-pass', ms: r.durationMs }]
            : [],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        log:
          r.status === 'done'
            ? [
                { t: '00.10', kind: 'info', msg: `Starting review with agent "${r.agent}"` },
                { t: '00.90', kind: 'result', msg: `Persisted review with ${r.findings} finding(s)` },
              ]
            : [{ t: '00.05', kind: 'error', msg: `Run failed: ${r.error}` }],
      } satisfies RunTrace,
    });
  }
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
