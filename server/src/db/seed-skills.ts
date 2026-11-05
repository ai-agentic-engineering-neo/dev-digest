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
  {
    name: 'route-breaking-changes',
    type: 'rubric',
    description:
      'Use on every PR that touches routes, handlers, Zod contracts or DTOs. Flag breaking changes to the HTTP contract: removed/renamed routes or fields, changed methods, types, status codes, or newly required inputs.',
    body: `Compare the old and new side of every route and contract in the diff.
CRITICAL — existing clients break:
- A route is removed or its path / HTTP method / path params change.
- A request field becomes required, is renamed, or changes type / format
  (e.g. number → string, uuid validation added to a previously free string).
- A response field is removed, renamed, changes type, or becomes nullable.
- An enum loses a value, or a status code changes for an existing outcome
  (200 → 201, 404 → 422).
WARNING — risky but compatible:
- A new response enum value clients may not handle; a default value changes.
- Behaviour change with the same shape (pagination, sorting, filtering semantics).
For each finding name the old shape, the new shape, and which client call breaks.
Compatible additions (new optional field, new route) are not findings.`,
  },
  {
    name: 'zod-contract-drift',
    type: 'convention',
    description:
      'Use when a PR edits Zod schemas, DTO mappers or API JSON. Flag drift between server contract, DTO mapper and client copy, and casing mistakes (API JSON is snake_case).',
    body: `DevDigest contract rules:
- API JSON is snake_case (\`run_id\`, \`cost_usd\`); TS/Drizzle is camelCase. The
  conversion happens in DTO mappers — a camelCase key in a response is a bug.
- Zod contracts exist in two copies (server and client vendor/shared). A changed
  schema on one side only means the client parses a different shape → WARNING,
  CRITICAL when a required field is affected.
- A route must validate its body/params with a Zod schema; a handler that reads
  \`req.body\` fields not declared in the schema is accepting unvalidated input.
- \`.optional()\` (may be absent) vs \`.nullable()\` (present, may be null) are not
  interchangeable for clients — flag a switch between them.`,
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
  'API Contract Reviewer': ['route-breaking-changes', 'zod-contract-drift'],
  'Security Reviewer': ['secret-leakage-gate'],
  'General Reviewer': ['no-then-chains'],
};
