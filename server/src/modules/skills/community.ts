import type { CommunitySkill, SkillType } from '@devdigest/shared';

/**
 * The community catalog is BUNDLED, not fetched.
 *
 * "Search community skills" in the UI searches this list and nothing else: no
 * request leaves the machine, so the import path stays reproducible offline and
 * a demo cannot be broken by a rate limit or a repo that moved. The repo/stars
 * fields are catalog metadata shipped with the product, not a live GitHub read
 * — the UI says so, because a number that looks live and is not is worse than
 * no number at all.
 *
 * Each entry carries its full body: importing one goes through exactly the same
 * preview-then-confirm path as a file upload, and lands DISABLED like any other
 * third-party text.
 */

export interface CatalogEntry extends CommunitySkill {
  type: SkillType;
  body: string;
}

export const COMMUNITY_CATALOG: readonly CatalogEntry[] = [
  {
    id: 'owasp-top-10-review',
    name: 'owasp-top-10-review',
    repo: 'secdev/agent-skills',
    stars: 1240,
    lang: 'any',
    desc: 'Maps diff changes to the OWASP Top 10 with CWE references.',
    type: 'security',
    body: `# OWASP Top 10 review

Map each risky change in the diff onto the OWASP Top 10 (2021) and name the
CWE. Report a finding only when the diff itself shows the weakness — never on
suspicion about code you cannot see.

## What to check
- **A01 Broken access control** — a handler that reads an id from the request
  and never checks ownership or role.
- **A02 Cryptographic failures** — home-made crypto, ECB mode, a hard-coded IV,
  a secret in a literal.
- **A03 Injection** — string-built SQL, shell, or template; unescaped HTML.
- **A05 Security misconfiguration** — CORS \`*\` with credentials, disabled TLS
  verification, debug endpoints.
- **A08 Software and data integrity** — deserializing untrusted input, running
  a downloaded artifact without verification.
- **A10 SSRF** — an outbound request whose URL comes from user input.

## How to report
Title: \`<CWE-id>: <what an attacker does>\`. Severity CRITICAL when the diff is
exploitable as written, WARNING when it needs a precondition the code does not
guarantee. Always cite the exact \`file:line\` from the diff.`,
  },
  {
    id: 'react-hooks-rules',
    name: 'react-hooks-rules',
    repo: 'frontend-guild/skills',
    stars: 842,
    lang: 'TypeScript',
    desc: 'Detects conditional hooks, missing deps, stale closures.',
    type: 'convention',
    body: `# React hooks rules

Flag hook misuse that the compiler cannot catch.

- A hook called inside a condition, loop, early-return branch or callback.
- \`useEffect\` whose dependency array omits a value it reads, or lists a value
  it does not use.
- A stale closure: an effect or callback that captures state and is never
  re-created when that state changes.
- \`useState\` initialised from a prop and never synchronised afterwards, where
  the prop is expected to change.
- A cleanup function missing from an effect that subscribes, opens a timer, or
  starts a request.

Report each with the exact \`file:line\` and the smallest fix that restores the
rule — usually adding the dependency, not removing the read.`,
  },
  {
    id: 'sql-injection-gate',
    name: 'sql-injection-gate',
    repo: 'secdev/agent-skills',
    stars: 690,
    lang: 'any',
    desc: 'Flags string-concatenated SQL and unparameterized queries.',
    type: 'security',
    body: `# SQL injection gate

Any query whose text is built from a value that is not a bound parameter is a
CRITICAL finding, even when the value "looks internal".

Flag:
- String concatenation or template literals inside \`query\`, \`execute\`, \`raw\`,
  \`sql.raw\`, \`knex.raw\`, \`$queryRawUnsafe\`.
- An ORM escape hatch that takes a fragment built at runtime.
- An identifier (table, column, ORDER BY direction) interpolated from input —
  parameters cannot bind identifiers, so this needs an allow-list instead.

Do not flag a parameterized query just because the values come from a request:
that is the point of parameters. Quote the built string in the rationale and
give the parameterized rewrite as the suggestion.`,
  },
  {
    id: 'flaky-test-heuristics',
    name: 'flaky-test-heuristics',
    repo: 'testing-guild/skills',
    stars: 517,
    lang: 'any',
    desc: 'Detects timing, ordering and shared-state sources of flaky tests.',
    type: 'custom',
    body: `# Flaky test heuristics

A test that can fail without the code changing is a defect in the test. Flag
these patterns in added or modified tests:

- **Time** — \`sleep\`/\`setTimeout\` used as synchronisation; an assertion on
  \`Date.now()\`, a duration, or a timestamp formatted in the local timezone.
- **Order** — state written in one test and read in another; a module-level
  \`let\` mutated inside a test; reliance on the order of an unsorted query or of
  \`Object.keys\`.
- **Concurrency** — a promise started and never awaited; a race between a fake
  timer and a real one; an unmocked interval left running after the test.
- **Environment** — a real network or filesystem call; a hard-coded port; a
  random value without a fixed seed.

Report the failure mode, not the style: say what would make it red on a slow
CI machine. Severity WARNING, or CRITICAL when the test guards a security or
data-integrity behaviour and could pass while that behaviour is broken.`,
  },
  {
    id: 'a11y-jsx-audit',
    name: 'a11y-jsx-audit',
    repo: 'a11y-collective/skills',
    stars: 318,
    lang: 'TypeScript',
    desc: 'Checks JSX for missing alt text, ARIA, and focus traps.',
    type: 'custom',
    body: `# Accessibility audit for JSX

Check changed JSX for barriers a keyboard or screen-reader user would hit:

- An \`<img>\` without \`alt\` (decorative images need \`alt=""\`, not a missing
  attribute).
- A click handler on a \`div\`/\`span\` with no \`role\`, \`tabIndex\` and key handler.
- A form control with no label, \`aria-label\` or \`aria-labelledby\`.
- A modal/drawer that does not move focus in, restore it on close, or close on
  \`Escape\`.
- Colour used as the only carrier of meaning (status shown by colour alone).

Cite \`file:line\` and give the minimal attribute-level fix.`,
  },
];

/** Case-insensitive search over name/description, plus an optional language filter. */
export function searchCatalog(q?: string, lang?: string): CommunitySkill[] {
  const needle = q?.trim().toLowerCase();
  return COMMUNITY_CATALOG.filter((e) => {
    const matchesLang = !lang || lang === 'any' || e.lang.toLowerCase() === lang.toLowerCase();
    const matchesQuery =
      !needle ||
      e.name.toLowerCase().includes(needle) ||
      e.desc.toLowerCase().includes(needle) ||
      e.type.includes(needle);
    return matchesLang && matchesQuery;
  }).map(({ id, name, repo, stars, lang: l, desc }) => ({ id, name, repo, stars, lang: l, desc }));
}

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return COMMUNITY_CATALOG.find((e) => e.id === id);
}
