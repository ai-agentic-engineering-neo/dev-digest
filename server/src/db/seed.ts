import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';
import { SEED_SKILLS, SEED_SKILL_LINKS } from './seed-skills.js';
import { DEMO_PRS } from './seed-demo-prs.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, the four built-in agents (General + Security +
 * Performance + Test Quality), all on the default openrouter/deepseek-v4-flash
 * provider+model, and one completed run on PR #482 for each of Security and
 * Performance.
 *
 * M2: the skills (with their version history) and every agent's skill links,
 * and demo PRs #483 / #484 with real patches and no runs.
 *
 * Later milestones populate the other tables (conventions, memory, eval, …)
 * once their features are built — they start empty here.
 */

/** Stats of a seeded agent run (the numbers its timeline row and trace show). */
interface SeedRunStats {
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  findingsCount: number;
  grounding: string;
}

/** The stored trace of a seeded run on PR #482, built from the run's stats. */
function seedRunTrace(agent: typeof t.agents.$inferSelect, run: SeedRunStats) {
  const seconds = run.durationMs / 1000;
  return {
    config: {
      agent: agent.name,
      version: String(agent.version),
      provider: agent.provider,
      model: agent.model,
      pr: 482,
      source: 'local',
    },
    stats: {
      duration_ms: run.durationMs,
      tokens_in: run.tokensIn,
      tokens_out: run.tokensOut,
      cost_usd: run.costUsd,
      findings: run.findingsCount,
      grounding: run.grounding,
    },
    prompt_assembly: { system: agent.systemPrompt, skills: null, memory: null, specs: null, user: 'Review PR #482' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: [
      { t: '00.00', kind: 'info', msg: `Agent run started · ${agent.name}` },
      {
        t: seconds.toFixed(2).padStart(5, '0'),
        kind: 'result',
        msg: `Run complete · ${run.findingsCount} findings · $${run.costUsd} · ${seconds.toFixed(1)}s`,
      },
    ],
  };
}

import { DEFAULT_WORKSPACE_NAME, SYSTEM_USER_EMAIL } from './defaults.js';
export { DEFAULT_WORKSPACE_NAME, SYSTEM_USER_EMAIL };

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
      description: 'Finds untested branches, missed corner cases, over-mocking and flaky tests.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
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

  // ---- PR #482: one completed agent run behind the sample review ----
  // Gives the M1 run cost badge real data on a fresh DB (PR list COST column,
  // Agent runs timeline, review-run header, trace drawer). Idempotent: skipped
  // once the PR has any agent run.
  const [existingRun] = await db
    .select({ id: t.agentRuns.id })
    .from(t.agentRuns)
    .where(eq(t.agentRuns.prId, pr!.id))
    .limit(1);
  const [securityAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  if (!existingRun && securityAgent) {
    const seedRun = {
      durationMs: 8200,
      tokensIn: 8200,
      tokensOut: 1300,
      costUsd: 0.0142,
      findingsCount: 2,
      grounding: '2/2 passed',
    };
    // One transaction: a half-written run would make the idempotency guard
    // above skip this block forever, leaving a run with no trace.
    await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: securityAgent.id,
          prId: pr!.id,
          provider: securityAgent.provider,
          model: securityAgent.model,
          status: 'done',
          score: 61,
          blockers: 1,
          ...seedRun,
        })
        .returning();
      await tx.insert(t.runTraces).values({ runId: run!.id, trace: seedRunTrace(securityAgent, seedRun) });
      // Attach the sample review (created above without a run) to this run.
      await tx
        .update(t.reviews)
        .set({ runId: run!.id, agentId: securityAgent.id })
        .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.model, 'seed'), isNull(t.reviews.runId)));
    });
  }

  // ---- PR #482: a second agent's run and review (Performance Reviewer) ----
  // Gives the M1 FINDINGS column a PR reviewed by two agents on a fresh DB: the
  // list sums each agent's latest review (1 CRITICAL · 2 WARNING · 2
  // SUGGESTION). One finding is below the low-confidence threshold, so "Hide
  // low confidence" has something to hide. Dated one hour before the Security
  // Reviewer review, which therefore stays the PR's latest one: the list score
  // and the run that is open by default do not change. Idempotent: skipped once
  // this agent has a seeded review on the PR.
  const [performanceAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Performance Reviewer')));
  if (performanceAgent) {
    const seedReviews = await db
      .select({ agentId: t.reviews.agentId, createdAt: t.reviews.createdAt })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.model, 'seed')));
    if (!seedReviews.some((rv) => rv.agentId === performanceAgent.id)) {
      const newest = seedReviews.find((rv) => rv.agentId !== performanceAgent.id)?.createdAt ?? new Date();
      const ranAt = new Date(newest.getTime() - 3_600_000);
      const seedRun: SeedRunStats = {
        durationMs: 6100,
        tokensIn: 7400,
        tokensOut: 900,
        costUsd: 0.0098,
        findingsCount: 3,
        grounding: '3/3 passed',
      };
      // One transaction, so a failure cannot leave an orphan run and trace
      // that the review-based idempotency guard would re-add on every seed.
      await db.transaction(async (tx) => {
        const [run] = await tx
          .insert(t.agentRuns)
          .values({
            workspaceId,
            agentId: performanceAgent.id,
            prId: pr!.id,
            provider: performanceAgent.provider,
            model: performanceAgent.model,
            status: 'done',
            score: 84,
            blockers: 0,
            ranAt,
            ...seedRun,
          })
          .returning();
        await tx.insert(t.runTraces).values({ runId: run!.id, trace: seedRunTrace(performanceAgent, seedRun) });
        const [review] = await tx
          .insert(t.reviews)
          .values({
            workspaceId,
            prId: pr!.id,
            agentId: performanceAgent.id,
            runId: run!.id,
            kind: 'review',
            verdict: 'comment',
            summary:
              'The limiter is correct but adds a Redis round-trip to every public request, and two smaller hot-path costs are worth removing.',
            score: 84,
            model: 'seed',
            createdAt: ranAt,
          })
          .returning();
        await tx.insert(t.findings).values([
          {
            reviewId: review!.id,
            file: 'src/middleware/ratelimit.ts',
            startLine: 41,
            endLine: 48,
            severity: 'WARNING',
            category: 'perf',
            title: 'Rate limiter makes a Redis round-trip on every request',
            rationale: 'Each request awaits INCR and EXPIRE as two separate commands before the handler runs.',
            suggestion: 'Send both commands in one pipeline, or use a Lua script.',
            confidence: 0.82,
          },
          {
            reviewId: review!.id,
            file: 'src/middleware/ratelimit.ts',
            startLine: 17,
            endLine: 17,
            severity: 'SUGGESTION',
            category: 'perf',
            title: 'Compile the route patterns once at startup',
            rationale: 'The limiter builds a RegExp from the route table inside the request handler.',
            suggestion: 'Build the patterns when the middleware is created and reuse them.',
            confidence: 0.74,
          },
          {
            reviewId: review!.id,
            file: 'src/api/public/webhooks.ts',
            startLine: 22,
            endLine: 25,
            severity: 'SUGGESTION',
            category: 'perf',
            title: 'Webhook handler may parse the body twice',
            rationale: 'The signature check and the handler each appear to call JSON.parse on the raw body.',
            suggestion: 'Parse once and pass the parsed payload to the handler.',
            confidence: 0.55,
          },
        ]);
      });
    }
  }

  await seedSkills(db, workspaceId);
  await seedDemoPrs(db, workspaceId, repoId);

  return { workspaceId, userId };
}

