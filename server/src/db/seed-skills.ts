import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Skills seeded by `seed.ts` (M2). Pure data (type imports only): the seed reads it.
 *
 * A skill is a name (kebab-case, the prompt-block heading), a description and
 * a markdown body. The description is the skill's interface — the model reads
 * it above the body — so it is written as a directive. Bodies are trusted
 * review instructions: they say what to flag, at what severity, and what not
 * to flag, and never describe the output JSON (the schema does that).
 */

export interface SeedSkillVersion {
  /** ISO date the version was written. */
  at: string;
  note: string | null;
  description: string;
  body: string;
}

export interface SeedSkill {
  name: string;
  type: SkillType;
  source: SkillSource;
  enabled: boolean;
  /** Oldest first; the last one is the skill's current content. */
  versions: SeedSkillVersion[];
}

/** A skill with one version (v1), written at the seed's fixed date. */
function single(
  name: string,
  type: SkillType,
  source: SkillSource,
  description: string,
  body: string,
  enabled = true,
): SeedSkill {
  return { name, type, source, enabled, versions: [{ at: '2026-06-02', note: null, description, body }] };
}

// ---- pr-quality-rubric: five versions (the Versions tab demo) ----------------

const RUBRIC_DESCRIPTION =
  'Score every finding against these dimensions and report only what clears the bar.';

const RUBRIC_V1 = `Judge each candidate finding on two dimensions before you report it.

## Correctness
- Does the change do what the PR says it does, on every path the diff touches?
- Are errors handled where they can actually occur (I/O, parsing, external calls)?

## Clarity
- Would a reader misunderstand this code in a way that causes a bug later?
- Only flag naming or structure when the confusion is concrete, not stylistic.

Drop any finding you cannot tie to a specific changed line.`;

const RUBRIC_V2 = `${RUBRIC_V1}

## Security
- Untrusted input (request bodies, query strings, headers, PR text) reaching a
  query, a shell, a file path, a URL fetch or a template without validation.
- Secrets or tokens written to code, logs, error messages or responses.`;

const RUBRIC_V3 = `Judge each candidate finding on these dimensions before you report it.

## Correctness
- Trace each changed branch: what input reaches it, and what does it return or
  write? A finding names the input that breaks it.
- Check boundaries: empty collections, zero, negative numbers, null/undefined,
  duplicate keys, concurrent calls to the same handler.
- Errors are handled where they can occur (I/O, parsing, external calls), and a
  handled error leaves state consistent (no half-written rows).

## Clarity
- Only when a reader would misunderstand the code in a way that causes a bug.

## Security
- Untrusted input reaching a query, a shell, a file path, a URL fetch or a
  template without validation.
- Secrets or tokens in code, logs, error messages or responses.

Drop any finding you cannot tie to a specific changed line.`;

const RUBRIC_V4 = `${RUBRIC_V3}

## Tests
- New behaviour (a branch, an error path, a status code) with no test that
  exercises it. Name the branch and the input a test should use.
- A changed contract (route, response shape, exported function) whose existing
  tests were not updated.`;

const RUBRIC_V5 = `Judge each candidate finding on these dimensions before you report it.

## Correctness
- Trace each changed branch: what input reaches it, and what does it return or
  write? A finding names the input that breaks it.
- Check boundaries: empty collections, zero, negative numbers, null/undefined,
  duplicate keys, concurrent calls to the same handler.
- A handled error leaves state consistent (no half-written rows, no lost lock).

## Security
- Untrusted input reaching a query, a shell, a file path, a URL fetch or a
  template without validation.
- Secrets or tokens in code, logs, error messages or responses.

## Tests
- New behaviour (a branch, an error path, a status code) with no test that
  exercises it. Name the branch and the input a test should use.

## Clarity
- Only when a reader would misunderstand the code in a way that causes a bug.

## Scope and volume
- Review only lines this PR adds or changes. Pre-existing problems in untouched
  code are out of scope, even when you notice them.
- Report at most 5 findings, the highest-signal ones. A short list of real
  problems beats a long list of maybes; zero is a valid answer.`;

