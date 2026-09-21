/**
 * Built-in skill bodies used by the seed.
 *
 * These mirror the human-readable originals in `docs/agent-prompts/skills/*.md`
 * (see `docs/agent-prompts/README.md` for how a skill body is folded into the
 * `## Skills / rules` prompt section). Keep the two in sync when you edit a
 * skill. The DB row is the source of truth at run time; editing a body here
 * only affects freshly seeded workspaces.
 */

export const UNCOVERED_BRANCH_SKILL = `# Uncovered branch detection

Flag conditional branches, error paths, and early returns introduced or
touched by this diff that have no corresponding test exercising them.

## What to flag

- An \`if\`/\`else\`, \`switch\` case, ternary, or \`catch\` block added or modified
  in the diff where the changed test files (if any) don't appear to exercise
  BOTH outcomes — e.g. only the happy path is asserted, never the branch
  where a guard fails or an error is thrown.
- A new early return / guard clause (\`if (!x) return\`) with no test that
  triggers it.
- A new \`catch\` block, \`.catch()\`, or error-handling branch with no test that
  causes the underlying call to actually fail.
- Newly added optional parameters or feature flags where only one branch
  (flag on, or flag off) is covered.
- Loops with a zero-iteration case (empty array/collection) that isn't
  tested separately from the "at least one item" case.

## How to judge "uncovered"

You only see the diff, not full coverage data — reason from what's visible:
- If the diff touches both \`src/foo.ts\` and \`src/foo.test.ts\`, check whether
  the new test cases actually reach every new branch, not just the function
  as a whole.
- If a source file changed with NO corresponding test file touched in the
  same diff, and the change adds a new conditional, that is a strong signal
  — call it out explicitly rather than assuming coverage exists elsewhere.
- Don't flag branches that existed before this diff and are merely
  reformatted/moved.

## Example

\`\`\`ts
// diff adds:
function parseLimit(raw?: string): number {
  if (raw === undefined) return DEFAULT_LIMIT;       // branch A
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError('limit must be a positive integer');  // branch B
  }
  return n;                                           // branch C
}
\`\`\`

If the accompanying test only calls \`parseLimit('10')\`, branches A (no
\`raw\`) and B (invalid \`raw\`) are uncovered — flag both, citing the exact
lines, and suggest the two missing test cases (\`parseLimit(undefined)\`,
\`parseLimit('abc')\` / \`parseLimit('-1')\`).

## Severity guidance

- WARNING for a genuinely risky uncovered branch (error handling, a guard
  that prevents bad data from being persisted, an auth/authz check).
- SUGGESTION for a low-risk branch (e.g. a cosmetic default value) where a
  missed test is unlikely to hide a real bug.
- Do not flag pure logging/formatting branches with no behavioral effect.`;

export const MISSED_CORNER_CASES_SKILL = `# Missed corner cases

Flag test suites (new or modified in this diff) that only exercise the
"normal" input and skip the boundary/degenerate inputs that commonly hide
bugs.

## What to flag

- **Empty / null / undefined inputs**: an empty string, empty array, empty
  object, \`null\`, or \`undefined\` passed where the function accepts one, with
  no test for that case.
- **Boundary values**: \`0\`, \`-1\`, the exact upper/lower limit of a range,
  \`Number.MAX_SAFE_INTEGER\`, an off-by-one at a pagination/limit edge.
- **Duplicate / repeated input**: the same id appearing twice in a batch
  call, duplicate keys in an object built from user input.
- **Unicode / encoding edges**: multi-byte characters, emoji, very long
  strings, strings containing the delimiter/separator the code itself uses
  (e.g. a comma in CSV-like parsing).
- **Concurrent / out-of-order edges**: for anything async, the case where a
  second call arrives before the first resolves, or a cancelled/aborted
  request.
- **Type-adjacent falsy traps**: \`0\`, \`''\`, \`false\` treated as "missing" by
  a \`||\` check when \`??\` was needed, or an empty array (which is truthy)
  treated as "no items" without an explicit \`.length === 0\` check.

## How to judge

- Read the new/changed test file's \`describe\`/\`it\` blocks (or equivalent)
  and list which corner cases they actually assert vs. which corner cases
  the changed source code's logic implies exist.
- Prioritize corner cases that are NEW because of this diff (a newly added
  parameter, a newly added loop, a newly widened accepted type) — don't
  demand exhaustive coverage of pre-existing code the diff didn't touch.
- A corner case only matters if the source code's behavior at that input is
  not obviously identical to the happy path — if the function is already
  provably total and correct at the boundary (e.g. Postgres enforces the
  constraint), don't manufacture a finding for its own sake.

## Example

\`\`\`ts
// diff adds:
export function splitBatches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
\`\`\`

Tests should cover: \`items = []\` (expect \`[]\`, not \`[[]]\`), \`size\` larger
than \`items.length\` (one batch), \`size <= 0\` (infinite loop / no progress —
this is actually a bug, not just a missing test, if unguarded). If only the
"3 items, size 2 → two batches" case is tested, flag the empty-array and
\`size <= 0\` cases explicitly.

## Severity guidance

- WARNING when the missed corner case coincides with a plausible real bug
  (e.g. the \`size <= 0\` infinite loop above) — say so explicitly and treat
  it as a correctness finding, not just a coverage gap.
- SUGGESTION when the corner case is defensive completeness with low actual
  risk of hiding a bug.`;

