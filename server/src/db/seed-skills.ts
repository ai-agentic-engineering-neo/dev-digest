import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Built-in skills used by the seed.
 *
 * A skill is TEXT that gets appended to an agent's prompt as one labelled
 * block — nothing here executes. These are the workspace-authored ones
 * (`manual` / `extracted`); third-party skills arrive through the import flow
 * instead, land disabled, and are listed in `modules/skills/community.ts`.
 *
 * `agents` names the seeded agents each skill is linked to, in the order they
 * appear in the prompt.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  agents: string[];
  body: string;
}

export const SEED_SKILLS: readonly SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Evaluates overall PR quality across correctness, security, tests and scope.',
    type: 'rubric',
    source: 'manual',
    agents: ['General Reviewer', 'Security Reviewer', 'Performance Reviewer'],
    body: `# PR Quality Rubric

Evaluate the pull request against the following dimensions. For each, return a
finding only when the issue is **worth the author's time** — aim for a few
high-signal findings, not a list.

## Correctness
- Does the change do what the PR description claims?
- Are edge cases (empty input, nulls, concurrency) handled?

## Security
- Any secrets, tokens, or credentials in the diff?
- Untrusted input reaching a sink (SQL, shell, fetch)?

## Tests
- New branches covered by assertions?
- Are tests meaningful (not just snapshot churn)?

## Scope
- Does the diff stay within the stated intent?
- Flag out-of-scope changes separately rather than blocking.`,
  },
  {
    name: 'test-coverage-rubric',
    description:
      'Requires every branch added by the diff to have an assertion, and names the branch when one is missing.',
    type: 'rubric',
    source: 'manual',
    agents: ['Test Quality Reviewer'],
    body: `# Test coverage rubric

Before judging the tests, list every branch the diff ADDS: each \`if\`/\`else\`,
early return, \`catch\`, retry, guard clause and default value. Then check the
tests off against that list.

Report a finding for each branch with no assertion reaching it. The finding must
name:

1. the branch (file:line of the condition),
2. the input that takes it,
3. what goes wrong while the suite stays green.

Treat these as uncovered even when a test "touches" the function:

- a branch reached only through a mock that returns the happy value,
- an error path asserted with \`not.toThrow()\` instead of the error itself,
- a \`catch\` block whose body is never executed by any test.

A bug fix with no test that fails against the OLD code is an uncovered branch by
definition — the regression it prevents is the branch.

Do not ask for coverage of unreachable code or of behaviour this diff does not
introduce.`,
  },
  {
    name: 'edge-case-checklist',
    description:
      'Flags the boundary inputs a happy-path test suite leaves untested: empty, zero, negative, duplicate, concurrent and failing dependencies.',
    type: 'custom',
    source: 'manual',
    agents: ['Test Quality Reviewer'],
    body: `# Edge case checklist

For every function the diff adds or changes, walk this list and report the cases
the tests do not cover. Name the input, not the category.

**Collections** — empty, single element, first/last element, duplicates,
unsorted input where order is assumed, very large input.

**Scalars** — \`0\`, \`-1\`, \`NaN\`, \`Infinity\`, an empty string, a string of
whitespace, the maximum allowed length, one character past it.

**Absence** — \`null\`, \`undefined\`, a missing optional field, a field present
but empty. Distinguish "absent" from "present and falsy": \`??\` and \`||\` differ
exactly here.

**Time** — timezone and DST boundaries, leap day, a duration of zero, a
timestamp in the past when the code assumes the future.

**Dependencies** — every call out of the unit must be tested failing at least
once: timeout, non-2xx, malformed body, connection reset, empty result.

**Concurrency** — two calls in flight at once where the code assumes serial
execution; a second call before the first resolves.

A suite that only covers the success path of a function with a failure path is a
finding on its own — say which failure is untested and what a user would see.`,
  },
  {
    name: 'mock-overuse-gate',
    description:
      'Detects tests whose mocks remove the behaviour under test, so the assertion only proves the mock was configured.',
    type: 'custom',
    source: 'manual',
    agents: ['Test Quality Reviewer'],
    body: `# Mock overuse gate

A mock is a tool for isolating a boundary — a network call, a clock, a database.
Mocking anything else removes the behaviour the test claims to check.

Flag:

- **The unit under test is mocked.** The assertion then proves only that the
  mock was configured. This is CRITICAL: the test would pass with the production
  implementation deleted.
- **Assertion on the mock, not the system.** \`expect(mock).toHaveBeenCalledWith(…)\`
  as the only assertion — behaviour can change while the call shape stays.
- **Pure functions and in-memory structures mocked.** Nothing is isolated;
  the real implementation is never exercised.
- **The mock encodes the answer.** The stub returns the exact value the
  assertion expects, computed nowhere.
- **Deep stubbing.** A chain of mocks several layers below the unit, so the test
  passes regardless of how those layers behave.

Do not flag mocking of a genuine boundary (HTTP, fs, time, randomness, a paid
API). Say what the test proves today and what it would have to exercise to prove
the behaviour instead.`,
  },
  {
    name: 'test-naming-convention',
    description:
      'Requires a test name to state the behaviour and its condition, so a failure reads as a defect report.',
    type: 'convention',
    source: 'extracted',
    // Deliberately linked to NOBODY: the fourth skill a Test Quality Reviewer
    // needs arrives through the import flow (see specs/skills-control-experiment.md),
    // and an unlinked skill is what the Skills tab is for attaching.
    agents: [],
    body: `# Test naming convention

A test name is read when it FAILS, in a CI log, by someone who did not write it.
It must say what behaviour broke and under which condition.

Required shape: \`<subject> <expected behaviour> when <condition>\`.

Good: \`retries once when the first request times out\`.
Bad: \`works\`, \`test 2\`, \`handles errors\`, \`should be correct\`.

Flag a test whose name:

- names the implementation instead of the behaviour (\`calls fetchUser twice\`),
- states no condition while the test clearly sets one up,
- says "should" without an observable outcome,
- duplicates a sibling's name.

This is a SUGGESTION-level finding unless the name actively contradicts what the
test asserts, which is a WARNING — a misleading name costs more than a vague one.`,
  },
  {
    name: 'api-contract-gate',
    description:
      'Flags a route, handler or exported signature change that breaks existing callers without a version or migration path.',
    type: 'custom',
    source: 'manual',
    agents: ['General Reviewer'],
    body: `# API contract gate

Treat every HTTP route, exported function signature and response shape in the
diff as a published contract. A change that an existing caller cannot survive is
a breaking change, and a breaking change without a migration path is CRITICAL.

Flag when the diff:

- **Renames or removes** a route, a query/path parameter, a request field, or a
  response field that callers read.
- **Tightens validation**: a previously optional field made required, a widened
  enum narrowed, a default removed, a new minimum length or range.
- **Changes a type on the wire**: string → number, scalar → object, a single
  value → an array, \`null\` no longer permitted.
- **Changes status codes or error shapes**: a 200-with-empty-body becoming a
  404, an error envelope losing \`code\`.
- **Reorders or repurposes positional parameters** of an exported function.

For each, state: which caller breaks, what it sends today, and what it would
receive after the change. A breaking change IS acceptable when the diff also
carries a version bump, a deprecation window, or an adapter — say so instead of
flagging it.

Do not flag additive changes: a new optional field, a new endpoint, a widened
enum, a new nullable column.`,
  },
  {
    name: 'secret-leakage-gate',
    description:
      'Detects credentials committed in the diff — API keys, tokens, private keys and client-exposed server secrets.',
    type: 'security',
    source: 'manual',
    agents: ['Security Reviewer'],
    body: `# Secret leakage gate

Any credential that reaches version control is compromised: it lives in the
history, in every clone, and in CI logs. Treat a committed secret as CRITICAL
even when the PR says it is a test key.

Flag:

- Provider key prefixes: \`sk_live\`, \`sk_test\`, \`rk_\`, \`AKIA\`, \`ghp_\`,
  \`gho_\`, \`xoxb-\`, \`AIza\`, \`service_role\`.
- A private key block (\`BEGIN … PRIVATE KEY\`), a \`.pem\`, a keystore, a
  \`.env\` file with values.
- A server-only secret exposed to a client bundle — anything sensitive behind a
  \`NEXT_PUBLIC_\`, \`VITE_\`, or \`REACT_APP_\` prefix.
- A connection string with an inline password.
- A hard-coded fallback: \`process.env.TOKEN ?? "abc123"\`.
- A secret written into a log line, an error message, or a URL query parameter.

The remediation is always the same and always both halves: **revoke and rotate
the credential**, then remove it from the code and load it from configuration.
Removing it from the file alone leaves it valid in the history.

Do not flag an obvious placeholder (\`<your-key-here>\`, \`xxx\`, \`changeme\`) or
a public identifier such as a publishable key.`,
  },
  // ---- API Contract Reviewer -------------------------------------------
  // The four skills that carry ALL of that agent's knowledge of what a contract
  // break is — its system prompt deliberately does not list the classes, so a
  // run with these unlinked is the control arm of the experiment in
  // specs/api-contract-reviewer.md. Human-readable originals (with frontmatter)
  // live in specs/fixtures/api-contract-reviewer/; keep the two in sync.
  {
    name: 'breaking-change',
    description:
      'Flags any change or removal of a published contract — a route, its parameters, an exported signature or a response field — that an existing caller cannot survive, and names the caller that breaks.',
    type: 'custom',
    source: 'manual',
    agents: ['API Contract Reviewer'],
    body: `# Breaking change

A published contract is anything a caller outside this diff can depend on: an
HTTP route and its method, a path / query / body parameter, a response field,
an exported function's positional parameters or return type, an event name, an
environment variable the deployment reads.

Report **CRITICAL** when the diff, without a version bump, a deprecation window
or an adapter:

- removes or renames a route, a parameter, or a response field;
- turns an optional parameter into a required one, or narrows what it accepts
  (a shorter enum, a new minimum, a stricter pattern, a removed default);
- changes the type, nullability or cardinality of a value on the wire;
- changes a status code or the shape of an error envelope;
- reorders or repurposes the positional parameters of an exported function.

For every finding state, in this order: (1) the contract as it was, (2) as it
becomes, (3) which caller breaks and what it observes — a 422, an \`undefined\`,
a \`TypeError\` — and (4) the smallest change that would not break it.

Do **not** flag: a new optional field, a new route, a widened enum, a new
nullable column, a stricter internal type that never reaches the wire, or a
break the diff already pairs with a version bump, a deprecation marker or an
old/new side-by-side.

## Good

\`\`\`diff
 const ListQuery = z.object({
-  status: z.enum(['open', 'merged', 'closed']).optional(),
+  status: z.enum(['open', 'merged', 'closed', 'draft']).optional(),
 });
\`\`\`

The enum widened and the parameter stayed optional: every request that worked
yesterday works today. Nothing to report.

## Bad

\`\`\`diff
 const ListQuery = z.object({
-  status: z.enum(['open', 'merged', 'closed']).optional(),
+  status: z.enum(['open', 'merged', 'closed']),
 });
\`\`\`

\`status\` is now required. Every caller that omitted it — the web app's PR list
and the CI runner both do — receives 422 from the schema layer before the
handler runs. CRITICAL: cite the line, name the caller, and propose
\`.default('open')\` or keeping \`.optional()\`.`,
  },
  {
    name: 'response-schema',
    description:
      'Detects changes to the shape of a response — renamed or removed fields, changed types, changed nullability or required-ness — and requires an additive path or a new version before the old shape may go.',
    type: 'custom',
    source: 'manual',
    agents: ['API Contract Reviewer'],
    body: `# Response schema

A response shape is read by code you cannot see. For every place in the diff
that produces a response — a route handler's return, a serializer, a DTO
mapper, a \`toDto()\`, a Zod contract — write down the shape before and after,
then compare key by key.

Report (**WARNING**; **CRITICAL** when the field is an identifier, a key
callers join on, or is read by a consumer visible in the repo):

- a field renamed (\`full_name\` → \`fullName\`) or removed;
- a field's type changed — \`string\` → \`number\`, scalar → array, object →
  string, a date format, a numeric precision;
- a field that could be \`null\` and no longer can, or the reverse;
- a field that was always present and is now optional;
- wire casing changed between snake_case and camelCase.

State the old and the new shape as two short JSON fragments, name a consumer
that reads the field, and propose one of two paths: return the old field
**alongside** the new one for a release (additive), or serve the new shape
under a new route version.

Do **not** flag adding an optional field, adding a member to a list, or shapes
that only exist in tests and mocks.

## Good

\`\`\`ts
return {
  id,
  full_name: repo.fullName, // @deprecated since 1.5 — use \`fullName\`; removed in 2.0
  fullName: repo.fullName,
};
\`\`\`

Both keys are served for one release; consumers migrate on their own schedule,
and the old key is removed under the next major version.

## Bad

\`\`\`diff
 return rows.map((pr) => ({
   id: pr.id,
-  full_name: pr.repoFullName,
-  head_sha: pr.headSha,
+  fullName: pr.repoFullName,
 }));
\`\`\`

\`full_name\` renamed and \`head_sha\` dropped in one commit; the client's \`PRRow\`
reads both and will render \`undefined\`. CRITICAL: cite the lines, show
\`{ "full_name": …, "head_sha": … }\` → \`{ "fullName": … }\`, name \`PRRow\`, and
propose the side-by-side shape above.`,
  },
  {
    name: 'deprecation-policy',
    description:
      'Requires that any contract element the diff removes or replaces was first marked deprecated with a named replacement and a removal horizon, and flags silent removal.',
    type: 'custom',
    source: 'manual',
    agents: ['API Contract Reviewer'],
    body: `# Deprecation policy

Nothing public disappears in one step. Before a route, a parameter, a response
field or an export is removed, the code being removed must already carry a
deprecation marker:

- a \`@deprecated\` JSDoc tag naming the replacement and the removal version or
  date — \`@deprecated since 1.5 — use fullName; removed in 2.0\`;
- for HTTP, a \`Deprecation\` and a \`Sunset\` response header, or
  \`deprecated: true\` in the route schema;
- the old and the new element served side by side for at least one release.

Report:

- **CRITICAL** — an element removed that had no replacement at all;
- **WARNING** — an element removed with no prior deprecation marker anywhere
  in the removed code; a \`@deprecated\` marker with no replacement ("do not
  use") or no removal horizon; a \`@deprecated\` element still used inside the
  same repository — deprecation without migration.

Always propose the two-step change: keep the old element, add the marker and
the replacement in this PR, remove in the next major version.

## Good

\`\`\`ts
/** @deprecated since 1.5 — use \`fullName\`; removed in 2.0. */
full_name: repo.fullName,
fullName: repo.fullName,
\`\`\`

\`\`\`ts
reply
  .header('Deprecation', 'true')
  .header('Sunset', 'Sat, 31 Oct 2026 00:00:00 GMT')
  .header('Link', '</v2/repos/:id/pulls>; rel="successor-version"');
\`\`\`

The old key and the old route keep working, announce their end, and point at
what replaces them.

## Bad

\`\`\`diff
 return rows.map((pr) => ({
   id: pr.id,
-  head_sha: pr.headSha,
   state: pr.state,
 }));
\`\`\`

\`head_sha\` is gone with no \`@deprecated\`, no replacement and no sunset date.
WARNING: cite the removed line and give the two-step version — keep the key,
mark it, remove it in the next major.`,
  },
  {
    name: 'semver-discipline',
    description:
      'Decides whether the contract changes in the diff require a major, minor or patch version bump, and flags a major-class change that ships without a major bump.',
    type: 'custom',
    source: 'manual',
    agents: ['API Contract Reviewer'],
    body: `# Semver discipline

Every contract change has a version cost. Classify each change the diff makes
to a public surface:

- **MAJOR** — anything an existing caller cannot survive: a removal, a rename,
  a parameter made required, a narrowed type or enum, a changed status code.
- **MINOR** — additive: a new optional field, a new route, a widened enum, a
  new nullable column.
- **PATCH** — a behaviour fix under the same contract.

Then read what the diff *declares*: \`package.json\` \`version\`, an OpenAPI
\`info.version\`, a route prefix such as \`/v1/\`, a \`CHANGELOG.md\` entry.

Report **WARNING** — "major-class change without a major bump" — when the diff
contains at least one MAJOR-class change and the declared version moved by
less than a major, or did not move at all. List the change that forces the
major and the version the diff should declare. A new route prefix (\`/v2/…\`)
with the old route left in place counts as a major bump for that route.

If the diff changes no public surface, say nothing about versioning.

## Good

\`\`\`diff
-  "version": "1.4.2",
+  "version": "2.0.0",
\`\`\`

\`\`\`diff
 app.get('/repos/:id/pulls', …)      // unchanged, still served
+app.get('/v2/repos/:id/pulls', …)   // the new shape lives here
\`\`\`

A breaking shape, a major bump, and the old route still served: consumers
choose when to move.

## Bad

\`\`\`diff
-  "version": "1.4.2",
+  "version": "1.4.3",
\`\`\`

\`\`\`diff
-  status: z.enum(['open', 'merged', 'closed']).optional(),
+  status: z.enum(['open', 'merged', 'closed']),
\`\`\`

A parameter made required is major-class; the diff ships it as a patch.
WARNING: cite both lines and state that the declared version must be \`2.0.0\`,
or the parameter must stay optional.`,
  },
];
