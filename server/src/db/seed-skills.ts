/**
 * Built-in skills seeded for M2 (mirrored in docs/skills-examples/). Each is a
 * text-only rule block appended to a linked agent's SYSTEM prompt as
 * `### Skill: <name>`. Descriptions are written as directives — the
 * description is the skill's interface ("when to apply, what to do").
 *
 * `flaky-test-smells` is deliberately NOT here: it ships as an archive in
 * docs/skills-examples/ to exercise the import path end-to-end.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const UNTESTED_BRANCHES: SeedSkill = {
  name: 'untested-branches',
  description:
    'For every new or changed conditional branch in non-test code, flag it when no test in the diff drives execution into that branch.',
  type: 'rubric',
  body: `## When to apply
Any PR that adds or changes production code together with (or without) tests.

## What to do
1. List every branch the diff adds or changes in NON-test files: each \`if\` / \`else\`,
   early \`return\` / \`throw\`, \`switch\` case, ternary, \`??\` / \`||\` fallback, and
   \`catch\` block.
2. For each branch, look for a test in the diff whose inputs actually reach it
   (not just a test that calls the function).
3. Report one finding per uncovered branch that can change observable behaviour
   (thrown error, different return value, side effect such as a DB write).
   - category: \`test\`, severity: WARNING (CRITICAL if the branch guards money,
     auth, or data deletion).
   - Anchor the finding on the branch line in the production file.
   - In \`suggestion\`, name the concrete test case to add (inputs + expected result).
4. A PR whose only test is the happy path almost always has uncovered branches —
   do not approve it without checking every branch.

## Do not flag
- Pure logging / metrics branches.
- Branches already covered by an existing test that the diff does not touch,
  when the test file name makes that evident.`,
};

export const EDGE_CASE_CHECKLIST: SeedSkill = {
  name: 'edge-case-checklist',
  description:
    'For each changed function, enumerate boundary inputs (zero, negative, equal-to-limit, empty, missing, concurrent) and flag the ones the tests in the diff never exercise.',
  type: 'rubric',
  body: `## When to apply
A function in the diff takes numeric amounts, limits, collections, optional values
or ids — and the PR adds or changes tests for it.

## Checklist per changed function
- **Numbers:** 0, negative, exactly at the limit (\`==\`), one past the limit.
- **Collections / strings:** empty, single element, very large.
- **Optional / lookup results:** missing record, \`null\` / \`undefined\` field.
- **State:** the "other" status values (e.g. disputed, cancelled, already refunded),
  partial prior operations (e.g. a second partial refund).
- **Concurrency:** two calls racing on the same record, when the code reads then writes.

## What to do
- For EVERY comparison against a limit in the changed code (\`>\`, \`>=\`, \`<\`, \`<=\`),
  check for a test at EXACTLY the limit (e.g. amount equal to the refundable
  balance). If none exists, report it as its own finding titled
  "Missing boundary test: <expression>" — never fold it into a branch finding.
- Also report the other boundary cases above that the code handles (or forgets to
  handle) but no test exercises. Off-by-one between \`>\` and \`>=\` is the most
  common real bug.
- category: \`test\`, severity: WARNING; SUGGESTION for low-impact cases.
- Put the missing test case (input → expected outcome) in \`suggestion\`.`,
};

export const OVER_MOCKING_GATE: SeedSkill = {
  name: 'over-mocking-gate',
  description:
    'Flag tests that mock the unit under test, assert only that mocks were called, or mock so much that the test cannot fail for a real bug.',
  type: 'rubric',
  body: `## When to apply
Test files in the diff that use \`vi.fn\`, \`vi.mock\`, \`jest.mock\`, sinon stubs or
hand-written fakes.

## Flag
- The module under test (or one of its own helpers) is mocked.
- The only assertions are \`toHaveBeenCalled*\` on mocks, with no assertion on the
  returned value, thrown error, or persisted state.
- A mock returns exactly what the assertion expects (the test restates the mock).
- Mocks shaped differently from the real dependency (\`as never\` / \`as any\` casts
  hiding missing methods), so a contract change would not break the test.

## Severity
WARNING when the test gives false confidence about money/auth/data paths,
otherwise SUGGESTION. category: \`test\`. Suggest the boundary to fake instead
(e.g. the repository, not the service).`,
};

export const API_CONTRACT_BREAKING_CHANGE: SeedSkill = {
  name: 'api-contract-breaking-change',
  description:
    'Flag any change to a public route path, path/query params, request body or response shape that breaks existing clients without a new version or a compatibility shim.',
  type: 'convention',
  body: `## When to apply
The diff touches an HTTP route definition, its zod/JSON schema, a DTO, or the
object a handler returns.

## Breaking changes (report each one)
- A response field renamed, removed, or its type/unit changed
  (e.g. \`amount\` in units → \`amount_cents\` in cents).
- A request body field renamed, removed, or made required.
- A route path, method, or path segment changed, or a route removed.
- An error status code changed for an existing failure mode.
Renaming a path *parameter* alone (\`:id\` → \`:paymentId\`) is NOT breaking — the URL
shape is unchanged; do not flag it.

## What to do
- severity: CRITICAL for a removed/renamed field or route that existing clients
  read; WARNING for additive-but-risky changes (new required field with a default).
- category: \`bug\`. Anchor on the changed line in the handler or schema.
- In \`suggestion\`, propose the compatible path: keep the old field alongside the
  new one, version the route (\`/v2/...\`), or add a deprecation period.
- A PR description calling the change a "cleanup" or "rename" does not make it
  non-breaking.`,
};

/** Skills linked per built-in agent (in prompt order). */
export const SEED_SKILLS: SeedSkill[] = [
  UNTESTED_BRANCHES,
  EDGE_CASE_CHECKLIST,
  OVER_MOCKING_GATE,
  API_CONTRACT_BREAKING_CHANGE,
];

export const SEED_AGENT_SKILLS: Record<string, string[]> = {
  'Test Quality Reviewer': [
    UNTESTED_BRANCHES.name,
    EDGE_CASE_CHECKLIST.name,
    OVER_MOCKING_GATE.name,
  ],
  'General Reviewer': [API_CONTRACT_BREAKING_CHANGE.name],
};