export const MOCK_OVERUSE_SKILL = `# Mock overuse

Flag tests (new or modified in this diff) that mock away so much of the
system under test that the test can pass while the real code is broken.

## What to flag

- **Mocking the thing you're testing**: a unit test for \`formatInvoice()\`
  that mocks \`formatInvoice\`'s own internal helper instead of letting real
  logic run, so the assertion only checks that a mock was called with the
  right args — not that the output is correct.
- **Over-mocked collaborators**: mocking a pure function, a simple data
  transform, or an in-memory data structure that would be cheap and safe to
  run for real. Mocking should be reserved for genuine I/O boundaries
  (network, DB, filesystem, clock, randomness) — not everything a module
  imports.
- **Mock return values that don't match the real shape**: a mocked DB call
  or API response stubbed with a shape that the real driver/client would
  never actually return (missing required fields, wrong types) — the test
  proves nothing about the real integration.
- **Assertions on the mock instead of on behavior**: \`expect(mockFn).
  toHaveBeenCalled()\` as the ONLY assertion, with no check of the resulting
  state/output/return value. This can stay green even if the code path that
  used the mock's result is deleted.
- **Snapshot/mock churn as a smell**: a diff that "fixes" a failing test
  purely by adding/loosening a mock (e.g. \`mockResolvedValue(undefined)\` to
  silence a type error) rather than addressing why the real call would
  behave that way.
- **Mocking the module under test's own dependency graph so deeply that
  the test only verifies wiring, not logic** — e.g. mocking every Drizzle
  query in a repository test so no actual query-building logic ever runs.

## How to judge

- Ask: if I reverted the production code change but kept this test, would
  it still pass? If yes because the mock always returns a canned value
  regardless of the real implementation, that's a strong signal of
  overmocking.
- Distinguish legitimate mocking of external boundaries (this repo's own
  \`adapters/mocks.ts\` pattern — \`MockGitClient\`, \`MockGitHubClient\`, a
  stubbed \`LLMProvider\`) from mocking internal, pure, deterministic logic
  that should just run for real in a unit test.
- Prefer fakes/real implementations over mocks for anything in-memory and
  fast (e.g. use a real array/object instead of a mocked repository when
  the repository itself is what's under test).

## Severity guidance

- WARNING when the overmocking means the test would pass with a broken
  implementation (a false sense of coverage) — this is the core risk to
  call out.
- SUGGESTION for mocking that's merely more verbose/brittle than necessary
  (e.g. re-mocking something \`adapters/mocks.ts\` already provides) but
  doesn't actually hide a bug.`;