const PR_QUALITY_RUBRIC: SeedSkill = {
  name: 'pr-quality-rubric',
  type: 'rubric',
  source: 'manual',
  enabled: true,
  versions: [
    { at: '2026-03-02', note: 'Initial rubric', description: RUBRIC_DESCRIPTION, body: RUBRIC_V1 },
    { at: '2026-03-21', note: 'Added Security dimension', description: RUBRIC_DESCRIPTION, body: RUBRIC_V2 },
    { at: '2026-04-14', note: 'Reworded Correctness checks', description: RUBRIC_DESCRIPTION, body: RUBRIC_V3 },
    { at: '2026-05-08', note: 'Added Tests dimension', description: RUBRIC_DESCRIPTION, body: RUBRIC_V4 },
    {
      at: '2026-05-30',
      note: 'Tightened scope rule; cap at 5 high-signal findings',
      description: RUBRIC_DESCRIPTION,
      body: RUBRIC_V5,
    },
  ],
};

// ---- the other design skills ------------------------------------------------

const NO_THEN_CHAINS = single(
  'no-then-chains',
  'convention',
  'extracted',
  'Flag new promise .then()/.catch() chains in async code; this codebase uses async/await.',
  `This repository writes asynchronous code with \`async\`/\`await\`. A new
\`.then()\` / \`.catch()\` chain is a convention break and often hides a bug.

## Flag
- A \`.then()\` chain inside an \`async\` function: the result is usually not
  awaited, so errors escape the surrounding \`try\`/\`catch\`.
- A promise that is neither awaited, returned nor explicitly fire-and-forget
  (\`void promise.catch(...)\`): an unhandled rejection crashes the process.
- \`.catch(() => {})\` or \`.catch(() => undefined)\` that swallows an error with
  no log and no comment saying why.

## Do not flag
- Deliberate fire-and-forget written as \`void task().catch(log)\`.
- \`Promise.all\` / \`Promise.allSettled\` used with \`await\`.
- Untouched existing code.

Severity: WARNING when an error can be lost or a result is used before it
resolves; SUGGESTION for a pure style break.`,
);

const SECRET_LEAKAGE_GATE = single(
  'secret-leakage-gate',
  'security',
  'community',
  'Block any credential, token or private key that the diff adds to code, config, logs or fixtures.',
  `Treat every added literal that looks like a credential as real until the diff
proves otherwise.

## Flag as CRITICAL
- Provider keys and tokens: \`sk_live_\`, \`sk-\`, \`ghp_\`, \`gho_\`, \`xoxb-\`,
  \`AKIA\`, \`AIza\`, JWTs (\`eyJ...\`), PEM blocks (\`-----BEGIN ... PRIVATE KEY\`).
- Connection strings with an inline password (\`postgres://user:pass@\`).
- A secret read from the environment and then logged, returned in a response,
  put in an error message or sent to a third party.

## Flag as WARNING
- A \`.env\`, key or credentials file added to the repository.
- Test fixtures with realistic-looking live keys (use obvious fakes like
  \`sk_test_XXXX\`).

## Do not flag
- Placeholders (\`<your-key>\`, \`changeme\`, \`xxx\`) and reads of
  \`process.env.X\` that never leave the process.

Always tell the author to rotate a leaked key: removing it from the diff does
not remove it from git history.`,
);

const LETHAL_TRIFECTA = single(
  'lethal-trifecta',
  'security',
  'community',
  'Flag code that gives an LLM agent private data, untrusted input and an outbound channel at once.',
  `An LLM agent is exploitable by prompt injection when one flow combines all
three of:

1. **Private data** — secrets, user records, repository contents, internal APIs.
2. **Untrusted content** — PR text, issues, web pages, emails, uploaded files,
   tool output from any of these.
3. **An exfiltration channel** — outbound HTTP, posting comments, sending mail,
   writing to a URL the content controls, rendering links or images.

## Flag
- A change that adds the third leg to a flow that already has the other two
  (CRITICAL), naming each leg with its file and line.
- Untrusted content placed in a prompt without a delimiter fence.

## Do not flag
- A flow with only one or two legs. Say which leg is missing if it matters.
- Content the user typed themselves into a trusted field.

Classify conservatively: most diffs have no trifecta.`,
);

