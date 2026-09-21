/**
 * Built-in skills used by the seed. A skill is a reusable Markdown rule block
 * that a linked agent receives in its `## Skills / rules` prompt section (only
 * when the skill is enabled). `description` is a one-line directive shown in the
 * skills list. Bodies are inserted as skill v1 (`skill_versions`).
 */

export type SeedSkill = {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
};

export const TEST_COVERAGE_NUDGE_BODY = `# Test Coverage Nudge

Apply this whenever the PR adds or changes tests, or changes production code
without touching any test. Check each of these and report only what you can
ground in the diff:

1. **Uncovered branches** — every new or changed branch (if/else, switch case,
   early return, catch, ternary, fallback) must have an assertion that exercises
   it. Flag each uncovered branch by \`file:line\`.
2. **Missed edge cases** — empty, null/undefined, boundary values, error paths, and
   concurrency/ordering inputs that the new logic handles but no test drives.
3. **Excessive mocking** — mocks that assert their own setup, mocking the unit under
   test, or stubbing so much that the test can no longer fail when the real
   behaviour breaks.
4. **Flaky-test patterns** — real clocks or \`sleep\`, unseeded randomness, live
   network calls, shared mutable state between tests, and order-dependent tests.

Severity guidance: tests that only cover the happy path of NEW branching logic are a
**WARNING**. Escalate to CRITICAL only when a changed critical path (auth, money,
data integrity) is left with no meaningful test at all. A flaky-test pattern is a
WARNING; speculative gaps ("might not cover") stay at most WARNING.`;

export const FRONTEND_CONVENTIONS_BODY = `# Frontend Conventions (client/)

Apply these to changes under \`client/\`. Flag a violation only when the diff
introduces it.

- **UI imports** — import UI components only from the \`@devdigest/ui\` barrel. Never
  reach into a layer file such as \`src/vendor/ui/primitives/Button.tsx\`.
- **Colocated components** — feature UI lives in \`_components/<Name>/\` next to its
  route, and each component folder has its own \`*.test.tsx\`. Pages
  (\`page.tsx\`) stay thin.
- **Data access** — server data goes through TanStack Query hooks in
  \`src/lib/hooks\` (which call \`src/lib/api.ts\`). Components must not call
  \`fetch\` directly.
- **Strings** — user-facing text comes from \`next-intl\` messages
  (\`client/messages\`), not string literals in JSX.
- **Vendored code** — do not edit \`src/vendor/ui/**\` layer internals casually, and a
  change to \`src/vendor/shared/**\` must be mirrored into
  \`server/src/vendor/shared\`.

Severity guidance: a convention violation is a **WARNING** (or SUGGESTION when
cosmetic). It is CRITICAL only if it also causes a real defect, e.g. a direct
\`fetch\` that bypasses the shared API base and breaks the deployed app.`;

export const API_CONTRACT_GATE_BODY = `# API Contract Gate

Flag breaking changes to an HTTP route contract. Look for:

- a changed or removed route path or HTTP method;
- request or response fields that are renamed, removed, retyped, or made nullable;
- tightened request validation (a previously accepted payload now rejected);
- changed status codes or error shapes that callers branch on.

Pay special attention to \`server/src/modules/*/routes.ts\` and the vendored
\`@devdigest/shared\` contracts, which must be mirrored by hand into both
\`server/src/vendor/shared\` and \`client/src/vendor/shared\` — a change to only
one side is itself a contract break.

Severity guidance: a breaking change with no compatible migration path (an alias,
a deprecation window, a versioned route, or an updated caller in the same PR) is
a **WARNING**. Use **CRITICAL** only when you can name a caller present in this
repo that the change demonstrably breaks. Additive, backwards-compatible changes
are fine and should not be reported.`;

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'test-coverage-nudge',
    description:
      'Flag untested branches, missed edge cases, over-mocking and flaky tests in test changes.',
    type: 'custom',
    body: TEST_COVERAGE_NUDGE_BODY,
  },
  {
    name: 'frontend-conventions',
    description:
      'Enforce client/ conventions: @devdigest/ui barrel imports, colocated components, query hooks, next-intl strings.',
    type: 'convention',
    body: FRONTEND_CONVENTIONS_BODY,
  },
  {
    name: 'api-contract-gate',
    description:
      'Flag breaking changes to HTTP route contracts and vendored shared schemas without a compatible migration path.',
    type: 'security',
    body: API_CONTRACT_GATE_BODY,
  },
];