export const FLAKY_TESTS_SKILL = `# Flaky tests

Flag new or modified tests in this diff that are likely to pass or fail
non-deterministically, independent of whether the code under test is
correct.

## What to flag

- **Real timers / \`sleep\`-based waits**: \`setTimeout\`/\`await new Promise(r
  => setTimeout(r, N))\` used to "wait long enough" for something async to
  finish, instead of awaiting the actual promise/event/condition. Slow CI
  runners make these fail intermittently; fast ones can mask real races.
- **Wall-clock assumptions**: asserting on \`Date.now()\` / \`new Date()\`
  without freezing or injecting the clock — a test that compares two
  \`Date.now()\` calls with a tight tolerance, or that behaves differently
  around midnight/month/year boundaries or DST changes.
- **Unseeded randomness**: \`Math.random()\`, random UUIDs, or shuffled test
  data used to build fixtures without a fixed seed, where the assertion
  depends on a specific value or ordering.
- **Order-dependent assertions on unordered collections**: asserting exact
  array order from a DB query, \`Object.keys()\`, \`Map\`/\`Set\` iteration, or a
  concurrent \`Promise.all\` result where the underlying operation doesn't
  guarantee order (e.g. no \`ORDER BY\` in the query).
- **Shared mutable state across tests**: a module-level variable, a
  singleton, or a test DB row not cleaned up / reset in \`beforeEach\`, so
  test outcome depends on execution order or which tests ran before it.
- **Network/external calls not mocked**: a test that hits a real external
  service, or \`container.llm(...)\`/GitHub/git without going through this
  repo's \`adapters/mocks.ts\` — fails on rate limits, network blips, or
  when run offline.
- **Race conditions in the test itself**: firing multiple async operations
  and asserting on results without properly awaiting all of them (a missing
  \`await\`, or asserting inside a \`.then()\` that isn't returned/awaited by
  the test framework).

## How to judge

- A test is a flakiness risk if its pass/fail depends on timing, ordering,
  or an external system that this diff did not explicitly control for
  (fake timers, a seeded RNG, a mocked clock/adapter, or an explicit
  \`ORDER BY\`/sort before asserting).
- Distinguish from \`.it.test.ts\` integration tests in this repo, which
  legitimately use \`testcontainers\`/real Postgres — those are expected to
  be slower but should still avoid real sleeps and unseeded randomness.

## Example

\`\`\`ts
// Flaky: races the debounce timer against real wall-clock time.
it('debounces the save', async () => {
  triggerSave();
  triggerSave();
  await new Promise((r) => setTimeout(r, 300));
  expect(saveSpy).toHaveBeenCalledTimes(1);
});
\`\`\`

Prefer fake timers (\`vi.useFakeTimers()\` + \`vi.advanceTimersByTime(300)\`)
so the assertion is deterministic regardless of CI machine speed.

## Severity guidance

- WARNING for real-timer waits, unseeded randomness feeding an assertion,
  or unmocked external calls — these cause real, recurring CI flakiness.
- SUGGESTION for order-dependent assertions on collections where the
  underlying order happens to be stable today but isn't guaranteed.`;

export const BREAKING_API_CHANGES_SKILL = `# Breaking API/route signature changes

Flag changes to an HTTP route's contract, or an exported function's public
signature, that would break existing callers — the client app, another
service, or a stored/serialized value — without an explicit migration path.

## What to flag

- **Route path or method changed/removed**: a Fastify route's URL or HTTP
  verb changed (e.g. \`GET /agents/:id/skills\` renamed or moved) without the
  old route kept as an alias, or a route deleted while the client still
  calls it.
- **Request shape narrowed**: a body/query/param field that was optional
  becomes required, a field's accepted type narrows (e.g. \`string\` →
  \`enum\`), or a field is removed — any of these will 422 an existing caller
  sending the old shape.
- **Response shape changed**: a field renamed or removed from a route's
  response, a field's type changed (e.g. \`string\` → \`string | null\`, or a
  number that used to always be present becomes optional), or the overall
  response shape changed from an object to an array or vice versa.
- **Status code behavior changed**: an endpoint that used to return 200 now
  returns 201/204, or an error case that used to 404 now 400s (or vice
  versa) — callers that branch on status code will misbehave.
- **Zod contract changes in \`vendor/shared/contracts/*\`**: adding a
  \`.min()\`/\`.max()\`/regex constraint to an existing field, removing a
  \`.optional()\`/\`.nullish()\`, or changing an enum's members (removing a
  value breaks anyone persisting/sending it) — these are breaking even
  though they're "just validation."
- **Exported function signature changes** (in a package consumed by
  another, e.g. \`reviewer-core\` exports, or anything under
  \`vendor/shared/\`): a parameter added without a default, a parameter
  reordered, a return type narrowed, or a parameter type widened in a way
  that changes meaning (e.g. accepting \`string | string[]\` where only
  \`string\` was documented).
- **Silent contract drift**: the two hand-mirrored copies of
  \`vendor/shared/contracts/*\` (server and client) changed to different
  shapes, or only one copy updated — the wire contract itself doesn't
  match between the two sides even though each compiles.

## How to judge

- A change is breaking if an existing, unmodified caller (client code not
  touched by this diff, or an external API consumer) would send/receive
  data that no longer parses, or would misinterpret a change in meaning.
- Widening acceptance (making a required field optional, adding a new
  optional response field, accepting an additional enum value) is usually
  SAFE — don't flag purely additive, backward-compatible changes.
- Check whether the diff updates every caller in the SAME change (routes +
  the calling client code + both contract copies) — if it does consistently
  and atomically, this may be an intentional, fully-migrated break rather
  than a defect; note it but weigh severity down accordingly. It's still
  worth flagging if a caller was clearly missed.

## Severity guidance

- CRITICAL when a shipped, external caller (not touched in this same diff)
  would break — e.g. a GitHub CI runner posting to a route whose shape
  changed, or a public route response field removed with no deprecation.
- WARNING when the break is internal-only and the diff updates most but
  arguably not all callers, or when only one of the two hand-mirrored
  contract copies was updated.
- SUGGESTION for a technically-breaking but clearly intentional, fully
  migrated, low-blast-radius change (e.g. a brand-new route with no
  existing callers yet).`;
