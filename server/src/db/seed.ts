import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';
import { SEED_SKILLS, AGENT_SKILL_LINKS } from './seed-skills.js';
import { sourceHash } from '../platform/intent-hash.js';

/** Prompt version the seeded intent claims; a unit test pins it to reviewer-core's INTENT_PROMPT_VERSION. */
export const SEEDED_INTENT_PROMPT_VERSION = 1;

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * (+ one completed, priced agent run behind it)
 * with a few findings, and the five built-in agents (General + Security +
 * Performance + Test Quality + API Contract), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * L02 adds the skills in `seed-skills.ts`, linked to Security, Test Quality and
 * API Contract Reviewer; the last two are the lesson's new agents.
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
      {
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 4,
        deletions: 0,
        patch: [
          '@@ -9,6 +9,10 @@ export const config = {',
          '   port: 3000,',
          '   host: "0.0.0.0",',
          '   logLevel: "info",',
          '+  stripeKey: "STRIPE_KEY_PLACEHOLDER",',
          '+  rateLimitMax: 100,',
          '+  rateLimitWindowMs: 60000,',
          '+  rateLimitEnabled: true,',
          '   cors: true,',
          '   trustProxy: true,',
          '   timeoutMs: 30000,',
        ].join('\n'),
      },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
      { prId: pr!.id, path: 'src/server.ts', additions: 8, deletions: 1 },
      { prId: pr!.id, path: 'package.json', additions: 3, deletions: 1 },
      { prId: pr!.id, path: 'package-lock.json', additions: 92, deletions: 24 },
      { prId: pr!.id, path: 'test/ratelimit.test.ts', additions: 6, deletions: 0 },
      { prId: pr!.id, path: 'docs/rate-limiting.md', additions: 12, deletions: 4 },
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
    ]);
  }

  // ---- PR intent for #482 (what the Intent card shows before the first review) ----
  // Idempotent: never overwrites an intent a real review derived. The hash uses the
  // registry default model so the seeded row is not shown as stale.
  await db
    .insert(t.prIntent)
    .values({
      prId: pr!.id,
      intent:
        'Protect the public API from abuse by unauthenticated clients by adding a token-bucket rate limiter to the public endpoints.',
      inScope: ['Token-bucket limiter middleware', 'Limits on the public webhook endpoints', 'Rate-limit configuration'],
      outOfScope: ['Per-user quotas', 'Changes to authentication'],
      confidence: 'medium',
      sources: [
        { kind: 'title', ref: 'title', status: 'used', chars: pr!.title.length },
        { kind: 'branch', ref: 'branch', status: 'used', chars: pr!.branch.length },
        { kind: 'body', ref: 'description', status: 'used', chars: (pr!.body ?? '').length },
        { kind: 'commits', ref: '1 commit(s)', status: 'used', chars: 29 },
        { kind: 'files', ref: '4 path(s)', status: 'used', chars: 120 },
        { kind: 'github_issue', ref: '#471', status: 'used', chars: 640 },
        {
          kind: 'external_url',
          ref: 'https://docs.google.com/document/d/rate-limit-design/edit',
          status: 'skipped',
          reason: 'external_fetch_disabled',
        },
      ],
      sourceHash: sourceHash({
        promptVersion: SEEDED_INTENT_PROMPT_VERSION,
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        title: pr!.title,
        body: pr!.body,
        branch: pr!.branch,
        headSha: pr!.headSha,
      }),
      headSha: pr!.headSha,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokensIn: 1830,
      tokensOut: 140,
      costUsd: 0.0003,
      durationMs: 2400,
      derivedAt: new Date(),
    })
    .onConflictDoNothing({ target: t.prIntent.prId });

  // ---- onboarding tour for the demo repo (valid five-section shape; the seed bypasses AC-29 verification) ----
  await db
    .insert(t.onboarding)
    .values({
      repoId,
      json: {
        sections: [
          {
            kind: 'architecture',
            title: 'Architecture overview',
            body: '**payments-api** is a Node + TypeScript service fronting Stripe. Requests enter through `src/server.ts`, pass middleware (auth, rate-limit), and route to `src/api/*`. Persistence is Postgres via a thin `db` client; Redis backs sessions and rate-limit buckets.',
            diagram:
              'flowchart LR\n  client["client"] --> server["server.ts"]\n  server --> mw["middleware"]\n  mw --> redis["redis"]\n  mw --> api["api/public/*"]\n  api --> pg["postgres"]',
          },
          {
            kind: 'critical_paths',
            title: 'Critical paths',
            items: [
              { path: 'src/server.ts', why: 'App bootstrap and middleware chain' },
              { path: 'src/api/public/index.ts', why: 'Public router, the unauthenticated surface' },
              { path: 'src/middleware/auth.ts', why: 'Token validation, used by 14 routes' },
              { path: 'src/lib/redis.ts', why: 'Shared Redis singleton, reuse this' },
            ],
          },
          {
            kind: 'run_locally',
            title: 'How to run locally',
            items: [
              { command: 'pnpm install', note: null },
              { command: 'docker compose up -d postgres redis', note: null },
              { command: 'pnpm dev', note: 'http://localhost:3000' },
            ],
          },
          {
            kind: 'reading_path',
            title: 'Guided reading path',
            items: [
              { path: 'src/server.ts', why: 'See the whole request lifecycle in one file' },
              { path: 'src/api/public/index.ts', why: 'Understand the public contract before touching it' },
              { path: 'src/middleware/auth.ts', why: 'Auth touches almost everything downstream' },
            ],
          },
          {
            kind: 'first_tasks',
            title: 'First tasks',
            items: [
              {
                title: 'Add a request id to the access log',
                why: 'Small, self-contained, and touches the middleware chain',
                files: [{ path: 'src/server.ts' }, { path: 'src/middleware/auth.ts' }],
              },
              {
                title: 'Document the public router responses',
                why: 'Teaches the public contract',
                files: [{ path: 'src/api/public/index.ts' }],
              },
              {
                title: 'Reuse the Redis singleton in the rate limiter',
                why: 'Removes a duplicate connection',
                files: [{ path: 'src/lib/redis.ts' }],
              },
            ],
          },
        ],
      },
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokensIn: 9200,
      tokensOut: 1100,
      costUsd: 0.0021,
      filesIndexed: 12450,
      limited: false,
    })
    .onConflictDoNothing({ target: t.onboarding.repoId });

  // ---- built-in agents (three starter presets + the two L02 skill-driven ones) ----
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
    // L02 — two agents whose checks live entirely in their linked skills, so
    // the same PR reviewed with and without skills is the control experiment.
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Checks the tests that ship with a PR: uncovered branches, missed corner cases, over-mocking, flakiness.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Catches breaking route, schema and error-envelope changes before they reach a client.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- skills (L02): text-only rules, linked per agent (AGENT_SKILL_LINKS) ----
  // Idempotent by name. Links are written only while the agent has none, so a
  // user's reordering on a dev DB survives a re-seed.
  const skillIdByName = new Map<string, string>();
  for (const sk of SEED_SKILLS) {
    let [existingSkill] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));
    if (!existingSkill) {
      [existingSkill] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: sk.name,
          description: sk.description,
          type: sk.type,
          source: 'manual',
          body: sk.body,
          enabled: true,
          version: 1,
        })
        .returning();
      await db
        .insert(t.skillVersions)
        .values({ skillId: existingSkill!.id, version: 1, body: sk.body })
        .onConflictDoNothing();
    }
    skillIdByName.set(sk.name, existingSkill!.id);
  }
  for (const [agentName, skillNames] of Object.entries(AGENT_SKILL_LINKS)) {
    const [agentRow] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agentRow) continue;
    const [anyLink] = await db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agentRow.id))
      .limit(1);
    if (anyLink) continue;
    await db.insert(t.agentSkills).values(
      skillNames.map((name, order) => ({
        agentId: agentRow.id,
        skillId: skillIdByName.get(name)!,
        order,
      })),
    );
  }

  // ---- one completed agent run behind the seeded review ----
  // Gives the demo PR a priced run so the COST column, the timeline badge, the
  // trace drawer Stats and the review-run header all show a number on a fresh
  // DB (and the e2e run-cost flow stays deterministic — no model call).
  // Idempotent: only runs while the seeded review has no run yet.
  const [seededReview] = await db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.kind, 'review'), eq(t.reviews.model, 'seed')));
  if (seededReview && !seededReview.runId) {
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
    const seededFindings = await db
      .select({ severity: t.findings.severity })
      .from(t.findings)
      .where(eq(t.findings.reviewId, seededReview.id));
    const findingsCount = seededFindings.length;
    const blockers = seededFindings.filter((f) => f.severity === 'CRITICAL').length;
    const stats = {
      duration_ms: 8_200,
      tokens_in: 8_190,
      tokens_out: 929,
      cost_usd: 0.0013,
      findings: findingsCount,
      grounding: `${findingsCount}/${findingsCount} passed`,
    };
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agent?.id ?? null,
        prId: pr!.id,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        status: 'done',
        source: 'local',
        durationMs: stats.duration_ms,
        tokensIn: stats.tokens_in,
        tokensOut: stats.tokens_out,
        costUsd: stats.cost_usd,
        findingsCount,
        grounding: stats.grounding,
        score: seededReview.score,
        blockers,
        error: null,
      })
      .returning();
    await db.insert(t.runTraces).values({
      runId: run!.id,
      trace: {
        config: {
          agent: agent?.name ?? 'General Reviewer',
          version: '1',
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          pr: 482,
          source: 'local',
        },
        stats,
        prompt_assembly: { system: agent?.systemPrompt ?? '', user: '(seeded run — no prompt recorded)' },
        tool_calls: [{ tool: 'review_file', args: 'all files', meta: 'single-pass', ms: stats.duration_ms }],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        log: [
          { t: '00.00', kind: 'info', msg: 'Seeded demo run' },
          { t: '08.20', kind: 'result', msg: `Persisted review with ${findingsCount} finding(s)` },
        ],
      },
    });
    await db
      .update(t.reviews)
      .set({ runId: run!.id, agentId: agent?.id ?? seededReview.agentId })
      .where(eq(t.reviews.id, seededReview.id));
  }

  // ---- PR brief for #482 (e2e shows it with no model call) ----
  // Idempotent: only while the PR has no stored brief. Paths and lines sit inside
  // the seeded `src/config.ts` patch; head sha and review id make it fresh.
  const [existingBrief] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr!.id));
  if (!existingBrief) {
    const briefStats = {
      duration_ms: 6_400,
      tokens_in: 8_190,
      tokens_out: 1_300,
      cost_usd: 0.0021,
      findings: 0,
      grounding: '5/5 refs kept',
    };
    const [briefRun] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: null,
        prId: pr!.id,
        kind: 'brief',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        status: 'done',
        source: 'local',
        durationMs: briefStats.duration_ms,
        tokensIn: briefStats.tokens_in,
        tokensOut: briefStats.tokens_out,
        costUsd: briefStats.cost_usd,
        findingsCount: 0,
        grounding: briefStats.grounding,
      })
      .returning();
    await db.insert(t.runTraces).values({
      runId: briefRun!.id,
      trace: {
        config: { agent: 'PR Brief', provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', pr: 482, source: 'local' },
        stats: briefStats,
        prompt_assembly: { system: '(seeded brief - no prompt recorded)', user: '(seeded brief - no prompt recorded)' },
        tool_calls: [{ tool: 'generate_brief', args: 'openrouter/deepseek/deepseek-v4-flash', meta: 'attempts=1', ms: briefStats.duration_ms }],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        log: [
          { t: '00.00', kind: 'info', msg: 'Seeded demo brief' },
          { t: '06.40', kind: 'result', msg: 'Brief stored' },
        ],
      },
    });
    await db.insert(t.prBrief).values({
      prId: pr!.id,
      json: {
        summary:
          'Adds a token-bucket rate limiter to the public API. A Stripe secret key is committed in config.ts and the limiter settings are read without validation.',
        risks: [
          {
            kind: 'auth',
            title: 'Secret key committed in config',
            explanation: 'A payment provider key sits in plain text in the config module and ships with the repository.',
            severity: 'high',
            file_refs: ['src/config.ts:12'],
          },
          {
            kind: 'config',
            title: 'Limiter settings are unvalidated',
            explanation: 'The window and maximum come straight from config; a zero or negative value would disable limiting.',
            severity: 'medium',
            file_refs: ['src/config.ts:13-15'],
          },
          {
            kind: 'performance',
            title: 'User list may issue one query per user',
            explanation: 'The users endpoint changes under the new limiter; check for a per-row query.',
            severity: 'low',
            file_refs: ['src/api/users.ts'],
          },
        ],
        review_focus: [
          { path: 'src/config.ts', line: 12, reason: 'Hard-coded secret key' },
          { path: 'src/config.ts', line: 14, reason: 'Window length for the limiter' },
          { path: 'src/api/users.ts', line: null, reason: 'Query pattern behind the limited endpoint' },
        ],
      },
      generatedAt: new Date(),
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokensIn: briefStats.tokens_in,
      tokensOut: briefStats.tokens_out,
      costUsd: briefStats.cost_usd,
      headSha: pr!.headSha,
      sourceReviewId: seededReview?.id ?? null,
      runId: briefRun!.id,
      filesTotal: 9,
      filesIncluded: 1,
    });
  }

  return { workspaceId, userId };
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
