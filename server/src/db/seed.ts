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
import {
  TEST_COVERAGE_RUBRIC_SKILL,
  TEST_SMELLS_SKILL,
  API_BREAKING_CHANGES_SKILL,
  API_VERSIONING_SKILL,
} from './seed-skills.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PRs #482/#483/#484 with files/commits, a sample
 * review with a few findings, five built-in agents (General + Security +
 * Performance + Test Quality + API Contract) on the default
 * openrouter/deepseek-v4-flash provider+model, and the skills linked to the last
 * two.
 *
 * #483 and #484 are the control-experiment fixtures: each carries a real patch
 * whose defect its reviewer only names once the matching skill is attached.
 *
 * Course lessons populate the remaining tables (conventions, memory, eval, …)
 * once their features are built — they start empty here.
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

  // ---- PR #483 / #484 (control-experiment fixtures) ----
  // Both carry a real `patch`, which is what the review run reconstructs its
  // diff from when the repo has no clone (see reviews/diff-loader.ts). Each
  // defect is one its reviewer only names once the matching skill is attached:
  //   #483 → a test that covers the happy path of a function full of guards
  //   #484 → a route whose query contract changes under existing callers
  const fixtures: Array<{
    pr: Omit<typeof t.pullRequests.$inferInsert, 'workspaceId' | 'repoId'>;
    files: Array<{ path: string; additions: number; deletions: number; patch: string }>;
    commit: { sha: string; message: string; author: string };
  }> = [
    {
      pr: {
        number: 483,
        title: 'Add refundPayment service + tests',
        author: 'dan.oyelowo',
        branch: 'feat/refund-service',
        base: 'main',
        headSha: 'b7c1d9e2f3a4',
        additions: 46,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: 'Adds the refund service with full test coverage for the refund flow.',
      },
      files: [
        {
          path: 'src/services/refund.ts',
          additions: 24,
          deletions: 0,
          patch: [
            '@@ -0,0 +1,24 @@',
            "+import { db } from '../db/client.js';",
            '+',
            '+export interface RefundResult {',
            '+  id: string;',
            '+  amount: number;',
            "+  status: 'refunded' | 'partial';",
            '+}',
            '+',
            '+export async function refundPayment(paymentId: string, amount: number): Promise<RefundResult> {',
            '+  const payment = await db.payments.byId(paymentId);',
            '+  if (!payment) {',
            "+    throw new Error('payment ' + paymentId + ' not found');",
            '+  }',
            "+  if (payment.status === 'refunded') {",
            "+    throw new Error('payment already refunded');",
            '+  }',
            '+  if (amount <= 0) {',
            "+    throw new Error('refund amount must be positive');",
            '+  }',
            '+  if (amount > payment.amount) {',
            "+    throw new Error('refund exceeds captured amount');",
            '+  }',
            "+  const status = amount === payment.amount ? 'refunded' : 'partial';",
            '+  await db.payments.update(paymentId, { status, refundedAmount: amount });',
            '+  return { id: paymentId, amount, status };',
            '+}',
          ].join('\n'),
        },
        {
          path: 'src/services/refund.test.ts',
          additions: 22,
          deletions: 0,
          patch: [
            '@@ -0,0 +1,22 @@',
            "+import { describe, it, expect, vi, type Mock } from 'vitest';",
            "+import { db } from '../db/client.js';",
            "+import { refundPayment } from './refund.js';",
            '+',
            "+vi.mock('../db/client.js', () => ({",
            '+  db: { payments: { byId: vi.fn(), update: vi.fn() } },',
            '+}));',
            '+',
            "+describe('refundPayment', () => {",
            "+  it('refunds a captured payment', async () => {",
            "+    (db.payments.byId as Mock).mockResolvedValue({ id: 'p1', amount: 100, status: 'captured' });",
            '+    (db.payments.update as Mock).mockResolvedValue(undefined);',
            '+',
            "+    const result = await refundPayment('p1', 100);",
            '+',
            '+    expect(result).toBeDefined();',
            '+    expect(db.payments.update).toHaveBeenCalled();',
            '+  });',
            '+});',
          ].join('\n'),
        },
      ],
      commit: {
        sha: 'b7c1d9e2f3a4',
        message: 'Add refundPayment service + tests',
        author: 'dan.oyelowo',
      },
    },
    {
      pr: {
        number: 484,
        title: 'Scope the payments list to a customer',
        author: 'marisa.koch',
        branch: 'feat/payments-by-customer',
        base: 'main',
        headSha: 'c4e8a1b6d7f0',
        additions: 12,
        deletions: 8,
        filesCount: 1,
        status: 'needs_review',
        body: 'Every caller of GET /payments wants one customer, so the query now takes customer_id.',
      },
      files: [
        {
          path: 'src/api/payments.ts',
          additions: 12,
          deletions: 8,
          patch: [
            '@@ -12,22 +12,26 @@ const ListQuery = z.object({',
            ' const ListQuery = z.object({',
            '-  limit: z.coerce.number().int().min(1).max(100).default(25),',
            "-  status: z.enum(['captured', 'refunded', 'failed']).optional(),",
            '+  page_size: z.coerce.number().int().min(1).max(50).default(25),',
            "+  status: z.enum(['captured', 'refunded']),",
            '+  customer_id: z.string().uuid(),',
            ' });',
            ' ',
            " app.get('/payments', { schema: { querystring: ListQuery } }, async (req) => {",
            '-  const { limit, status } = req.query;',
            '-  const rows = await repo.list({ limit, status });',
            '-  return rows.map(toPaymentDto);',
            '+  const { page_size, status, customer_id } = req.query;',
            '+  const rows = await repo.list({',
            '+    limit: page_size,',
            '+    status,',
            '+    customerId: customer_id,',
            '+  });',
            '+  return { items: rows.map(toPaymentDto), page_size };',
            ' });',
          ].join('\n'),
        },
      ],
      commit: {
        sha: 'c4e8a1b6d7f0',
        message: 'Scope the payments list to a customer',
        author: 'marisa.koch',
      },
    },
  ];

  for (const fx of fixtures) {
    const [existingPr] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, fx.pr.number)));
    if (existingPr) continue;
    const [row] = await db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId, ...fx.pr })
      .returning();
    await db.insert(t.prFiles).values(fx.files.map((f) => ({ prId: row!.id, ...f })));
    await db.insert(t.prCommits).values({ prId: row!.id, ...fx.commit });
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
      description:
        'Judges the tests in a diff: uncovered branches, missing corner cases, over-mocking, flakes.',
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
      description: 'Compares a route contract before and after the diff and flags what breaks callers.',
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

  // ---- skills + agent links (L5) ----
  // A skill's `description` is its interface: it is what tells a reader (and an
  // agent's author) when the block applies, so it is written as an instruction.
  // Bodies live in ./seed-skills.ts. Seeding writes v1 into skill_versions by
  // hand — only the repository does that automatically.
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'test-coverage-rubric',
      description:
        'Enumerate the branches and boundary values of the code under test, then report each one the tests leave uncovered.',
      type: 'rubric',
      source: 'manual',
      body: TEST_COVERAGE_RUBRIC_SKILL,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'test-smells',
      description:
        'Flag tests that cannot fail, mock away the code under test, or depend on time, ordering, or randomness.',
      type: 'convention',
      source: 'manual',
      body: TEST_SMELLS_SKILL,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'api-breaking-changes',
      description:
        'Compare the route contract before and after the diff and name every change that breaks an existing client.',
      type: 'rubric',
      source: 'manual',
      body: API_BREAKING_CHANGES_SKILL,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'api-versioning',
      description:
        'Check that a breaking contract change ships additively, versioned, or deprecated — and say what is missing.',
      type: 'convention',
      source: 'manual',
      body: API_VERSIONING_SKILL,
      enabled: true,
      version: 1,
    },
  ];
  for (const sk of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));
    if (existing) continue;
    const [row] = await db.insert(t.skills).values(sk).returning();
    await db
      .insert(t.skillVersions)
      .values({ skillId: row!.id, version: 1, body: sk.body })
      .onConflictDoNothing();
  }

  // Array position is the link's `order`, which is the order the blocks appear
  // in the assembled prompt.
  const skillLinks: Record<string, string[]> = {
    'Test Quality Reviewer': ['test-coverage-rubric', 'test-smells'],
    'API Contract Reviewer': ['api-breaking-changes', 'api-versioning'],
  };
  for (const [agentName, skillNames] of Object.entries(skillLinks)) {
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agent) continue;
    for (const [order, skillName] of skillNames.entries()) {
      const [skill] = await db
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, skillName)));
      if (!skill) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId: agent.id, skillId: skill.id, order, enabled: true })
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
