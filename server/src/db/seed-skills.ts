/**
 * L02 — built-in skills seeded for the Test Quality Reviewer and the General
 * Reviewer. Readable originals (with frontmatter) live in docs/skills/*.md; keep
 * both in sync. The 4th Test Quality skill (flaky-tests) is NOT seeded on
 * purpose — it is imported through the UI from docs/skills/import-samples/.
 */
export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const UNCOVERED_BRANCHES_SKILL: SeedSkill = {
  name: 'uncovered-branches',
  description:
    'Use on every PR that changes production logic together with tests. Flag each new or changed branch (if/else, switch case, early return, catch, ternary, `??`/`||` fallback) that no test in the diff drives.',
  type: 'rubric',
  body: `# Uncovered branches

For every production function changed in the diff:

1. List its branches: each \`if\` / \`else if\` / \`else\`, each \`switch\` case and the
   \`default\`, each early \`return\` / \`throw\`, each \`catch\`, each ternary, each
   \`??\` / \`||\` / \`&&\` fallback that changes the result.
2. For each branch, find a test in the diff whose inputs actually reach it.
   Read the arrange/act part of the test — the test name does not count.
3. A branch with no test reaching it is a finding. Cite the production line of
   the branch, not the test file.

Report:
- WARNING — a changed or new branch that no test reaches.
- CRITICAL — the unreached branch handles money, auth, deletion or persisted
  state, AND the PR's tests only cover the happy path of that function.

Suggestion format: name the test to add — "add a test where \`<input>\` so that
\`<condition>\` is true and assert \`<expected result>\`".

Do not flag: logging-only branches, unreachable defensive \`default\` cases that
only throw "unreachable", or branches in files with no tests in the repo at all
(that is a missing test file, not an uncovered branch).
`,
};

export const CORNER_CASES_SKILL: SeedSkill = {
  name: 'corner-cases',
  description:
    'Use when a changed function takes numbers, strings, collections, dates or optional values. Flag boundary and corner inputs the tests never try - zero, negative, empty, null/undefined, exactly-at-threshold, max size, duplicates.',
  type: 'rubric',
  body: `# Missed corner cases

For each changed function that has tests in the diff, check the inputs the tests
use against this list and flag what is missing **when the code treats it
differently or could plausibly break on it**:

| Input kind | Corner cases to expect in tests |
|---|---|
| Numbers | \`0\`, negative, exactly at each threshold in the code (\`>=\` vs \`>\`), threshold ± 1, very large, \`NaN\` for parsed input |
| Strings | empty \`""\`, whitespace only, unicode / emoji, very long |
| Collections | empty, single element, duplicates, unsorted when code assumes order |
| Optional values | \`null\`, \`undefined\`, missing key |
| Dates / time | boundaries of day/month, time zones, DST, leap day |
| Money | rounding of fractions, currency minor units |

Threshold rule: when the code compares with a constant (\`amount >= 100\`), a test
must exist exactly AT the constant, otherwise an off-by-one (\`>\` vs \`>=\`)
survives. This is the most valuable corner case — report it first.

Report as WARNING; as CRITICAL only when the boundary decides money, access or
data deletion and no test is anywhere near it. Suggest the exact input value(s)
to add and the expected result.
`,
};

export const OVER_MOCKING_SKILL: SeedSkill = {
  name: 'over-mocking',
  description:
    'Use when tests in the diff use mocks, stubs, spies or fakes (vi.mock, jest.mock, sinon, mockResolvedValue). Flag tests that mock the code under test, assert only on mocks, or mock so much that a real bug cannot fail them.',
  type: 'convention',
  body: `# Over-mocking

A mock is fine at a process boundary (network, LLM, clock, filesystem, GitHub).
Flag a test when:

1. **It mocks the unit under test** (or a function in the same module that holds
   the logic being tested) — the test then verifies the mock, not the code.
2. **It asserts only interactions** (\`toHaveBeenCalledWith\`) and never the
   result or the resulting state, for code whose job is to compute a result.
3. **The mock returns exactly what the assertion expects** — the test passes
   whatever the production code does in between.
4. **The database or repository is mocked in a test of a query/repository** —
   SQL bugs cannot fail it; this repo uses testcontainers (\`*.it.test.ts\`) for that.
5. **Mocks are not reset** between tests (\`vi.restoreAllMocks\`, \`mockReset\`),
   so tests depend on order.

Severity: WARNING by default; CRITICAL when the over-mocked test is the only test
of a money / auth / data-deletion path. Suggest what to keep real and what to
assert on instead.
`,
};

export const API_CONTRACT_BREAKING_CHANGE_SKILL: SeedSkill = {
  name: 'api-contract-breaking-change',
  description:
    'Use when the diff touches an HTTP route, its zod schema, a shared contract (vendor/shared) or a client API call. Flag changes that break existing callers - renamed/removed fields, new required inputs, changed types, paths or status codes.',
  type: 'rubric',
  body: `# API contract — breaking changes

Treat every route signature as a public contract with callers you cannot see
(the web client, CI runners, scripts). For each changed route / schema / shared
contract, compare old vs new and flag:

**Request side (breaks existing callers):**
- A new **required** body field, query param or path param.
- A renamed or removed path, path param, query param or body field.
- A narrowed type (string → enum, optional → required, wider → narrower range).
- A changed HTTP method.

**Response side (breaks existing consumers):**
- A removed or renamed response field, or a field that became nullable/optional.
- A changed field type or shape (object → array, number → string).
- A changed success status code (200 ↔ 201/204) or error code/envelope.

**Two-copy rule (this repo):** contracts live twice —
\`server/src/vendor/shared\` and \`client/src/vendor/shared\`. A change applied to
only one copy is a breaking change between server and client: flag it.

Not breaking: a new optional field, a new endpoint, a widened input type, an
added enum value on the request side.

Severity: CRITICAL when an existing caller in the diff or the repo will fail at
runtime (or a two-copy mismatch); WARNING when callers are outside the repo.
Suggestion: keep the old shape (alias the old field, make the new input
optional with a default) or version the route; name the callers to update.
`,
};
