import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and, count, inArray } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';
import { RETIRED_SEED_SKILLS, SEED_AGENT_SKILLS, SEED_SKILLS } from './seed-skills.js';
import { versionNote } from '../modules/skills/domain.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Also seeds the Test Quality + API Contract reviewers and the built-in skills
 * (src/db/seed-skills.ts) linked to agents. Other course tables (conventions,
 * memory, eval, …) start empty here.
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
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
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
      description: 'Checks test quality: uncovered branches, missed edge cases, over-mocking, flaky tests.',
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
      description: 'Catches breaking changes to routes, request/response shapes and Zod contracts.',
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

  await seedReviewRun(db, workspaceId, pr!.id);

  await seedSkills(db, workspaceId);

  return { workspaceId, userId };
}

/**
 * One finished run for the seeded PR #482 review, with a persisted trace that includes a
 * "Project context" block (SPEC-01), so the trace drawer can be checked without a model call.
 * Idempotent: only when the seeded review (`model: 'seed'`) has no run yet. Seed data only —
 * the doc paths are illustrative, no doc content is stored.
 */
async function seedReviewRun(db: Db, workspaceId: string, prId: string): Promise<void> {
  const [review] = await db
    .select({ id: t.reviews.id, runId: t.reviews.runId })
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, prId), eq(t.reviews.model, 'seed')));
  if (!review || review.runId) return;
  const [agent] = await db
    .select({ id: t.agents.id, name: t.agents.name, systemPrompt: t.agents.systemPrompt })
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  if (!agent) return;

  await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        status: 'done',
        durationMs: 4200,
        tokensIn: 5200,
        tokensOut: 640,
        findingsCount: 2,
        grounding: '2/2 passed',
        score: 61,
        blockers: 1,
      })
      .returning({ id: t.agentRuns.id });
    await tx.insert(t.runTraces).values({
      runId: run!.id,
      trace: {
        config: { agent: agent.name, version: '1', provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL, pr: 482, source: 'local' },
        stats: { duration_ms: 4200, tokens_in: 5200, tokens_out: 640, cost_usd: null, findings: 2, grounding: '2/2 passed' },
        prompt_assembly: {
          system: agent.systemPrompt,
          skills: null,
          memory: null,
          specs: null,
          user: 'Review PR #482 (seeded run — no model call was made).',
        },
        tool_calls: [],
        raw_output: '',
        memory_pulled: [],
        specs_read: ['docs/rate-limiting.md'],
        log: [
          { t: '00.10', kind: 'info', msg: 'Starting review with agent "Security Reviewer" (seeded run)' },
          { t: '00.20', kind: 'info', msg: 'Project context: 1 of 2 doc(s) included (~820 tokens); 1 left out' },
          { t: '04.20', kind: 'result', msg: 'Citation grounding: 2/2 passed' },
        ],
        project_context: {
          status: 'ok',
          cap_tokens: 4000,
          total_tokens: 820,
          included: [{ path: 'docs/rate-limiting.md', tokens: 820 }],
          left_out: [{ path: 'specs/security-baseline.md', tokens: 5100, reason: 'too_large' }],
          changed_by_pr: [],
        },
      },
    });
    await tx.update(t.reviews).set({ runId: run!.id }).where(eq(t.reviews.id, review.id));
  });
}

/**
 * Built-in skills (text-only rubrics) + their links to agents. Idempotent by
 * name: an existing skill is left untouched (the user may have edited it), and
 * links are only created for skills inserted in THIS run, so a link the user
 * removed is not re-added by a later re-seed.
 */
async function seedSkills(db: Db, workspaceId: string): Promise<void> {
  // Retired seed skills: drop them while unedited (links cascade).
  await db
    .delete(t.skills)
    .where(
      and(
        eq(t.skills.workspaceId, workspaceId),
        inArray(t.skills.name, RETIRED_SEED_SKILLS),
        eq(t.skills.source, 'manual'),
        eq(t.skills.version, 1),
      ),
    );

  const created = new Map<string, string>(); // skill name → id (new this run)
  for (const sk of SEED_SKILLS) {
    const [existing] = await db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));
    if (existing) continue;
    // Skill + its v1 history row together: a skill without a version row would
    // be skipped (by name) on every later re-seed and never repaired.
    const skillId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ workspaceId, ...sk, source: 'manual', enabled: true, version: 1 })
        .returning({ id: t.skills.id });
      // note: migration 0013 only back-fills rows that already exist, so on a fresh DB
      // (CI e2e) a null note would render as the 'Updated' fallback, not 'Initial version'.
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: 1, body: sk.body, note: versionNote(null, true) });
      return row!.id;
    });
    created.set(sk.name, skillId);
  }

  for (const [agentName, skillNames] of Object.entries(SEED_AGENT_SKILLS)) {
    const [agent] = await db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agent) continue;
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agent.id));
    let order = Number(n);
    for (const name of skillNames) {
      const skillId = created.get(name);
      if (!skillId) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId: agent.id, skillId, order: order++ })
        .onConflictDoNothing();
    }
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