const PHANTOM_API_GATE = single(
  'phantom-api-gate',
  'security',
  'imported_file',
  'Flag calls to functions, methods or endpoints that do not exist in the codebase or its dependencies.',
  `AI-written code often calls APIs that look plausible but do not exist.

## Flag
- A method called on a library object that the library does not export (for
  example an ORM helper with an invented name).
- An import of a module path that is not in the repository or \`package.json\`.
- A fetch to an internal endpoint that no route in the repository serves.

## How to check
- Use the repo skeleton and callers context when present; when you cannot see
  the definition, say so and keep the severity at WARNING.

Do not flag dynamic access you cannot resolve statically.`,
  false,
);

const TEST_COVERAGE_NUDGE = single(
  'test-coverage-nudge',
  'custom',
  'manual',
  'When the diff adds behaviour without a test, name the missing test case instead of asking for "more tests".',
  `A request for tests is only useful when it names the case.

## Flag
- A new exported function, route or branch with no test file touched in the PR.
- A bug fix with no regression test that would have failed before the fix.

## How to write the finding
- Cite the untested line, then state the test: the input, and the expected
  output or error. "Add a test where \`amount\` exceeds the remaining balance;
  expect 400 \`refund_exceeds_payment\`."
- SUGGESTION by default; WARNING when the untested path moves money, deletes
  data or changes auth.

Do not flag generated files, type-only changes or pure renames.`,
);

// ---- test-quality skills (Test Quality Reviewer) ------------------------------

const BRANCH_COVERAGE_CHECK = single(
  'branch-coverage-check',
  'custom',
  'manual',
  'For every branch the diff adds, check that some test drives execution down each side.',
  `List the decision points the diff adds — \`if\`/\`else\`, \`switch\` cases,
early returns, \`?:\`, \`??\`, \`try\`/\`catch\`, thrown errors, status codes —
then look for a test that reaches each outcome.

## Flag
- An error branch (not found, invalid input, conflict, upstream failure) that no
  test reaches. Name the input that would reach it.
- A test file that only asserts the success response of a handler that has
  several failure responses.
- Boundary values the branch condition implies but no test uses: the exact
  limit, one past it, zero, empty, negative.

## Severity
- WARNING when the untested branch handles money, auth, data deletion or an
  external side effect; SUGGESTION otherwise.

Do not demand tests for logging-only branches or for code the PR did not touch.`,
);

const MOCKING_DISCIPLINE = single(
  'mocking-discipline',
  'custom',
  'manual',
  'Flag tests that mock the unit under test or so much of its collaborators that they can no longer fail.',
  `A test earns its keep only if it can fail when the code is wrong.

## Flag
- The function under test is itself mocked or spied with a fixed return value.
- Every collaborator is mocked and the assertions only check that the mocks were
  called (\`toHaveBeenCalled\`) — the test restates the implementation.
- A mock returns a shape the real dependency never returns (missing fields,
  wrong types), so the test passes against an impossible world.
- Pure functions (parsers, calculators, mappers) mocked instead of run for real.

## Prefer
- Real pure code; fakes only at I/O boundaries (database, network, clock, LLM).
- Assertions on outputs and stored state, not on call counts.

Severity: WARNING when the mocking hides a real path in the diff; otherwise
SUGGESTION.`,
);

const FLAKY_TEST_SIGNALS = single(
  'flaky-test-signals',
  'custom',
  'manual',
  'Flag test code whose result depends on time, ordering, randomness or the network.',
  `## Flag
- Fixed sleeps (\`setTimeout\`, \`sleep(500)\`) used to wait for async work.
  Await the promise or poll for the condition with a timeout instead.
- \`Date.now()\`, \`new Date()\` or timezones in assertions without a fake clock.
- \`Math.random()\` or generated ids in assertions without a seed.
- Tests that depend on each other's order or on shared mutable state (a module
  level array, a database row another test created).
- Real network calls or real third-party services.
- Assertions on the order of results from an unordered query or \`Promise.all\`
  race.

Severity: WARNING for a test the PR adds or changes; never flag untouched tests.`,
);

