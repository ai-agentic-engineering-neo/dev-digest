/**
 * Built-in skills used by the seed (L02), ported from the course's
 * `lesson-2-lab/skills` branch. Edits vs. that branch:
 * - severities use our three levels (CRITICAL / WARNING / SUGGESTION — no INFO);
 * - `lethal-trifecta` follows the Security Reviewer prompt's definition
 *   (untrusted content + private data + exfiltration), not a second one;
 * - `phantom-api-gate` is NOT seeded — it is imported live from
 *   `docs/skills-import/phantom-api-gate.zip` to walk the import flow.
 *
 * The DB row is the source of truth at run time; editing a body here only
 * affects freshly seeded workspaces.
 */
import type { SkillType } from '@devdigest/shared';

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Structured rubric for evaluating overall PR quality — correctness, testing, docs.',
    type: 'rubric',
    enabled: true,
    body: `# PR Quality Rubric

Evaluate the PR against these dimensions and flag any dimension that scores below threshold.

## Correctness (weight: 40%)
- Logic errors, off-by-one, wrong comparisons, operator precedence.
- Missing null/undefined guards at system boundaries.
- Race conditions in async code.

## Testing (weight: 30%)
- Changed code has corresponding tests.
- Tests exercise the failure path, not just the happy path.
- No mock-only tests that hide real failures.

## Documentation (weight: 15%)
- Public API surface has JSDoc or inline comments for non-obvious behavior.
- CHANGELOG / migration guide updated for breaking changes.

## Code clarity (weight: 15%)
- Variable and function names are unambiguous.
- Functions are at a single level of abstraction.
- Magic numbers are named constants.`,
  },
  {
    name: 'no-then-chains',
    description: 'Flag .then()/.catch() chains; prefer async/await for readability.',
    type: 'convention',
    enabled: true,
    body: `# No Promise.then() Chains

Flag any .then()/.catch() chain that can be replaced by async/await.

## Rule
- WARNING on .then() chains longer than 1 hop.
- WARNING on .catch() handlers that suppress errors without logging.
- CRITICAL on .then() inside a .then() (nested promise chains).

## Good
\`\`\`ts
const data = await fetchUser(id);
const enriched = await enrich(data);
\`\`\`

## Bad
\`\`\`ts
fetchUser(id).then(data => enrich(data)).then(enriched => save(enriched));
\`\`\``,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Detect hardcoded secrets, API keys, and credentials committed to source.',
    type: 'security',
    enabled: true,
    body: `# Secret Leakage Gate

Scan every changed file for hardcoded credentials.

## Patterns to flag as CRITICAL
- String literals matching: sk_live_, sk_test_, AKIA, ghp_, ghs_, xoxb-, xoxp-
- Assignments like password = "...", secret = "...", api_key = "..."
- Base64-encoded blobs of 20+ chars in string literals
- PEM headers (-----BEGIN PRIVATE KEY-----)

## Patterns to flag as WARNING
- Hard-coded localhost URLs with embedded credentials
- .env files accidentally staged

## Exception
Test fixtures with clearly fake keys (e.g. test_key_abc123) are SUGGESTION at most.`,
  },
  {
    name: 'lethal-trifecta',
    description: 'Flag a flow where untrusted content reaches an agent that holds private data and can exfiltrate it.',
    type: 'security',
    enabled: true,
    body: `# Lethal Trifecta Gate

Flag a single traceable flow that combines all three:
1. Untrusted content (PR body, web page, file, tool output) is fed to an LLM / agent.
2. That agent can read private data (secrets, DB rows, other users' files).
3. That agent has an exfiltration path (outbound HTTP, a tool call, attacker-readable output).

## Severity
- CRITICAL when all three are present — name each with a file:line.
- WARNING when two are present and the third is one config change away.

## Not a trifecta
An authenticated endpoint returning data to its own user (request → DB → JSON) is
ordinary access control — report it as a normal finding, if at all.`,
  },
  {
    name: 'test-coverage-nudge',
    description: 'Nudge reviewers to flag changed code without corresponding test changes.',
    type: 'rubric',
    enabled: true,
    body: `# Test Coverage Nudge

For every non-trivial source file changed in the PR, verify a corresponding test file was also touched.

## Rule
- WARNING when a src/ file is changed but no test/ or *.test.* file was touched.
- SUGGESTION when the changed code is configuration-only (no logic branches).
- Exempt: migrations, generated files, type-only changes.`,
  },
  {
    name: 'uncovered-branches',
    description: 'Flag conditional branches with no corresponding test assertions.',
    type: 'rubric',
    enabled: true,
    body: `# Uncovered Branch Detector

Review each conditional in the diff and check whether the test suite exercises both sides.

## CRITICAL
- Error handler catch block with no test that triggers the error path.
- Guard clause (early return) with no test for the guard condition.

## WARNING
- Ternary with no test for the false branch.
- Default parameter with no test that omits the argument.

## How to check
Look for describe/it/test blocks in the diff for corresponding assertions.
If no test file exists for a changed source file, escalate to WARNING.`,
  },
  {
    name: 'edge-case-coverage',
    description: 'Check for missing edge-case tests: empty, null, zero, max boundary.',
    type: 'rubric',
    enabled: true,
    body: `# Edge Case Coverage Checker

Look for common missing edge cases in the test diff.

## Empty / zero / null
- Array inputs: is there a test with [] input?
- String inputs: is there a test with '' input?
- Numeric inputs: is there a test with 0 and negative values?

## Boundary
- Off-by-one: n-1, n, n+1 around known limits.
- Pagination: first page, last page, page beyond end.

## Async / concurrency
- Parallel mutations without a test that races two operations.
- Timeout / retry: is there a test that simulates the timeout path?`,
  },
  {
    name: 'mock-overuse-gate',
    description: 'Detect excessive mocking that makes tests meaningless.',
    type: 'custom',
    // Off by default (as in the course demo) — shows an attached-but-disabled skill.
    enabled: false,
    body: `# Mock Overuse Gate

Flag tests where mocking undermines the test's validity.

## CRITICAL
- The module under test is itself mocked.
- Every dependency is mocked, leaving no real code path exercised.
- A mock is set up but never asserted upon when the test's purpose is exactly that interaction.

## WARNING
- Database mocked with a static return — the real DB would reject the input.
- vi.spyOn / jest.spyOn used to silence real I/O without restoring it (test pollution).`,
  },
];

/** Agent name → skill names in prompt order. Applied only to skills the seed
 *  creates in that run, so re-seeding never re-attaches a skill the user detached. */
export const SEED_SKILL_LINKS: Record<string, string[]> = {
  'Security Reviewer': ['secret-leakage-gate', 'lethal-trifecta'],
  'Performance Reviewer': ['pr-quality-rubric', 'test-coverage-nudge'],
  'Test Quality Reviewer': ['uncovered-branches', 'edge-case-coverage', 'mock-overuse-gate'],
};
