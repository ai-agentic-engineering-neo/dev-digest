/**
 * Built-in skill bodies used by the seed.
 *
 * A skill is a reusable prompt block: named markdown that `assemblePrompt`
 * renders under `## Skills / rules`, shared by any number of agents. It is
 * TEXT ONLY — nothing here is executed, fetched, or interpreted as a tool.
 *
 * Split of responsibility with `seed-prompts.ts`: the agent prompt says WHAT
 * the reviewer is and how to report; a skill says WHICH specific checks to run.
 * That is why the same reviewer behaves very differently with its skills on and
 * off — the difference is exactly the text below.
 */

export const TEST_COVERAGE_RUBRIC_SKILL = `# Rubric: branch coverage of the code under test

For every function the diff adds a test for, enumerate its branches BEFORE judging
the test, then check each one off against the test file:

1. List the branches: every \`if\` / \`else\`, \`try\`/\`catch\`, ternary, \`switch\` arm,
   early return, guard clause, and every \`await\` that can reject.
2. Mark each branch as covered or not covered by the tests in this diff.
3. Report every UNCOVERED branch that changes observable behaviour — a thrown
   error, a different status code, a different return shape, a skipped write.

A test suite that exercises only the success path of a function with error
handling is incomplete: say which branch is untested and which input reaches it.

Also enumerate the boundary values of every input the test feeds:
- empty collection, single element, and the "many" case;
- zero, negative, and the limit/offset edge for anything numeric;
- null / undefined / missing optional field;
- the longest or largest input the code claims to accept.

Report a missing boundary case as a WARNING when the code has a distinct branch
for it, and as a SUGGESTION when it is defensive only. Cite the untested line
range in the SOURCE file when the diff contains it, otherwise the test file.`;

export const TEST_SMELLS_SKILL = `# Test smells: mocking, coupling, and flakiness

## Over-mocking
Flag a test that mocks so much that it no longer tests the code under test:
- the mock re-implements the logic being asserted (the assertion passes because
  of the mock's return value, not the code);
- a pure function is mocked instead of called;
- every collaborator is mocked, so the test would still pass if the function body
  were deleted and replaced with the mocked calls;
- the assertion only checks that a mock was called, with no assertion on the
  result or state the caller actually depends on.

## Flakiness
Flag a test that can fail without the code changing:
- real timers, \`sleep\`, or a fixed timeout used to wait for async work;
- dependence on wall-clock time, timezone, locale, or "now" without a frozen clock;
- dependence on iteration order of an object, map, or an unordered DB query;
- randomness, generated ids, or network/filesystem access not stubbed;
- shared mutable state between tests, or an assertion on a global mutated by a
  previous test (order dependence).

## Assertions that do not assert
Flag \`expect(x).toBeDefined()\` / \`toBeTruthy()\` where the meaningful value is
available, a test with no assertion at all, a snapshot standing in for a specific
expectation, and a try/catch that swallows the failure it was meant to prove.

Severity: a flaky test is a WARNING (it will page someone); an over-mocked test
that cannot fail is a WARNING; a weak assertion is a SUGGESTION unless it is the
only assertion in the test.`;

export const API_BREAKING_CHANGES_SKILL = `# Breaking changes to an HTTP contract

Compare the route's contract BEFORE and AFTER the diff. Report any change in this
list as a breaking change, and name the caller that breaks:

## Request side
- a new REQUIRED field, param, or header (previously absent or optional);
- an existing optional field made required;
- a removed or renamed param, path segment, or query key;
- a narrowed accepted type or enum (fewer values accepted than before);
- a tightened validation rule that rejects input the old route accepted
  (min/max length, regex, range, stricter schema).

## Response side
- a removed or renamed field;
- a field whose type changed (string→number, scalar→object, array→scalar);
- a field that could be null and now is not, or vice versa;
- a changed status code for the same outcome (200→204, 200→201, 404→400);
- a changed error shape or error code;
- a changed default sort, pagination shape, or page size.

## Route identity
- a changed method or path;
- a route deleted or moved;
- authentication or authorization newly required.

Changing the SIGNATURE of a handler is not by itself the finding — trace it to
the wire contract and say what an existing client sends or expects that now
fails. A breaking change to a public route is CRITICAL; to an internal route with
all callers updated in the same diff, a SUGGESTION at most. Say which one it is
and why. If the diff changes a shared request/response schema, every route using
that schema is affected — list them.`;

export const API_VERSIONING_SKILL = `# Versioning and deprecation of a changed route

When the diff makes a breaking change, check whether it is shipped safely, and
report the missing part:

- Is the change additive instead? A new optional field, a new endpoint, or a new
  enum value alongside the old one is almost always available and is the fix to
  suggest first.
- Is there a version marker (path prefix, header, or media type) so the old
  behaviour remains reachable?
- Is the old field/route kept and marked deprecated, with the replacement named
  in the response or the docs?
- Is there a migration window — a period where both shapes are accepted — rather
  than a flag day?
- Do the API docs, the OpenAPI/JSON schema, or the client types in this repo
  still describe the OLD contract after the diff? A contract change that does not
  update its schema is itself a defect.

Also check the rollout order: a server change that requires every client to
deploy first, or a client change that assumes a server not yet deployed, is a
finding even when both sides exist in the repo.

Suggest the smallest safe path (usually: add the new shape, deprecate the old,
remove it in a later release) instead of asking the author to revert.`;
