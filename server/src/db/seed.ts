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
import { SEED_SKILLS } from './seed-skills.js';

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
 * provider+model, and the workspace-authored skills each agent links.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …) once
 * their features are built — they start empty here.
 *
 * `--no-demo` (or `seed(db, { demo: false })`) skips the demo repo/PR/review and
 * seeds only the workspace, its agents and their skills.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export interface SeedOptions {
  /**
   * Create the demo repo (acme/payments-api), its PR and its sample review.
   * Off (`--no-demo`) when you want the agents and skills in a workspace that
   * holds only real, imported repositories.
   */
  demo?: boolean;
}

export async function seed(
  db: Db,
  options: SeedOptions = {},
): Promise<{ workspaceId: string; userId: string }> {
  const { demo = true } = options;
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
  if (demo) {
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
  }

  // ---- built-in agents ----
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
        'Reviews the tests: uncovered branches, missed corner cases, over-mocking and flakiness.',
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
      description:
        'Finds API contract breaks in a pull request: removed or renamed routes, parameters and response fields, tightened validation, missing version bump or deprecation.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  // Agents this run actually created. Only these get their seeded skill links
  // wholesale — see the linking rule below.
  const createdAgents = new Set<string>();
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) {
      await db.insert(t.agents).values(a);
      createdAgents.add(a.name);
    }
  }

  // ---- built-in skills + their agent links ----
  // Skill bodies live in ./seed-skills.ts. Each insert also records version 1 in
  // skill_versions, the same snapshot the editor writes, so the version history
  // of a seeded skill is not empty. Linking is by NAME because ids are random
  // per database; a missing agent simply skips its link.
  const agentIdByName = new Map(
    (await db.select({ id: t.agents.id, name: t.agents.name }).from(t.agents).where(eq(t.agents.workspaceId, workspaceId)))
      .map((a) => [a.name, a.id] as const),
  );

  // Next free slot in each agent's skill list. SEED_SKILLS is iterated in
  // order, so this is the position the block takes in that agent's prompt.
  //
  // Starts AFTER the links an agent already has. Re-seeding a workspace whose
  // user already built an agent of the same name (the seed matches agents by
  // name) would otherwise put the seeded skills at orders 0..n on top of the
  // user's own 0..m — two blocks claiming the same prompt position.
  const existingLinks = await db
    .select({ agentId: t.agentSkills.agentId, order: t.agentSkills.order })
    .from(t.agentSkills);
  const nextOrder = new Map<string, number>();
  for (const link of existingLinks) {
    nextOrder.set(link.agentId, Math.max(nextOrder.get(link.agentId) ?? 0, link.order + 1));
  }

  for (const skill of SEED_SKILLS) {
    let [row] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, skill.name)));
    const skillCreated = !row;
    if (!row) {
      [row] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: skill.name,
          description: skill.description,
          type: skill.type,
          source: skill.source,
          body: skill.body,
          enabled: true,
          version: 1,
        })
        .returning();
      await db
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: 1, body: skill.body, note: 'Seeded' })
        .onConflictDoNothing();
    }
    for (const agentName of skill.agents) {
      const agentId = agentIdByName.get(agentName);
      // A typo here used to seed the skill with zero links: the screens look
      // fine, the prompt quietly loses the block, and the with/without control
      // experiment measures nothing. Fail the seed instead.
      if (!agentId) {
        throw new Error(
          `seed: skill "${skill.name}" links unknown agent "${agentName}" — fix SEED_SKILLS.agents`,
        );
      }
      // Link only what is NEW on at least one side. When both the agent and the
      // skill already existed, a missing link is a DECISION — the user unlinked
      // it on the agent's Skills tab — and re-seeding must not undo it: the
      // block would silently come back into that agent's prompt. A new agent
      // gets its full default set; a new built-in skill joins the existing
      // agents it was written for, because nobody has had a chance to refuse it.
      if (!createdAgents.has(agentName) && !skillCreated) continue;
      const order = nextOrder.get(agentId) ?? 0;
      nextOrder.set(agentId, order + 1);
      await db
        .insert(t.agentSkills)
        .values({ agentId, skillId: row!.id, order })
        .onConflictDoNothing();
    }
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
  const demo = !process.argv.includes('--no-demo');
  seed(handle.db, { demo })
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
