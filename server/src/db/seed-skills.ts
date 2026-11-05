/**
 * Built-in skills used by the seed — reusable, text-only review rubrics linked to
 * agents (agent name → ordered skill names in SEED_AGENT_SKILLS). The DB is the
 * source of truth at run time; edit a seeded skill in the Skills UI.
 *
 * Descriptions are the skill's interface: directive, "Use when … / Flags …".
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  // ---- Test Quality --------------------------------------------------------
  {
    name: 'untested-branches',
    type: 'rubric',
    description:
      'Use on every PR that changes logic. Flag each new or changed branch (if/else, switch case, early return, catch, ?? fallback) that no test in the diff exercises.',
    body: `For every function the diff adds or changes:
1. List its branches: each side of an if/else, every switch case, every early
   return / throw, every catch block, every \`??\` / \`||\` fallback.
2. For each branch, find a test in the diff (or an existing test the diff shows)
   that drives execution into it AND asserts its outcome.
3. A branch with no such test is a finding:
   - WARNING when the uncovered branch is an error path, a guard, or a fallback
     (these are the branches that fail in production).
   - SUGGESTION for trivial branches (logging only, pure formatting).
4. "Only the happy path is tested" is the classic case: the success branch has a
   test, the rejection / empty / not-found branch has none. Name the uncovered
   branch with its file:line and the input that would reach it.`,
  },
  {
    name: 'boundary-cases',
    type: 'rubric',
    description:
      'Use when tests cover input-handling code. Flag missing edge cases: empty, zero, negative, boundary ±1, null/undefined, duplicates, very large and unicode inputs.',
    body: `For every input the changed code accepts, check the tests try the boundaries:
- Collections: empty, single element, duplicates, unsorted.
- Numbers: 0, negative, exactly at a limit, limit ± 1, NaN where reachable.
- Strings: empty, whitespace only, very long, unicode / emoji, mixed case.
- Optional values: null and undefined (they often take different paths).
- Time: timezone boundaries, end of month, DST if dates are involved.
Report a WARNING when the code contains an explicit comparison or limit
(\`<\`, \`<=\`, \`.length\`, \`slice\`, \`max\`) and no test hits the boundary value — an
off-by-one there would ship unnoticed. Name the exact missing input.`,
  },
  {
    name: 'over-mocking',
    type: 'convention',
    description:
      'Use when tests use vi.mock / jest.mock / spies. Flag tests that mock the unit under test, assert only on mocks, or mock so much that the real behaviour is never executed.',
    body: `A test is over-mocked when it can pass while the real code is broken:
- The module under test (or its own internal helpers) is mocked.
- The only assertions are \`toHaveBeenCalled\` / \`toHaveBeenCalledWith\` on mocks,
  with no assertion on the returned value, rendered output or persisted state.
- A mock returns exactly what the test then asserts (tautology).
- Pure functions (formatters, mappers, reducers) are mocked instead of called.
Prefer: mock only the boundary (network, DB, clock, LLM). Report WARNING with the
test name and what real behaviour is therefore untested.`,
  },
  {
    name: 'flaky-test-patterns',
    type: 'custom',
    description:
      'Use on every PR that adds or edits tests. Flag patterns that make tests flaky: real timers/sleeps, Date.now/random without control, real network, shared mutable fixtures, order dependence.',
    body: `Flag (WARNING) a test that depends on something it does not control:
- Real waiting: \`setTimeout\`/\`sleep\`/fixed delays instead of fake timers or
  awaiting the actual condition (\`findBy*\`, \`waitFor\`).
- Wall-clock and randomness: \`Date.now()\`, \`new Date()\`, \`Math.random()\`,
  \`crypto.randomUUID()\` used in an assertion without a fixed seed / fake clock.
- Real I/O: HTTP calls, real DB without isolation, filesystem paths that differ on
  Windows (\`'/'\` vs \`'\\\\'\`).
- Shared mutable state: a module-level fixture mutated by one test and read by
  another (order-dependent; shows up with \`--sequence.shuffle\`).
- Snapshot of non-deterministic output (timestamps, ids).`,
  },

  // ---- API Contract ----------------------------------------------------------
  // deprecation-policy is NOT seeded: it ships as an import sample
  // (docs/skill-samples/deprecation-policy) to exercise the import path.
  {
    name: 'breaking-change',
    type: 'rubric',
    description:
      'Use on every PR that touches HTTP routes, handlers or route params. Flag changes or removals of a public contract that break existing clients: removed/renamed routes, changed method or path params, newly required inputs, changed status codes.',
    body: `Compare the old and the new side of every route in the diff. A public contract is
anything a deployed client already calls: path, method, params, query, body, status codes.

CRITICAL — an existing call stops working:
- A route is removed, or its path / HTTP method / path param changes.
- A request field or query param becomes required, is renamed, or changes type/format.
- A status code changes for an existing outcome (200 → 201, 404 → 422).
WARNING — same shape, different behaviour (pagination, default sort, filter semantics).
Not a finding: a new route, a new OPTIONAL input, an internal refactor with the same contract.

Bad — rename in place, every old client now gets 404:
\`\`\`ts
- app.get('/users/:id/orders', handler)
+ app.get('/customers/:customerId/orders', handler)
\`\`\`
Good — add the new route, keep the old one as a deprecated alias:
\`\`\`ts
app.get('/customers/:customerId/orders', handler)
app.get('/users/:id/orders', deprecated('/customers/:customerId/orders', handler))
\`\`\`
In each finding name the old contract, the new contract and the client call that breaks.`,
  },
  {
    name: 'response-schema',
    type: 'rubric',
    description:
      'Use when a PR changes what an endpoint returns: DTO mappers, response types, Zod/OpenAPI response schemas, serializers. Flag removed or renamed fields, changed field types, required ↔ optional/nullable switches and removed enum values.',
    body: `Clients parse responses by field name and type. For every response shape in the diff:

CRITICAL:
- A field is removed or renamed (\`user_name\` → \`username\`), including nested fields.
- A field changes type (number → string, object → array, ISO string → epoch number).
- A field that was always present becomes optional or nullable.
- An enum value clients may receive is removed or renamed.
WARNING:
- A new enum value is returned (exhaustive client switches break).
- \`.optional()\` (may be absent) switched to \`.nullable()\` (present, may be null) or back.
- Casing drift: API JSON is snake_case — a camelCase key in a response is a bug.
Not a finding: a new optional field.

Bad — field renamed, the client reads \`undefined\`:
\`\`\`ts
- return { id, user_name: u.name, total_cents: o.total };
+ return { id, username: u.name, total: o.total / 100 };
\`\`\`
Good — additive; the old fields stay until a major version removes them:
\`\`\`ts
return { id, user_name: u.name, username: u.name, total_cents: o.total };
\`\`\`
Quote the old and new field (name + type) in the finding.`,
  },
  {
    name: 'semver-discipline',
    type: 'convention',
    description:
      'Use when a PR changes a public API, a published package or its version number. Decide which semver bump the change requires and flag a breaking change shipped as a minor/patch, or a version bump that does not match the change.',
    body: `Classify the change, then check the declared version (package.json, OpenAPI \`info.version\`,
route prefix \`/v1\`, CHANGELOG):
- MAJOR — any breaking change (see breaking-change / response-schema): removal, rename,
  type change, new required input, changed status code or default behaviour.
- MINOR — backwards-compatible additions: new route, new optional field or param.
- PATCH — fixes that keep the contract identical.

CRITICAL: a breaking change ships with a minor/patch bump, or under the same \`/v1\` prefix.
WARNING: the version is not bumped at all for a contract change, or the CHANGELOG
entry does not mention the breaking change.
SUGGESTION: a major bump for a purely additive change (forces needless client upgrades).

Bad — breaking change released as a minor:
\`\`\`diff
- "version": "2.3.1"
+ "version": "2.4.0"    // removes GET /orders/:id/items
\`\`\`
Good — major bump and a CHANGELOG "BREAKING" entry:
\`\`\`diff
- "version": "2.3.1"
+ "version": "3.0.0"    // BREAKING: GET /orders/:id/items removed, use /orders/:id?expand=items
\`\`\``,
  },

  // ---- Existing agents --------------------------------------------------------
  {
    name: 'secret-leakage-gate',
    type: 'security',
    description:
      'Use on every PR. Flag credentials committed or exposed: API keys, tokens, service-role keys, NEXT_PUBLIC_ secrets, secrets in logs, URLs or error messages.',
    body: `CRITICAL when the diff adds a live-looking secret or exposes one:
- Literal keys: \`sk_live_\`, \`sk-\`, \`ghp_\`, \`xox[bp]-\`, \`AKIA\`, private key PEM blocks,
  Supabase \`service_role\` JWTs, database URLs with passwords.
- Client exposure: secrets in \`NEXT_PUBLIC_*\` env vars or bundled client code.
- Leaks at runtime: secrets written to logs, error messages, query strings,
  traces or analytics events.
Not a finding: obvious placeholders (\`xxx\`, \`<your-key>\`), test fixtures clearly fake
AND not matching a live prefix. Never echo the secret value in the finding.`,
  },
  {
    name: 'no-then-chains',
    type: 'convention',
    description:
      'Use on TypeScript changes. Flag new promise .then()/.catch() chains in async code — this codebase uses async/await with try/catch.',
    body: `Convention: async code uses \`async\`/\`await\` with \`try/catch\`.
- SUGGESTION for a new \`.then(...)\` / \`.catch(...)\` chain inside an \`async\`
  function or where \`await\` is available.
- WARNING when the chain drops a rejection (no \`.catch\` and not returned/awaited),
  which becomes an unhandled rejection.
Allowed: \`Promise.all/allSettled\`, a deliberate fire-and-forget with an explicit
\`.catch(() => …)\` and a comment explaining why it is not awaited.`,
  },
];

/** Agent name → ordered skill names (order = order of blocks in the prompt). */
export const SEED_AGENT_SKILLS: Record<string, string[]> = {
  'Test Quality Reviewer': ['untested-branches', 'boundary-cases', 'over-mocking', 'flaky-test-patterns'],
  'API Contract Reviewer': ['breaking-change', 'response-schema', 'semver-discipline'],
  'Security Reviewer': ['secret-leakage-gate'],
  'General Reviewer': ['no-then-chains'],
};

/**
 * Seed skills that were REPLACED by newer ones. Re-seeding removes them, but only
 * while they are still the untouched seed (source manual, version 1) — a skill the
 * user edited is theirs and is kept.
 */
export const RETIRED_SEED_SKILLS: string[] = ['route-breaking-changes', 'zod-contract-drift'];
