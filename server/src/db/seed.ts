import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, the three built-in agents (General + Security +
 * Performance) on the default openrouter/deepseek-v4-flash provider+model,
 * four built-in skills (test-coverage-nudge, corner-case-checklist,
 * mocking-smells, flake-signals), and a fourth agent — Test Quality Reviewer —
 * seeded DISABLED with all four skills linked in order (specs/02-skills.md §9).
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
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- built-in skills (specs/02-skills.md §9 — the D7 control experiment) ----
  // Bodies live inline (not seed-prompts.ts, which is reviewer SYSTEM prompts):
  // a skill body is a fragment appended under an agent's prompt, not a prompt
  // on its own. `skills.name` carries a workspace-unique index (D3), so this is
  // idempotent-by-name the same way the agents above are.
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'test-coverage-nudge',
      description: 'Every new branch needs a test that fails if the branch is removed.',
      type: 'custom',
      source: 'manual',
      enabled: true,
      body: `# Test coverage nudge

When a diff adds a new conditional branch, loop, early return, or error path,
verify the accompanying tests actually exercise it. The bar is not "does a test
touch this file" — it is "does at least one assertion fail if this branch is
deleted or its condition is inverted." A test that calls the function and
checks an unrelated field, or a snapshot test that would pass with the branch
gutted, does not count as coverage for it.

Concretely, for every new \`if\`/\`else\`/\`switch\`/\`catch\`/ternary/\`??\`/\`||\`
short-circuit introduced by the diff:
- Find the test(s) that reach it.
- Confirm the assertion pins the OUTPUT of that specific branch, not just that
  the call didn't throw.
- If no test reaches the branch, or the test would pass identically with the
  branch removed, flag it — cite the file:line of the branch and name the
  missing assertion (e.g. "assert the 429 response body when the rate limit is
  hit, not just the status code").

This is not a coverage-percentage rule and it is not a call for more tests in
general — a diff with zero new branches needs nothing here. A single new
branch covered by one precise assertion is a pass. Report at WARNING unless
the uncovered branch is on a security- or money-relevant path (auth, payment,
data deletion), where it is CRITICAL.`,
    },
    {
      workspaceId,
      name: 'corner-case-checklist',
      description: 'A five-item corner-case checklist: empty, null, boundary, concurrency, error path.',
      type: 'rubric',
      source: 'manual',
      enabled: true,
      body: `# Corner-case checklist

Before approving a diff, check its new or changed logic against five corner
cases, in this order, and only report the ones the diff's tests do not already
cover:

1. **Empty** — an empty string, empty array, empty object, or empty result set
   where the code assumes at least one element (a \`[0]\` access, a \`reduce\`
   without an initial value, a \`Math.min\`/\`Math.max\` over a spread).
2. **Null / undefined** — a missing optional field, an unresolved promise
   value, or a DB row that legitimately doesn't exist (\`findFirst\` returning
   \`undefined\`) flowing into code that dereferences it.
3. **Boundary** — the first/last element, \`limit\`/\`offset\` at 0 or at the max,
   an off-by-one in a loop bound, a date/number at exactly a threshold.
4. **Concurrency** — two callers racing on the same row or resource, a
   check-then-act gap (TOCTOU), a shared counter or cache updated without
   coordination.
5. **Error path** — the failure branch of an I/O call: a rejected promise, a
   non-2xx response, a thrown exception — is it caught, logged, and does it
   fail in the right direction (closed for security/money, open for
   best-effort telemetry)?

For each item, either point to the test that already exercises it, or flag the
gap with a concrete example input that would break the code today. Do not flag
a corner case that is genuinely inapplicable to the changed code — this is a
checklist to run through, not five findings owed on every PR.`,
    },
    {
      workspaceId,
      name: 'mocking-smells',
      description: 'Flags mocks that encode implementation details instead of the contract.',
      type: 'convention',
      source: 'manual',
      enabled: true,
      body: `# Mocking smells

A mock should stand in for a CONTRACT — what a dependency promises to return
or do — never for its internal implementation. When a test mocks a function
and asserts on HOW it was called (exact argument shapes mirroring the callee's
current internals, call order that isn't semantically required, or a return
value hand-crafted to match today's code path rather than the dependency's
real API), the test is coupled to the implementation and will break on every
refactor that changes nothing observable.

Flag a mock as a smell when any of these hold:
- The mock's return value or call assertion would need to change if the
  production code were rewritten to the same externally-visible behavior via a
  different internal path.
- The test asserts the mock was called with an argument object matching the
  exact internal representation (e.g. an ORM's query builder chain) rather
  than the meaningful inputs (e.g. "called with workspaceId X").
- More than one or two collaborators are mocked to make a unit test pass,
  suggesting the unit under test is doing too much or the test would be better
  as an integration test against the real dependency.
- A mock silently changed shape when the real dependency's contract changed,
  and nothing caught it — a sign the mock has drifted from the interface it
  claims to stand in for.

Prefer asserting on inputs/outputs at the boundary the test actually owns, and
prefer a fake or the real implementation (in-memory DB, mock adapter already
in \`src/adapters/mocks.ts\`) over a hand-rolled mock when the contract is worth
preserving. Report at WARNING; escalate to CRITICAL only if the mock actively
hides a broken contract (e.g. it always returns success and the real code
path is never exercised anywhere in the suite).`,
    },
    {
      workspaceId,
      name: 'flake-signals',
      description: 'Flags time, ordering, shared-state, and network dependencies inside unit tests.',
      type: 'convention',
      source: 'manual',
      enabled: true,
      body: `# Flake signals

A unit test that depends on wall-clock time, execution ordering, shared
mutable state, or the network is not deterministic, and a test suite gets
slower and less trusted every time one of these lands. Flag any of the
following inside a NEW or CHANGED unit test (not \`*.it.test.ts\`, which is
allowed to hit Docker/DB by design):

- **Time** — \`Date.now()\`, \`new Date()\`, \`setTimeout\`/\`setInterval\` without a
  fake timer, or an assertion with an implicit tolerance ("should complete in
  under Xms") that will flake under CI load. Require an injected clock or
  \`vi.useFakeTimers()\`.
- **Ordering** — an assertion that depends on \`Promise.all\`/concurrent
  operations resolving in a particular order, or on \`Object.keys\`/\`for...in\`
  iteration order for something not guaranteed to be ordered.
- **Shared state** — a module-level variable, a singleton, or a DB row/file
  mutated by one test and read by another without explicit setup/teardown
  (\`beforeEach\`/\`afterEach\`) — passes in isolation, fails under \`--shuffle\` or
  parallel workers.
- **Network** — an unmocked \`fetch\`/\`octokit\`/LLM call reaching a real
  endpoint. A hermetic test must not depend on network availability, rate
  limits, or an external service's uptime; use \`src/adapters/mocks.ts\` or a
  recorded fixture instead.

Cite the exact construct (file:line) and name the deterministic replacement
(fake timer, seeded/sorted comparison, isolated fixture, mock adapter). This is
about test code only — flag it as a WARNING unless the flake signal would make
CI non-deterministic often enough to block merges reliably, in which case
treat it as CRITICAL.`,
    },
  ];

  const seededSkillIds: string[] = [];
  for (const s of seedSkills) {
    let [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existing) {
      [existing] = await db.insert(t.skills).values(s).returning();
      // Mirror SkillsRepository.insert()'s v1 snapshot: a skill created any
      // other way (the API) always gets one, so Versions is never empty for
      // a skill that has never been edited.
      await db.insert(t.skillVersions).values({ skillId: existing!.id, version: 1, body: existing!.body });
    }
    seededSkillIds.push(existing!.id);
  }

  // ---- built-in agent #4: Test Quality Reviewer (D7) — seeds DISABLED, and is
  // the only built-in agent with skills linked, so a fresh clone's existing
  // review runs are unchanged until a later lesson switches it on.
  let [testQualityAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  if (!testQualityAgent) {
    [testQualityAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Test Quality Reviewer',
        description: 'Flags uncovered branches, missing corner cases, over-mocking, and flake signals.',
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
        enabled: false,
        version: 1,
        createdBy: userId,
      })
      .returning();
  }

  // Link all four skills, in table order, each link enabled — idempotent via
  // the (agent_id, skill_id) primary key.
  for (const [order, skillId] of seededSkillIds.entries()) {
    await db
      .insert(t.agentSkills)
      .values({ agentId: testQualityAgent!.id, skillId, order, enabled: true })
      .onConflictDoNothing();
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
