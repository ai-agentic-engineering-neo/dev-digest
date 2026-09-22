/**
 * Built-in skills used by the seed (server/specs/03-skills.md § Seed).
 *
 * A skill is text only: its `description` is the directive that says WHEN it
 * applies ("Flag … when …"), its `body` the rule itself. Both reach the model
 * as a `### <name>` block under `## Skills / rules` (see
 * docs/agent-prompts/README.md). The DB is the source of truth at run time;
 * editing a body here only affects freshly seeded workspaces.
 */
import type { SkillType } from '@devdigest/shared';

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

export const SEED_SKILLS: readonly SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    type: 'rubric',
    enabled: true,
    description:
      'Flag changes that leave the PR hard to review or unsafe to revert: mixed concerns, dead code, unexplained magic values, or behaviour changes without a test.',
    body: `Judge the change as a unit a teammate must review, merge and possibly revert.

- **Mixed concerns** — a behaviour change bundled with a large unrelated refactor or
  reformat in the same file, so the real change is hard to see. SUGGESTION.
- **Dead code** — added functions, branches, flags or exports that nothing calls,
  or commented-out code left behind. SUGGESTION.
- **Magic values** — a new literal (timeout, limit, status string, percentage) with
  no name or comment explaining where it comes from. SUGGESTION.
- **Untested behaviour change** — a changed conditional, calculation or response
  shape on a production path with no test added or updated in the diff. WARNING.
- **Irreversible step without a guard** — a destructive migration, data backfill or
  delete with no way back (no down path, no backup note). WARNING.

Do not report formatting or naming taste. One finding per concrete location.`,
  },
  {
    name: 'no-then-chains',
    type: 'convention',
    enabled: true,
    description:
      'Flag new `.then()` / `.catch()` promise chains in async TypeScript code where `await` with try/catch is the house style.',
    body: `House convention: asynchronous code uses \`async\`/\`await\`; promise chains are not
added to new or changed code.

- Flag \`.then(...)\` / \`.catch(...)\` chains added inside an \`async\` function, or in a
  function that could simply be \`async\`. Suggest the \`await\` form. SUGGESTION.
- Flag a chain that loses errors: a \`.then\` without \`.catch\` whose promise is not
  returned or awaited (the rejection is unhandled). WARNING — this is a bug, not style.
- Flag mixing both styles on one promise (\`await p.then(...)\`). SUGGESTION.

Allowed, do not flag:
- \`Promise.all\` / \`Promise.allSettled\` / \`Promise.race\` combinators.
- A deliberate fire-and-forget written as \`void task().catch(log)\`.
- Code in files the diff does not touch.`,
  },
  {
    name: 'secret-leakage-gate',
    type: 'security',
    enabled: true,
    description:
      'Flag credentials, tokens or private keys committed in the diff, and code that logs, returns or sends secrets to places they must not reach.',
    body: `A secret that lands in git history is compromised even if a later commit removes it.

CRITICAL:
- A literal credential in the diff: API keys (\`sk_live_\`, \`sk-\`, \`ghp_\`, \`xoxb-\`, \`AKIA\`),
  passwords, bearer tokens, private keys (\`-----BEGIN … PRIVATE KEY-----\`),
  connection strings with an embedded password.
- A secret written to logs, error messages, HTTP responses, analytics events or
  URLs (query strings end up in access logs).

WARNING:
- A secret read from config and passed to a client bundle (e.g. a \`NEXT_PUBLIC_\`
  variable or a value serialized into page props).
- A \`.env\` file or key file added to the repository instead of \`.env.example\`.

Do not flag obvious placeholders (\`xxx\`, \`<your-key>\`, \`changeme\`) in docs or examples,
or test fixtures whose value is clearly fake. In the suggestion, say to rotate the
key — deleting it from the file is not enough.`,
  },
  {
    name: 'lethal-trifecta',
    type: 'security',
    enabled: true,
    description:
      'Flag an AI-agent or LLM flow in the diff that combines private data access, untrusted input and an exfiltration path in one reachable chain.',
    body: `The lethal trifecta is one flow where an LLM or agent (1) reads private data,
(2) is exposed to untrusted content that can carry instructions, and (3) can send
data out (HTTP request, email, webhook, rendered link or image URL, tool call).
With all three, a prompt injection in (2) can exfiltrate (1) through (3).

- Report only when you can point at all THREE components in code reachable in one
  flow; then set \`kind\` to "lethal_trifecta" with \`trifecta_components\` and
  \`evidence\` (file + line for each). CRITICAL.
- Two of the three is not a trifecta — at most a WARNING describing which leg is
  missing and why it matters.
- A plain \`request → DB read → JSON response\` endpoint with no LLM in the loop is
  ordinary access control, never a trifecta.

Mitigations to suggest: drop one leg (no outbound tools while untrusted content is
in context), allow-list outbound destinations, require human confirmation.`,
  },
  {
    name: 'phantom-api-gate',
    type: 'security',
    enabled: false,
    description:
      'Flag calls to library functions, methods, options or endpoints that do not exist in the dependency version the project uses (hallucinated APIs).',
    body: `AI-assisted code often calls APIs that look plausible but do not exist.

- Flag a call to a function, method, option or config key that the imported
  package does not export in the version pinned by the project, when you are
  confident it does not exist. Set \`kind\` to "phantom". WARNING; CRITICAL when the
  code path would throw at runtime on every call.
- Flag HTTP calls to endpoints of a known public API that do not exist.
- Include the closest real API in the suggestion.

Do not flag an API only because you do not recognise it: internal modules,
recently added functions and project-local helpers are common. If unsure, say
nothing.`,
  },
  {
    name: 'n-plus-one-gate',
    type: 'rubric',
    enabled: true,
    description:
      'Flag a database query, HTTP call or LLM call executed once per item inside a loop, `.map` or per-row callback where one batched call would do.',
    body: `Find per-item I/O inside iteration over data that grows with usage.

- A query (Drizzle, SQL, ORM) inside \`for\`, \`forEach\`, \`.map\`, \`Promise.all(items.map(…))\`
  or a per-row callback, keyed by the loop item. Suggest one batched query
  (\`inArray\`, a join, a grouped select) and grouping in memory.
- The same for GitHub/HTTP/LLM calls per file, PR or row where a batch or list
  endpoint exists.

Severity:
- CRITICAL when the loop runs on a request/hot path over an unbounded or
  user-growing collection (PR files, rows of a table, repos).
- WARNING when the collection is bounded but can reach dozens of items.
- Do not flag loops over a small fixed set (e.g. the 3 severities) or one-off
  scripts and migrations.

In the rationale, name the collection and how large it can get.`,
  },
  {
    name: 'test-coverage-nudge',
    type: 'rubric',
    enabled: true,
    description:
      'Flag changed production logic whose new branches, error paths or edge cases have no test added or updated in the same diff.',
    body: `Map each changed production branch to a test in the diff.

- A new conditional, error path, early return or calculation with no test that
  would fail if it were removed or inverted. WARNING when the path affects money,
  auth, data writes or a public contract; otherwise SUGGESTION.
- A bug fix with no regression test that reproduces the original bug. WARNING.
- A changed public function signature or response shape whose existing tests were
  not updated (they now test the old behaviour or were deleted). WARNING.

Name the exact branch and the test case to add (input → expected result).
Do not ask for tests of trivial getters, type-only changes, logging or config
wiring. Category: \`test\`.`,
  },
  {
    name: 'mock-discipline',
    type: 'convention',
    enabled: true,
    description:
      'Flag tests that mock the unit under test, its pure collaborators or the very behaviour they claim to verify, so the test passes whatever the code does.',
    body: `Mock only at boundaries you do not own or cannot run fast: network, clock,
randomness, third-party SDKs, the filesystem. Everything else runs for real.

WARNING:
- The module under test is itself mocked (\`vi.mock\` of the file being tested), or
  the function under test is stubbed on its own object.
- A mock returns exactly the value the test then asserts (the assertion checks the
  mock, not the code).
- Pure helpers, mappers or domain functions are mocked instead of executed.
- Tests assert only that a mock was called (\`toHaveBeenCalled\`) while the
  observable result (return value, DB row, response) is never checked.

SUGGESTION:
- Deep mock chains (\`a.b.c.mockReturnValue\`) replicating an SDK's shape — prefer a
  small hand-written fake of the port.
- Mocks not reset between tests (\`restoreAllMocks\` / fresh fakes per test).

Category: \`test\`. Never CRITICAL.`,
  },
  {
    name: 'corner-case-hunter',
    type: 'rubric',
    enabled: true,
    description:
      'Flag changed logic that mishandles boundary inputs: empty collections, zero, negative or huge numbers, null/undefined, duplicates, unicode and time-zone edges.',
    body: `For every changed function, walk its inputs through the boundary list and
report the ones that produce a wrong result, a crash or an unbounded cost.

- **Empty** — \`[]\`, \`''\`, \`{}\`: division by length, \`arr[0]!\`, \`Math.max(...[])\` (\`-Infinity\`),
  reduce without an initial value.
- **Zero / negative / huge** — pagination \`limit=0\` or negative offset, a count that
  can overflow a DB \`integer\`, a timeout of 0 meaning "no timeout".
- **Null / undefined / missing keys** — optional fields read without a guard,
  \`||\` replacing a legitimate \`0\` / \`''\` / \`false\`.
- **Duplicates and ordering** — the same id twice in an input list, unstable sort
  assumptions, "first match" on non-unique data.
- **Text** — unicode / emoji length vs byte length, case-insensitive comparisons,
  trailing whitespace in identifiers.
- **Time** — DST and time-zone boundaries, end-of-month, inclusive vs exclusive ranges.

State the exact input that breaks the code in the rationale. WARNING when a
realistic input triggers it; SUGGESTION when it needs an unusual one.`,
  },
];

/**
 * Built-in agent → skill links, in prompt order. The seed writes them only for
 * an agent that has NO links yet, so re-seeding never overrides user choices.
 */
export const SEED_AGENT_SKILLS: Readonly<Record<string, readonly string[]>> = {
  'General Reviewer': ['pr-quality-rubric', 'no-then-chains'],
  'Security Reviewer': ['secret-leakage-gate', 'lethal-trifecta', 'phantom-api-gate'],
  'Performance Reviewer': ['n-plus-one-gate'],
  'Test Quality Reviewer': ['test-coverage-nudge', 'mock-discipline', 'corner-case-hunter'],
};
