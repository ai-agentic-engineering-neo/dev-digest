/**
 * Skills seeded for the two skill-driven reviewers (Test Quality, API Contract).
 *
 * `description` is the skill's INTERFACE: a directive that says when to apply it.
 * `body` is the rubric itself. Bodies are markdown; they are inserted into an
 * agent prompt under "## Skills / rules" in link order, so keep them tight.
 * A skill with the same name already in the workspace is left untouched, so a
 * re-seed never overwrites edits made in the UI.
 */
import type { SkillType } from '@devdigest/shared';

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const TEST_BRANCH_COVERAGE: SeedSkill = {
  name: 'test-branch-coverage',
  type: 'rubric',
  description:
    'Use when a diff adds or changes logic together with tests. Check that every new branch and boundary has a test that would fail if it broke.',
  body: `## Uncovered branches and missing corner cases

For every function the diff adds or changes:

1. List its branches: \`if\`/\`else\`, early \`return\`, ternary and \`?:\`, \`??\`/\`||\` fallbacks, \`switch\` cases and \`default\`, \`catch\` blocks, optional chaining that can short-circuit, loops that can run zero times.
2. For each branch find a test that reaches it AND asserts its outcome. A test that only executes the line without asserting the result does not count.
3. Check the boundaries of every input the code compares or slices: 0, 1, N, N+1, empty string / array / object, \`null\` and \`undefined\`, max length, negative numbers, duplicates, unicode, time-zone or DST edges.
4. Check the failure paths: a rejected promise, a thrown error, a non-2xx response, a missing row.

Report **WARNING** when the tests cover only the happy path of new logic, naming the exact branch or input that has no test. Report **CRITICAL** only when the uncovered branch guards data loss, authorization, money or a contract callers depend on. New logic with no test at all is a **WARNING**.

Do not report a branch as uncovered without checking the test files in the diff and the existing tests it extends.`,
};

export const TEST_MOCKING_DISCIPLINE: SeedSkill = {
  name: 'test-mocking-discipline',
  type: 'convention',
  description:
    'Use when a diff adds or edits tests that use mocks, spies or stubs. Flag tests that assert on mocks instead of behaviour.',
  body: `## Over-mocking

Mock only at the process boundary: network, clock, filesystem, database driver, an LLM provider. Flag as over-mocking:

- Mocking the module under test, or a pure helper next to it, so the assertion checks the mock.
- Assertions that only check \`toHaveBeenCalled\` / call counts / call order of internal collaborators, with no assertion on a returned value or persisted state.
- A test that would still pass if the function body were deleted or returned a constant.
- Mocks that re-implement the real logic, so the test and the code share the same bug.
- Snapshots of implementation detail (whole mock call lists, private state).

Severity: **WARNING** for over-mocking that weakens a test of new logic; **SUGGESTION** for a stylistic mock. Never CRITICAL on its own.`,
};

export const API_BREAKING_CHANGES: SeedSkill = {
  name: 'api-breaking-changes',
  type: 'rubric',
  description:
    'Use when a diff changes a route, a request or response schema, a status code or a shared contract. Detect breaking changes for existing callers.',
  body: `## Breaking vs compatible

Compare the old and the new wire shape of every changed route or contract.

**Breaking (CRITICAL unless the diff also ships a compatibility path):**
- A route removed, renamed, or its method or path changed.
- A response field removed, renamed, or its type changed; a field that could not be \`null\` now can (or the reverse for request fields).
- A request field that was optional is now required, or a new required field appears without a default.
- An enum value removed or renamed; a new enum value returned to callers that switch exhaustively.
- A status code or error envelope shape changed (\`{ error: { code, message, details } }\`).
- Pagination, ordering or default-filter behaviour changed.
- Authentication or authorization requirements tightened.

**Compatible (do not report):** a new optional request field, a new response field, a new route, a looser validation.

For every breaking change name the concrete caller that breaks (search the diff and the repo for consumers of that route or contract) and the fix: keep the old shape, add the new one alongside, or version the route. A signature change with no updated consumer is CRITICAL.`,
};

export const CONTRACT_SYNC_DISCIPLINE: SeedSkill = {
  name: 'contract-sync-discipline',
  type: 'convention',
  description:
    'Use when a diff touches @devdigest/shared or a route schema. Check that contract, server, and client stay in sync.',
  body: `## Contract discipline in this repository

- Contracts change in \`@devdigest/shared\` FIRST, then in consumers. The same zod schema validates the request and serializes the response.
- Wire fields are \`snake_case\` and mirror the DB columns; never camelCase on the wire.
- The web client keeps its own copy of the shared contracts: a change to one copy without the other is a finding.
- A route that returns data should declare \`schema.response\`, so extra fields cannot leak.
- A schema or contract change that needs a DB column needs a migration in the same PR.

Severity: contract changed on one side only and a consumer in the diff breaks = **CRITICAL**; missing \`schema.response\` on a new route = **SUGGESTION**.`,
};

/** Skills linked to each seeded agent, in prompt order. */
export const TEST_QUALITY_SKILLS: SeedSkill[] = [TEST_BRANCH_COVERAGE, TEST_MOCKING_DISCIPLINE];
export const API_CONTRACT_SKILLS: SeedSkill[] = [API_BREAKING_CHANGES, CONTRACT_SYNC_DISCIPLINE];
