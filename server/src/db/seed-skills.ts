/**
 * Built-in skills used by the seed. A skill is a reusable Markdown rule block
 * that a linked agent receives in its `## Skills / rules` prompt section (only
 * when the skill is enabled). `description` is a one-line directive shown in the
 * skills list. Bodies are inserted as skill v1 (`skill_versions`).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SeedSkill = {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  /** Origin recorded on the skills row; defaults to `manual` when omitted. */
  source?: 'manual' | 'extracted';
  body: string;
};

export const TEST_COVERAGE_NUDGE_BODY = `# Test Coverage Nudge

## Rule
A test earns its place only if it fails when the behaviour it covers breaks. Every
new or changed branch, and every boundary in the changed production code, needs an
assertion that drives it. A test that only walks the happy path of new branching
logic leaves both the branches and the boundaries unprotected.

## Directive
Apply this whenever the PR adds or changes tests, or changes production code
without touching any test. Check each of these and report only what you can
ground in the diff:

1. **Uncovered branches** — list every branch the diff adds or changes (if/else,
   switch case, guard clause that throws, early return, catch, ternary, \`??\`/\`||\`
   fallback). For each one, look for a test in the diff that passes an input taking
   that path and asserts the outcome. Flag every branch with no such test by
   \`file:line\` of the branch, and name the input that would reach it.
2. **Boundary cases** — for every comparison or limit in the changed code (\`<\`,
   \`<=\`, \`>\`, \`>=\`, \`===\`, length/size/count limits, ranges, clamps), require
   tests at the boundary itself and one step on each side (for \`pct > 100\`: 99, 100,
   101; for \`n < 0\`: -1, 0, 1). Flag each boundary no test drives, and name the
   missing values.
3. **Missed edge cases** — empty collections, null/undefined, zero, max/min values,
   error paths (thrown errors, rejected promises), and concurrency/ordering inputs
   that the new logic handles but no test drives.
4. **Excessive mocking** — mocks that assert their own setup, mocking the unit under
   test, or stubbing so much that the test can no longer fail when the real
   behaviour breaks.
5. **Flaky-test patterns** — real clocks or \`sleep\`, unseeded randomness, live
   network calls, shared mutable state between tests, and order-dependent tests.

Report each uncovered branch and each untested boundary as its own finding, because
each needs its own test, but do not repeat the same gap twice.

Severity guidance: tests that only cover the happy path of NEW branching logic are a
**WARNING**. Escalate to CRITICAL only when a changed critical path (auth, money,
data integrity) is left with no meaningful test at all. A flaky-test pattern is a
WARNING; speculative gaps ("might not cover") stay at most WARNING.

## Bad
Two guard branches with two boundaries are added, and one happy-path assertion is
the only test: the \`n < 1\` and \`n > 99\` branches never run, and 0/1 and 99/100 are
never tried.

\`\`\`ts
export function clampQty(n: number): number {
  if (n < 1) return 1;
  if (n > 99) return 99;
  return n;
}

it('keeps a valid quantity', () => {
  expect(clampQty(5)).toBe(5);
});
\`\`\`

## Good
Every branch is reached and each boundary is tried on both sides.

\`\`\`ts
it.each([
  [-1, 1], [0, 1], [1, 1], // lower boundary and one step either side
  [5, 5],
  [99, 99], [100, 99], [101, 99], // upper boundary and one step either side
])('clampQty(%i) is %i', (input, expected) => {
  expect(clampQty(input)).toBe(expected);
});
\`\`\``;

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

/**
 * API Contract Reviewer skills. The Markdown files under
 * `docs/agent-skills/api-contract-reviewer/` are the single source of truth; they
 * are read here at module load (front-matter -> name/description, rest -> body), so
 * there is no second copy to drift. A missing/malformed file throws immediately
 * rather than seeding a half-empty skill.
 */
const API_CONTRACT_SKILLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'agent-skills',
  'api-contract-reviewer',
);

function loadSkillFile(
  file: string,
  type: SeedSkill['type'],
  source: SeedSkill['source'] = 'manual',
): SeedSkill {
  const raw = readFileSync(join(API_CONTRACT_SKILLS_DIR, file), 'utf8')
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n/.exec(raw);
  if (!m) throw new Error(`seed-skills: ${file} has no front-matter block`);
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  const expected = file.replace(/\.md$/, '');
  if (meta.name !== expected) {
    throw new Error(`seed-skills: ${file} front-matter name "${meta.name}" != "${expected}"`);
  }
  if (!meta.description) throw new Error(`seed-skills: ${file} has no description`);
  const body = raw.slice(m[0].length).replace(/^\n+/, '').trimEnd();
  if (!body) throw new Error(`seed-skills: ${file} has an empty body`);
  return { name: expected, description: meta.description, type, source, body };
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'test-coverage-nudge',
    description:
      'Flag untested branches and boundary cases, missed edge cases, over-mocking and flaky tests in test changes.',
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
  // API Contract Reviewer skills, linked in this order (see seed.ts).
  loadSkillFile('breaking-change.md', 'security'),
  loadSkillFile('response-schema.md', 'convention'),
  loadSkillFile('semver-discipline.md', 'convention'),
  // Seeded as `extracted` (= file-imported): its content is exactly what the
  // From-file import of docs/agent-skills/.../deprecation-policy.md would create.
  // The origin is set by this seed script; the UI import in the experiment
  // runbook is the real demonstration of the import flow.
  loadSkillFile('deprecation-policy.md', 'convention', 'extracted'),
];
