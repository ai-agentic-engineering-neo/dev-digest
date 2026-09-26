/**
 * Seeded skills (L02). Six reusable, text-only review rules matching the
 * Skills Lab mock; three of them are linked (in this order) to the seeded
 * Security Reviewer so the Agent editor's Skills tab shows "3 of 6 enabled"
 * on a fresh DB and the e2e flow stays deterministic.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const SEED_SKILLS: readonly SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Baseline quality bar every finding must clear before it is reported.',
    type: 'rubric',
    body: `# PR quality rubric

Report a finding only when all of these hold:

- It cites an exact \`file:line\` from the diff. A location you cannot cite is not a finding.
- It describes a concrete consequence (data loss, wrong result, outage, leaked secret), not a taste preference.
- It is actionable: the suggestion says what to change, not "consider improving".

Severity guide: CRITICAL blocks merge (security hole, data corruption, crash on a common path). WARNING is a real defect on an edge path or a missing test for risky logic. SUGGESTION is clarity or maintainability. Speculative issues ("might be", "if not already handled") are at most WARNING.`,
  },
  {
    name: 'no-then-chains',
    description: 'Prefer async/await over nested .then() chains in application code.',
    type: 'convention',
    body: `# No .then() chains

In application code, a promise chain with two or more \`.then()\` calls, or a \`.then()\` nested inside another callback, should be written with \`async\`/\`await\`. Flag it as SUGGESTION, cite the first \`.then\`, and show the awaited form. A single \`.then()\` on a fire-and-forget call is fine.`,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Hard-coded credentials and tokens in source or config.',
    type: 'security',
    body: `# Secret leakage gate

Flag as CRITICAL any literal that looks like a credential added by the diff: API keys (\`sk_live\`, \`sk-or-v1-\`, \`AKIA…\`), service-role keys, private keys, connection strings with passwords, and \`NEXT_PUBLIC_\` variables that carry a server secret. Environment lookups (\`process.env.X\`) and obvious placeholders (\`xxx\`, \`changeme\`, \`<your-key>\`) are not findings. Cite the exact line and say which secret class it matches.`,
  },
  {
    name: 'lethal-trifecta',
    description: 'Private data + untrusted input + an exfiltration path in one change.',
    type: 'security',
    body: `# Lethal trifecta

A change is a CRITICAL finding when it combines all three in one reachable path: (1) access to private data or credentials, (2) input that an outside party controls (request body, webhook, PR text, file contents), and (3) a way to send data out (HTTP call, email, log shipped externally). Name the three legs with their \`file:line\`. Two legs without the third is at most a WARNING that names the missing leg.`,
  },
  {
    name: 'phantom-api-gate',
    description: 'Calls to functions, endpoints or packages that do not exist in the repo.',
    type: 'security',
    body: `# Phantom API gate

Flag as WARNING any call the diff introduces to a symbol, route, or package that does not exist in the repo skeleton or the callers digest and is not added by the same diff. Typical cases: a helper that was renamed, an npm package that is not in the lockfile, a REST path with no route. Say what was searched and what was not found. Do not flag well-known standard-library or framework APIs.`,
  },
  {
    name: 'test-coverage-nudge',
    description: 'Behaviour changes that ship without a matching test.',
    type: 'custom',
    body: `# Test coverage nudge

When the diff changes behaviour in a non-test file (a new branch, a changed condition, new error handling) and no test file in the diff exercises it, add one SUGGESTION naming the changed function and the case that should be covered. One nudge per PR at most; do not repeat it per file.`,
  },

  // ---- Test Quality Reviewer ----
  {
    name: 'uncovered-branch-gate',
    description: 'Flag every new or changed branch in production code that no test in the diff reaches.',
    type: 'rubric',
    body: `# Uncovered branch gate

For each non-test file in the diff, list the branches the change adds or alters: \`if\`/\`else\`, \`switch\` cases, early returns, \`catch\` blocks, optional chaining that swallows a null, and guard clauses. For each branch, look for a test in the diff whose inputs make that branch execute.

- A branch that changes data or throws with no test reaching it is CRITICAL. Cite the branch line and say which input would reach it.
- Any other unreached branch is WARNING.
- A happy-path-only test suite for a function with error handling is the classic case: name the untested error path explicitly.

Do not count a test that merely imports the module or asserts "does not throw".`,
  },
  {
    name: 'corner-case-checklist',
    description: 'Check the tests for the boundary inputs the change makes possible; name each missing one.',
    type: 'rubric',
    body: `# Corner-case checklist

For every function the diff adds or changes, run this checklist against the tests in the diff and report each item the tests skip, as one WARNING per function (list the missing cases in the rationale):

- empty input: \`[]\`, \`''\`, \`{}\`, \`null\`, \`undefined\`
- boundaries: 0, 1, the limit itself, limit + 1, negative numbers
- duplicates and ordering when a list is involved
- unicode / whitespace-only strings when text is parsed
- concurrency: the same call twice, or a call while a previous one is pending
- time: dates at midnight, month end, DST, and the year boundary

Only list cases the new code can actually hit; a pure string formatter has no concurrency case.`,
  },
  {
    name: 'over-mocking-rule',
    description: 'Flag tests whose mocks replace the very behaviour the test claims to verify.',
    type: 'convention',
    body: `# Over-mocking rule

A test is over-mocked when the mocked collaborator is the thing that would fail if the code were wrong. Flag as WARNING, citing the mock line:

- the unit under test itself, or its direct return value, is mocked or spied and then asserted
- every dependency is replaced with \`vi.fn()\` / \`jest.fn()\` so no real branch runs
- a database, repository, or HTTP client mock returns exactly what the assertion then checks, with no transformation in between
- assertions are only \`toHaveBeenCalled\` with no check on outputs or state

Mocking the network, the clock, or the file system at the boundary is fine and not a finding.`,
  },
  {
    name: 'flaky-test-gate',
    description: 'Catch tests that depend on wall-clock time, ordering, shared state or real network.',
    type: 'convention',
    body: `# Flaky test gate

Flag as WARNING any test in the diff that:

- reads \`Date.now()\` / \`new Date()\` without faking timers, or asserts on a duration
- uses a real \`setTimeout\` / \`sleep\` to wait for an effect instead of awaiting it
- depends on the order of other tests or on module-level mutable state that another test changes
- hits a real network address, a real file outside a temp dir, or a real database without a per-test fixture
- asserts on a randomly generated value or on \`Math.random()\` without seeding

Cite the line with the time, sleep, shared state, or network call, and say what makes it non-deterministic.`,
  },

  // ---- API Contract Reviewer ----
  {
    name: 'breaking-change-gate',
    description: 'Detect route, schema and response changes an existing client cannot survive.',
    type: 'rubric',
    body: `# Breaking change gate

A change is CRITICAL (breaking) when an already-shipped client request would now be rejected or would receive a differently shaped response. Cite the diff line and name the route and field. Breaking:

- a route path or HTTP method is renamed or removed
- a request parameter, query or body field becomes required, is renamed, or its type is tightened (string → uuid, number → integer, enum loses a value)
- a response field is removed, renamed, becomes nullable, or changes type; an enum value clients switch on is removed
- a status code or the error envelope shape changes

Not breaking (no finding): adding an optional request field, adding a response field, adding an enum value, loosening validation. A breaking change accompanied in the same diff by a versioned route (\`/v2/…\`) or a documented migration is downgraded to WARNING.`,
  },
  {
    name: 'contract-copy-sync',
    description: 'A contract edit under server/src/vendor/shared must appear identically in client/src/vendor/shared.',
    type: 'convention',
    body: `# Contract copy sync

The Zod contracts live in \`server/src/vendor/shared\` and are copied verbatim to \`client/src/vendor/shared\`. When the diff edits a file under the server copy and the same relative path under the client copy is not in the diff with the same change, report one WARNING citing the server-side line and naming the client path that must be updated. If both copies change but differ, report a WARNING citing the first divergent line. Do not report anything when neither copy is touched.`,
  },
  {
    name: 'error-envelope-rule',
    description: 'Every error a route returns must use the { error: { code, message, details } } envelope.',
    type: 'convention',
    body: `# Error envelope rule

API errors are always \`{ error: { code, message, details? } }\` with a stable snake_case \`code\`. Flag as WARNING, citing the line, any route or handler in the diff that:

- replies with a bare string, a \`{ message }\` object, or a thrown plain \`Error\` that would serialise without a code
- returns a 200 with an \`error\` field instead of a 4xx/5xx status
- introduces a new error code that is not snake_case or that reuses an existing code for a different meaning

Throwing an \`AppError\` subclass is the compliant pattern and is not a finding.`,
  },
];

/**
 * Skills linked to each seeded agent, in prompt order. Only these two lesson
 * agents and Security Reviewer get links; General and Performance stay bare so
 * a run without skills is one click away for the control experiment.
 */
export const AGENT_SKILL_LINKS: Readonly<Record<string, readonly string[]>> = {
  'Security Reviewer': ['pr-quality-rubric', 'secret-leakage-gate', 'lethal-trifecta'],
  'Test Quality Reviewer': ['uncovered-branch-gate', 'corner-case-checklist', 'over-mocking-rule', 'flaky-test-gate'],
  'API Contract Reviewer': ['breaking-change-gate', 'contract-copy-sync', 'error-envelope-rule'],
};