// ---- API-contract skills (General Reviewer) ----------------------------------

const API_CONTRACT_COMPAT = single(
  'api-contract-compat',
  'convention',
  'manual',
  'Flag changes to a public API contract that break existing clients without a version or migration path.',
  `Clients you cannot see depend on every route, field and status code.

## Breaking changes (WARNING, CRITICAL for payment or auth routes)
- A response field removed, renamed or retyped (\`amount\` → \`amount_cents\`,
  number → string).
- A response changed from an array to an object, or wrapped in an envelope.
- A new required request field or query parameter.
- A status code changed for an existing outcome (200 → 201, 404 → 400).
- An enum value removed or renamed.

## Ask for
- A new versioned route, or an additive change (keep the old field, add the
  new one, deprecate later).
- An updated OpenAPI document and client SDK in the same PR.

Additive changes (new optional field, new route) are not breaking: do not flag
them.`,
);

const ROUTE_SIGNATURE_GATE = single(
  'route-signature-gate',
  'security',
  'imported_file',
  'Flag any change to a route path, path parameter or response schema, and check every caller still matches.',
  `When a route's signature changes, the server and its callers drift apart
silently: the old URL 404s and the old field reads \`undefined\`.

## For every changed route
1. Path: compare the old and new path and parameter names
   (\`/customers/:customerId\` → \`/customers/:id\`). Handlers that read the old
   param name now get \`undefined\`.
2. Validation: the params/body/query schema must match the new names.
3. Response: compare the old and new response schema field by field.
4. Callers: look in the diff and the callers context for clients, SDKs, tests
   and docs that still use the old path, param or field.

## Severity
- CRITICAL when a handler reads a param name the path no longer declares.
- WARNING for a response shape change without a version bump.

Report each mismatch with the line on both sides when both are in the diff.`,
);

/** In insertion order (the Skills list shows oldest first). */
export const SEED_SKILLS: SeedSkill[] = [
  PR_QUALITY_RUBRIC,
  NO_THEN_CHAINS,
  SECRET_LEAKAGE_GATE,
  LETHAL_TRIFECTA,
  PHANTOM_API_GATE,
  TEST_COVERAGE_NUDGE,
  BRANCH_COVERAGE_CHECK,
  MOCKING_DISCIPLINE,
  FLAKY_TEST_SIGNALS,
  API_CONTRACT_COMPAT,
  ROUTE_SIGNATURE_GATE,
];

/**
 * Links per seeded agent, in prompt order. Security Reviewer matches the agent
 * Skills tab design: six skills, three enabled. Enabled links give the first
 * four design cards their agent counts: 3, 1, 1, 1.
 */
export const SEED_SKILL_LINKS: Record<string, { skill: string; enabled: boolean }[]> = {
  'Security Reviewer': [
    { skill: 'pr-quality-rubric', enabled: true },
    { skill: 'no-then-chains', enabled: false },
    { skill: 'secret-leakage-gate', enabled: true },
    { skill: 'lethal-trifecta', enabled: true },
    { skill: 'phantom-api-gate', enabled: false },
    { skill: 'test-coverage-nudge', enabled: false },
  ],
  'Performance Reviewer': [
    { skill: 'pr-quality-rubric', enabled: true },
    { skill: 'no-then-chains', enabled: true },
  ],
  'General Reviewer': [
    { skill: 'pr-quality-rubric', enabled: true },
    { skill: 'api-contract-compat', enabled: true },
    { skill: 'route-signature-gate', enabled: true },
  ],
  'Test Quality Reviewer': [
    { skill: 'branch-coverage-check', enabled: true },
    { skill: 'mocking-discipline', enabled: true },
    { skill: 'flaky-test-signals', enabled: true },
    { skill: 'test-coverage-nudge', enabled: true },
  ],
};