/**
 * M2 — skills, their version rows, and the agents' links. A skill is keyed by
 * (workspace, name) and skipped once it exists. An agent's links are seeded
 * only while it has no links AND no `agent_versions` snapshot with
 * `skill_links`: every M2 link change writes that snapshot, so its absence
 * means the user never touched the links (a pre-M2 or freshly seeded agent).
 * An agent whose links the user cleared has a snapshot and stays empty. The
 * "no links" half keeps the seed idempotent (seeded links write no snapshot).
 */
async function seedSkills(db: Db, workspaceId: string): Promise<void> {
  const ids = new Map<string, string>();
  for (const [i, s] of SEED_SKILLS.entries()) {
    const [existing] = await db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (existing) {
      ids.set(s.name, existing.id);
      continue;
    }
    const first = s.versions[0]!;
    const last = s.versions[s.versions.length - 1]!;
    // Distinct created_at seconds keep the list (oldest first) in seed order.
    const createdAt = new Date(Date.parse(`${first.at}T09:00:00Z`) + i * 1000);
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId,
          name: s.name,
          description: last.description,
          type: s.type,
          source: s.source,
          body: last.body,
          enabled: s.enabled,
          version: s.versions.length,
          createdAt,
          updatedAt: new Date(`${last.at}T09:00:00Z`),
        })
        .returning({ id: t.skills.id });
      await tx.insert(t.skillVersions).values(
        s.versions.map((v, n) => ({
          skillId: row!.id,
          version: n + 1,
          name: s.name,
          description: v.description,
          type: s.type,
          body: v.body,
          note: v.note,
          createdAt: n === 0 ? createdAt : new Date(`${v.at}T09:00:00Z`),
        })),
      );
      return row!.id;
    });
    ids.set(s.name, id);
  }

  const skillId = (name: string): string => {
    const id = ids.get(name);
    if (!id) throw new Error(`Unknown seed skill "${name}"`);
    return id;
  };
  for (const [agentName, links] of Object.entries(SEED_SKILL_LINKS)) {
    const [agent] = await db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agent || links.length === 0) continue;
    const agentId = agent.id;
    const [linked] = await db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agentId))
      .limit(1);
    if (linked) continue;
    const [edited] = await db
      .select({ version: t.agentVersions.version })
      .from(t.agentVersions)
      .where(
        and(
          eq(t.agentVersions.agentId, agentId),
          sql`jsonb_typeof(${t.agentVersions.configJson} -> 'skill_links') = 'array'`,
        ),
      )
      .limit(1);
    if (edited) continue;
    await db.insert(t.agentSkills).values(
      links.map((l, order) => ({ agentId, skillId: skillId(l.skill), order, enabled: l.enabled })),
    );
  }
}

/**
 * M2 — demo PRs #483 and #484 for the control experiment, each with real
 * `pr_files` patches (so a review rebuilds the diff without a clone) and no
 * runs. Keyed by PR number; PR #482 is untouched.
 */
async function seedDemoPrs(db: Db, workspaceId: string, repoId: string): Promise<void> {
  for (const demo of DEMO_PRS) {
    const [existing] = await db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, demo.number)));
    if (existing) continue;
    await db.transaction(async (tx) => {
      const [pr] = await tx
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number: demo.number,
          title: demo.title,
          author: demo.author,
          branch: demo.branch,
          base: 'main',
          headSha: demo.headSha,
          additions: demo.files.reduce((n, f) => n + f.additions, 0),
          deletions: demo.files.reduce((n, f) => n + f.deletions, 0),
          filesCount: demo.files.length,
          status: 'needs_review',
          body: demo.body,
        })
        .returning({ id: t.pullRequests.id });
      await tx.insert(t.prFiles).values(
        demo.files.map((f) => ({
          prId: pr!.id,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
        })),
      );
      await tx.insert(t.prCommits).values({
        prId: pr!.id,
        sha: demo.headSha,
        message: demo.commitMessage,
        author: demo.author,
      });
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
