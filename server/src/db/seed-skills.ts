/**
 * Built-in skills used by the seed. Human-readable originals live in
 * `docs/skills/*.md`; keep the two in sync. `agents` lists the agent names the
 * skill is linked to (in the order given by the array position of the skill).
 */
import type { SkillType } from '../vendor/shared/index.js';

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  agents: string[];
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: "untested-branches",
    description:
      "Apply when a diff adds or changes production logic with conditionals; check that every new or changed branch (if/else, switch case, early return, catch, ternary, default argument) is exercised by a test.",
    type: 'rubric',
    agents: ['Test Quality Reviewer'],
    body: `# Untested branches

## Procedure
1. List the production (non-test) files in the diff. Ignore pure type, config and
   re-export changes.
2. In each changed hunk, enumerate every branch the change adds or modifies:
   - \`if\` / \`else if\` / \`else\` arms and guard clauses
   - \`switch\` cases, including \`default\`
   - early \`return\` / \`throw\` / \`continue\`
   - \`catch\` and \`finally\` blocks
   - ternaries, \`??\`, \`||\`, \`&&\` short-circuits that choose between behaviours
   - default argument values and optional-chaining fallbacks
3. For each branch, look for a test in the diff (or in visible context) that reaches
   it with an input that selects that branch and asserts the outcome.
4. Ask the deletion question: if this branch were removed or inverted, would any
   test fail? If not, the branch is unprotected.

## What counts as covered
- A test whose input forces the branch AND whose assertion depends on what the
  branch does.
- Not covered: a test that runs the function but only asserts the happy-path result;
  a test that reaches the branch but asserts nothing about its effect.

## How to report
- Put the finding on the production line of the branch (a line in the diff).
- Name the branch: "the \`catch\` that maps a GitHub 404 to \`NotFoundError\`".
- Name the missing test: the input that reaches it and the expected outcome, e.g.
  "add a test where the repo lookup returns null and expect a 404".
- One finding per distinct unprotected branch; group sibling branches of the same
  switch into one finding.

## Severity guidance
- WARNING: an untested branch in ordinary logic.
- CRITICAL: only when the branch guards auth, tenant scoping, data deletion,
  money or contract validation and nothing else in the diff would catch a
  regression.
- SUGGESTION: an unreachable-in-practice defensive branch.

## Do not flag
- Branches in test files, generated code or migrations.
- Pre-existing branches the diff does not touch.
- Trivial branches whose both arms are covered by type checking.`,
  },
  {
    name: "missing-corner-cases",
    description:
      "Apply when a diff changes logic that processes input, collections, numbers, strings, dates or concurrent work; check whether tests cover the plausible boundary and edge cases for that specific code.",
    type: 'rubric',
    agents: ['Test Quality Reviewer'],
    body: `# Missing corner cases

Use this catalogue to decide which edge cases are plausible for the changed code,
then check that a test covers each. Flag only cases that could really occur given
the inputs of THIS code. A catalogue entry that cannot happen here is not a finding.

## Catalogue
- **Empty**: empty array, empty string, empty object, no rows from the DB.
- **Absent**: \`null\`, \`undefined\`, missing optional field, optional chaining that
  silently returns \`undefined\`.
- **Numbers**: zero, negative, \`NaN\`, very large values, floating-point rounding.
- **Limits**: exactly at the limit, one below, one above (off-by-one in \`<\` vs \`<=\`,
  slice bounds, pagination first/last page, page size 0 or 1).
- **Size**: a single element, and many elements (truncation, batching).
- **Strings**: whitespace-only, very long, unicode (emoji, combining characters,
  RTL), case differences, characters that need escaping.
- **Duplicates**: repeated ids or names, idempotent re-run of the same operation.
- **Ordering**: unsorted input, ties, stable order expectations.
- **Time**: time zones, DST, midnight and month boundaries, clock skew, expiry
  exactly at "now".
- **Concurrency**: two simultaneous calls, retry after partial failure, race
  between check and write.
- **Error paths**: dependency throws, times out, returns a malformed or partial
  payload; permission denied; not found.

## Procedure
1. Read the changed production code and note its inputs and their types.
2. Pick the catalogue entries that apply to those inputs.
3. Check the tests in the diff for each picked entry.
4. Report the most valuable missing cases; skip the rest.

## How to report
- Cite the production line that handles the input.
- State the concrete input ("\`limit = 0\`", "an empty \`files\` array") and what
  would go wrong (division by zero, crash on \`[0]\`, silent wrong result).
- Describe the missing test: input and expected outcome.

## Severity guidance
- WARNING: a plausible boundary or error path with no test.
- CRITICAL: only when the unhandled edge leads to data loss, wrong money/permission
  results or a crash on realistic input and nothing in the diff would catch it.
- SUGGESTION: an unlikely edge or one cheap to add.

## Do not flag
- Edges the type system or zod validation already makes impossible.
- A long wishlist: pick at most the few that matter for this change.`,
  },
  {
    name: "over-mocking",
    description:
      "Apply when a diff adds or changes tests that use mocks, stubs, spies or snapshots; check that the test can fail for a real regression and asserts behaviour rather than mock calls.",
    type: 'convention',
    agents: ['Test Quality Reviewer'],
    body: `# Over-mocking

A test must be able to fail when the behaviour it protects breaks. Mocks are fine at
I/O boundaries; they are a defect when they replace the thing being tested.

## Acceptable to mock
- Network and process boundaries: LLM providers, GitHub, git, HTTP clients,
  email, queues. In this repo use \`server/src/adapters/mocks.ts\`.
- The clock and randomness, when controlled (fake timers, seeded values).
- A repository or port when unit-testing a service in isolation, as long as the
  assertion is about the service's result.

## Not acceptable
1. **Mocking the unit under test**: the test imports module X, then mocks X (or its
   key internal function) and asserts the mock returned what it was told to.
2. **Asserting on mock calls instead of behaviour**: only \`toHaveBeenCalled\` /
   \`toHaveBeenCalledWith\` with no assertion on the returned value, the stored
   state or the response.
3. **Mock-everything tests**: every collaborator is mocked and the assertions only
   restate the mock setup, so no production change could make it fail.
4. **Snapshots of mocks** or of large objects nobody reviews; snapshots that are
   regenerated blindly.
5. **Over-specified interactions**: asserting call order or call counts of internal
   helpers, which breaks on harmless refactors.
6. **Always-true assertions**: \`expect(x).toBeDefined()\` on a value that is always
   defined, \`expect(() => fn()).not.toThrow()\` as the only check.
7. A DB-backed test that mocks the database; use a \`*.it.test.ts\` instead.

## Procedure
1. For each new or changed test, list what is mocked.
2. Ask: if the production logic were wrong, would this test fail?
3. Check the assertions target observable output (return value, response body,
   persisted row, emitted event).

## How to report
- Cite the test line with the weak mock or assertion.
- Say which regression would still pass, and what to assert instead.

## Severity guidance
- WARNING: a test that cannot fail or only checks mocks.
- CRITICAL: only when such a test is the sole coverage of a security, tenant-scope
  or contract-critical path.
- SUGGESTION: over-specified interaction assertions.`,
  },
  {
    name: "api-contract-breaking-changes",
    description:
      "Apply when a diff changes an HTTP route, its zod request/response schema or error shape; check for changes that break existing clients (removed or renamed fields, narrowed types, new required inputs, changed status codes).",
    type: 'rubric',
    agents: ['General Reviewer'],
    body: `# API contract breaking changes

In this codebase the zod contract is both the route schema and the client type, so
any edit to a contract or route is a public-interface change. Compare the old and
new shape in the diff and check the list below.

## Breaking-change checklist
1. **Removed or renamed response field**: clients reading it get \`undefined\`.
2. **Narrowed response type**: a non-null field becomes nullable, a type becomes a
   wider union, or a number becomes a string; consumers' assumptions break.
3. **New required request field, query param or header**: existing callers start
   failing with 422.
4. **Stricter request validation**: shorter \`max\`, new \`min\`, a regex, a removed
   accepted value, \`.strict()\` on an object that tolerated extras.
5. **Enum value removed or renamed**, in a request or a response.
6. **Changed status code**: 200 to 201, 404 to 422, 200 to 204.
7. **Changed error shape**: different error body, code or message key that clients
   parse.
8. **Path or method change**: renamed route, moved prefix, GET to POST.
9. **Changed semantics with the same shape**: default sort order, pagination
   defaults, units, scope (now filtered by workspace).
10. **Removed route** without a deprecation period.

Safe changes: adding an optional request field, adding a response field, adding a
new enum value to a response that clients treat as open, adding a new route.

## Procedure
1. Find route files and contract files in the diff (\`routes.ts\`, \`contracts/*.ts\`,
   \`vendor/shared\`).
2. Diff old versus new shape item by item against the checklist.
3. Check whether both \`vendor/shared\` copies (server and client) were updated, and
   whether the client callers in the diff were adapted.
4. Check for a version prefix, a deprecation path or a compatibility shim.

## How to report
- Cite the changed schema or route line.
- State the old and new shape and who breaks ("client \`useRuns\` reads
  \`run.cost\`, which is now \`cost_usd\`").
- Fix: keep the old field alongside the new one, make the new input optional with
  a default, or version the route.

## Severity guidance
- CRITICAL: a breaking change on a public or shared route that is not versioned and
  has no migration path.
- WARNING: breaking change on an internal route whose only consumer is updated in
  the same diff, or a semantic change that may surprise callers.
- SUGGESTION: a safe change that would be clearer with a doc or changelog note.`,
  },
  {
    name: "breaking-change",
    description:
      "Apply when a diff removes, renames or tightens a public API contract (route, method, path, status code, request or response field, enum value, error shape); check that existing clients keep working or that a migration path ships in the same change.",
    type: 'rubric',
    agents: ['API Contract Reviewer'],
    body: `# Breaking change

A change is breaking when a client written against the old contract fails or
misbehaves without being edited. In this codebase a zod contract is the route schema
AND the client type, so every contract or route edit is a public-interface change.

## Procedure
1. List changed routes and contract files (\`routes.ts\`, \`contracts/*.ts\`,
   \`vendor/shared\`, in both server and client copies).
2. For each, compare the old and new shape: paths and methods, status codes, request
   fields (required, validation limits), response fields, enums, error body.
3. Classify each difference: **breaking** (below), **safe** (additive), or
   **semantic** (same shape, different behavior).
4. For every breaking one, look for a migration path in the diff: the old name kept
   as an alias, the new input optional with a default, a deprecation notice, or a
   versioned route.

## Breaking
- Removed or renamed route, field or enum value.
- Changed method, path or status code (200 to 201, 404 to 422, 200 to 204).
- New required request field, query param or header.
- Stricter validation: shorter \`max\`, new \`min\`, regex, \`.strict()\` on an object that
  tolerated extras, an accepted value removed.
- Changed error shape, code or message key that clients parse.
- Semantics changed under the same shape: default sort, pagination defaults, units,
  scope (now filtered by workspace).

## Safe
Adding an optional request field, a new response field, a new route, or a new enum
value in a response that clients treat as open.

## Example
Bad: the response field is renamed in one step; every reader gets \`undefined\`.
\`\`\`ts
// before
export const Run = z.object({ id: z.string(), cost: z.number() });
// after: breaks every client that reads run.cost
export const Run = z.object({ id: z.string(), cost_usd: z.number() });
\`\`\`
Good: add the new field, keep the old one, mark it deprecated, remove it later.
\`\`\`ts
export const Run = z.object({
  id: z.string(),
  cost_usd: z.number(),
  /** @deprecated use cost_usd; removed in 3.0 */
  cost: z.number(),
});
\`\`\`

## How to report
- Cite the changed schema or route line.
- State the old and new shape and who breaks ("client \`useRuns\` reads \`run.cost\`").
- Fix: keep the old field beside the new one, make the new input optional with a
  default, or version the route.

## Severity guidance
- CRITICAL: breaking change on a public or shared route/contract with no migration path.
- WARNING: breaking change whose only consumer is updated in the same diff, or a
  semantic change that may surprise callers.
- SUGGESTION: a safe change that needs a changelog note.`,
  },
  {
    name: "response-schema",
    description:
      "Apply when a diff changes the shape of an API response (field types, nullability, optionality, unions, array vs object, always-present fields); check that consumers can still rely on every field they read.",
    type: 'rubric',
    agents: ['API Contract Reviewer'],
    body: `# Response schema changes

Clients trust the response shape: a field's type and whether it is always present.
Changing either is breaking even when the field name stays the same.

## Procedure
1. Find changes to response schemas (\`z.object\` used as a route \`response\`, DTO
   mappers such as \`toXDto\`, and the matching \`vendor/shared\` contract).
2. For each field compare: type, nullability, optionality, union members,
   array/object/scalar kind, and whether it was previously always present.
3. Check the mapper still fills every field the contract declares. A contract field
   that the handler can omit is a silent break.
4. Check the client copy of the contract and its readers in the diff.

## Breaking
- Type change (\`number\` to \`string\`, \`string\` to object, scalar to array).
- Non-null becomes nullable, or required becomes optional: every \`x.length\` or
  \`x.toFixed()\` at a call site can now throw.
- A union widens (\`'ok' | 'error'\` gains \`'pending'\`) where clients switch exhaustively.
- A field that was always present is conditionally omitted.
- Array becomes paginated object (\`T[]\` to \`{ items: T[], next }\`).

## Safe
A new optional field, a new field on an object clients ignore unknown keys of,
a narrower type (nullable becomes non-null).

## Example
Bad: the field becomes nullable with no signal; callers crash on \`null\`.
\`\`\`ts
// before
export const Run = z.object({ cost_usd: z.number() });
// after: runs without a price now return null
export const Run = z.object({ cost_usd: z.number().nullable() });
// client: run.cost_usd.toFixed(2)  -> TypeError on null
\`\`\`
Good: keep the type, add an explicit flag, or announce and migrate the client together.
\`\`\`ts
export const Run = z.object({
  cost_usd: z.number().default(0),
  cost_known: z.boolean(),
});
\`\`\`

## How to report
- Cite the schema or mapper line; state old and new field type/nullability.
- Name the reader that breaks (a hook, component or CI step that dereferences it).
- Fix: keep the old shape and add a new field, or change server and client in one
  diff and note it in the changelog.

## Severity guidance
- CRITICAL: a type or nullability change on a response read by clients not updated
  in the diff.
- WARNING: same change with all readers updated, or a union widened.
- SUGGESTION: an additive change that deserves documenting.`,
  },
  {
    name: "semver-discipline",
    description:
      "Apply when a diff changes a public API or contract; check that the version bump and changelog entry match the change (breaking = major, new capability = minor, fix = patch).",
    type: 'rubric',
    agents: ['API Contract Reviewer'],
    body: `# Semver discipline

The version number is the contract's promise to consumers. A breaking change under a
minor or patch bump is a broken promise, even if the code is correct.

## Rules
- **MAJOR**: any change that can break an existing client (removed or renamed route,
  field or enum value; new required input; stricter validation; type or nullability
  change; changed status code or error shape).
- **MINOR**: backwards-compatible new capability (new route, new optional field,
  new response field, a deprecation notice).
- **PATCH**: backwards-compatible fix with no contract change.
- Pre-1.0 (\`0.y.z\`) still signals: breaking goes to \`y\`, everything else to \`z\`.
- Deprecation itself is MINOR; the removal that follows is MAJOR.

## Procedure
1. Decide the correct bump from the diff using the rules above (take the highest
   level of any change in the diff).
2. Find the bump: \`package.json\` \`version\`, a \`CHANGELOG.md\` entry, an API version
   constant, or a release note in the PR description.
3. Compare. Missing, or lower than required, is a finding. A bump that is higher
   than needed is only a SUGGESTION.
4. Check the changelog names the breaking change and the migration.

## Example
Bad: a field is removed, the package goes \`2.3.0\` to \`2.3.1\`, no changelog.
\`\`\`diff
- "version": "2.3.0",
+ "version": "2.3.1",
\`\`\`
\`\`\`ts
- cost: z.number(),   // removed
\`\`\`
Good: the removal is a major bump with a migration note.
\`\`\`diff
- "version": "2.3.0",
+ "version": "3.0.0",
\`\`\`
\`\`\`md
## 3.0.0
- BREAKING: \`Run.cost\` removed; use \`Run.cost_usd\` (available since 2.2.0).
\`\`\`

## How to report
- Cite the version line (or the line that changes the contract if no bump exists).
- State the required bump and why ("removed field = breaking = major").
- Fix: bump to the required level and add a changelog entry with the migration.

## Severity guidance
- CRITICAL: a breaking change with no major bump on a published or shared contract.
- WARNING: missing or insufficient bump on a non-published internal contract, or a
  breaking change without a changelog entry.
- SUGGESTION: a bump larger than needed, or a missing changelog on a safe change.`,
  },
];
