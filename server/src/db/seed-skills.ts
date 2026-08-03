/**
 * Built-in skill catalogue used by the seed.
 *
 * A skill is reviewer instructions and NOTHING else — no code, no tools, no
 * execution. Each body below is concatenated verbatim into the review prompt's
 * `## Skills / rules` section, at the same trust level as the agent's system
 * prompt. Keep them short: every line is tokens on every run.
 *
 * `description` is written imperatively on purpose — it is the skill's
 * interface, the sentence that tells a reader (and, once selection becomes
 * dynamic, the router) when the skill applies.
 *
 * NOT seeded here: `api-contract-guard`. It is imported through the UI's
 * preview-then-confirm flow so the import path gets exercised end to end.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  enabled: boolean;
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
    type: 'rubric',
    source: 'manual',
    enabled: true,
    body: `# PR Quality Rubric

Evaluate the pull request against the following dimensions. For each, return a
finding only when the issue is **worth the author's time** — aim for 5
high-signal findings, not 50.

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
- Does the diff do only what it says, or has unrelated work crept in?`,
  },
  {
    name: 'no-then-chains',
    description: 'Flag promise .then() chains; require async/await in new code.',
    type: 'convention',
    source: 'extracted',
    enabled: true,
    body: `# House rule: async/await over .then()

This codebase uses \`async\`/\`await\` everywhere. Flag any NEW code in the diff
that chains \`.then()\`, \`.catch()\`, or \`.finally()\` on a promise.

Do NOT flag:
- \`.catch()\` used as a deliberate fire-and-forget suppressor on a best-effort
  side effect (e.g. \`void write().catch(() => undefined)\`),
- existing lines the diff merely moves or reindents.`,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Detect hardcoded credentials and keys committed in the diff.',
    type: 'security',
    source: 'community',
    enabled: true,
    body: `# Secret leakage gate

Flag any credential literal introduced by this diff, at CRITICAL severity:

- Provider keys: \`sk_live_\`, \`sk_test_\`, \`AKIA\`, \`ghp_\`, \`xoxb-\`, \`service_role\`
- Anything assigned to a name containing \`secret\`, \`token\`, \`password\`,
  \`api_key\`, \`private_key\` whose value is a string literal
- A \`NEXT_PUBLIC_\` variable holding something that is not safe to ship to a browser

A committed secret is CRITICAL even when the value looks like a placeholder —
if it is real, rotation is the only fix, and that decision belongs to a human.`,
  },
  {
    name: 'lethal-trifecta',
    description:
      'Flag changes that combine private data access, untrusted input, and an exfiltration path.',
    type: 'security',
    source: 'community',
    enabled: true,
    body: `# The lethal trifecta

A change is dangerous when it brings together all THREE of:

1. **Private data access** — reads secrets, user records, internal APIs, the filesystem
2. **Untrusted input** — request bodies, PR/issue text, scraped pages, model output
3. **An exfiltration path** — outbound HTTP, logging, a webhook, writing somewhere shared

Any two of these are ordinary. All three in one code path is the pattern behind
most agent data-leak incidents. When you find all three, report ONE finding that
names each leg and cites the line where it enters.`,
  },
  {
    name: 'phantom-api-gate',
    description: 'Detect calls to functions or modules that do not exist in the repository.',
    type: 'security',
    source: 'imported_url',
    // Imported from an untrusted source and left OFF until a human vets it.
    // This is the seeded example of the vetting gate — the rail card shows a
    // "needs vetting" badge and the skill reaches no prompt while it is false.
    enabled: false,
    body: `# Phantom API gate

Flag any call in the diff to a function, method, or module that does not exist
in this repository or in its declared dependencies.

Hallucinated imports are the most common way generated code fails at runtime
rather than at review time. Cite the import line and the call site.`,
  },
  {
    name: 'test-coverage-nudge',
    description: 'Flag branches introduced by the diff that no test exercises.',
    type: 'custom',
    source: 'manual',
    enabled: true,
    body: `# Uncovered branch check

For every branch this diff INTRODUCES — \`if\`, \`else\`, \`switch\` case, ternary,
\`catch\`, early return, optional chain that can short-circuit — ask whether any
test in the diff exercises it.

Report a finding for each branch with no covering assertion. Name the branch and
the line, and say which input would reach it.

A test that only walks the happy path through a function with an error branch is
exactly this finding: the error branch is untested. Do not accept "the happy
path is tested" as coverage of a conditional.`,
  },
  {
    name: 'corner-case-checklist',
    description: 'Check tests for boundary, empty, null, and error-path cases.',
    type: 'custom',
    source: 'manual',
    enabled: true,
    body: `# Corner-case checklist

Walk the tests added by this diff against this list and report what is missing:

- **Boundaries** — 0, 1, n-1, n, n+1; first and last element; exactly-at-limit
- **Empty** — empty string, empty array, empty object, no rows returned
- **Absent** — null, undefined, a missing optional field
- **Error paths** — the throw, the rejected promise, the non-2xx response
- **Ordering** — does the assertion depend on an order the code does not guarantee?

Report the specific missing case, not "add more tests".`,
  },
  {
    name: 'mock-discipline',
    description: 'Flag over-mocking, mocking the unit under test, and order- or time-dependent tests.',
    type: 'convention',
    source: 'manual',
    enabled: true,
    body: `# Mock discipline

Flag tests in the diff that:

- **Mock the unit under test** — the assertion then verifies the mock, not the code
- **Over-mock** — so much is stubbed that the test would pass even if the real
  implementation were deleted
- **Depend on wall-clock time** — \`Date.now()\`, \`setTimeout\`, or a sleep, without
  fake timers; these are the flakes that fail only in CI
- **Depend on execution order** — shared mutable state between tests, or an
  assertion that relies on the previous test having run

For each, say what the test would still pass with, to make the gap concrete.`,
  },
];

/**
 * Which seeded agent gets which skills, in prompt order. Names, not ids —
 * resolved at seed time.
 *
 * `api-contract-guard` is deliberately absent: it is imported live in the UI
 * and attached to Test Quality Reviewer as its fourth skill.
 */
export const SEED_AGENT_SKILLS: Record<string, string[]> = {
  'Security Reviewer': ['pr-quality-rubric', 'secret-leakage-gate', 'lethal-trifecta'],
  'Test Quality Reviewer': ['test-coverage-nudge', 'corner-case-checklist', 'mock-discipline'],
};
