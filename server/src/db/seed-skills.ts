import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Starter skills for a freshly seeded workspace.
 *
 * These are the reusable instruction blocks the built-in agents link to. They
 * are deliberately SPECIFIC where the agent prompts are general: an agent prompt
 * says "review test quality", the skill says "a new branch with no test that
 * takes it is a WARNING". That split is what makes the with-skills /
 * without-skills comparison meaningful — the marginal signal comes from here.
 *
 * `test-coverage-nudge` from the design mock is deliberately NOT seeded: it is
 * the one created by hand in the UI, so the create path gets exercised for real.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Score every PR on the four axes below and justify the score in the summary.',
    type: 'rubric',
    source: 'manual',
    body: `# PR quality rubric

Score the PR 0-100 as the weighted sum of four axes. State the per-axis scores in
the summary so the author can see where the number came from.

| Axis | Weight | 100 looks like | 0 looks like |
|---|---|---|---|
| Correctness | 40% | Every branch behaves as the PR claims | A reachable path is plainly wrong |
| Tests | 25% | New behaviour is covered, including its failure paths | New logic ships untested |
| Clarity | 20% | Names and structure explain the intent without comments | Reader must reconstruct the intent |
| Scope | 15% | One coherent change | Unrelated refactors ride along |

Rules:
- Never award an axis full marks "by default" — cite the diff line that earns it.
- A CRITICAL finding caps the total at 60, whatever the other axes say.`,
  },
  {
    name: 'no-then-chains',
    description: 'Flag promise chains in new code; this codebase uses async/await everywhere.',
    type: 'convention',
    source: 'manual',
    body: `# No .then() chains

This codebase is async/await throughout. In code ADDED by the diff:

- \`.then()\` / \`.catch()\` / \`.finally()\` chains are a WARNING. Rewrite with
  \`await\` and \`try\`/\`catch\`.
- \`.forEach\` with an async callback is a WARNING: it does not await, so errors are
  unhandled and ordering is not what it looks like. Use \`for...of\` with \`await\`,
  or \`Promise.all(list.map(...))\` when the work is genuinely parallel.
- A floating promise — a call returning a promise that is neither awaited nor
  explicitly \`void\`-ed — is a WARNING.

Do not flag \`.then()\` in code the diff merely moves without changing.`,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Treat any credential-shaped literal added by the diff as a CRITICAL finding.',
    type: 'security',
    source: 'manual',
    body: `# Secret leakage gate

A credential-shaped literal ADDED by this diff is always CRITICAL, even in a test,
fixture, example or comment — committed secrets must be rotated regardless of where
they sit, so the finding is about the commit, not the call site.

Patterns to treat as credentials:
- \`sk_live_\` / \`sk_test_\` / \`pk_live_\` (Stripe), \`AKIA[0-9A-Z]{16}\` (AWS),
  \`AIza[0-9A-Za-z_-]{35}\` (Google), \`gh[ps]_[A-Za-z0-9]{36,}\` (GitHub),
  \`xox[bpsa]-\` (Slack), \`npm_[A-Za-z0-9]{36}\`.
- \`-----BEGIN ... PRIVATE KEY-----\`.
- A connection string with inline credentials: \`postgres://user:pass@host\`.
- Any assignment to a name containing \`secret\`, \`token\`, \`password\` or \`apikey\`
  whose right-hand side is a string literal of 8+ characters.

In the suggestion, always say BOTH steps: move it to configuration AND rotate the
exposed credential. Never quote the full secret back in the finding — cite the line.`,
  },
  {
    name: 'lethal-trifecta',
    description:
      'Report a CRITICAL when one code path combines private data, untrusted input and an external channel.',
    type: 'security',
    source: 'manual',
    body: `# Lethal trifecta

Report a CRITICAL when a SINGLE reachable path in this diff combines all three:

1. **Private data** — secrets, credentials, user PII, internal-only records.
2. **Untrusted input** — request bodies/params, webhook payloads, PR text, file
   contents, model output, anything fetched from a URL a user supplied.
3. **An external channel** — an outbound HTTP request, an email or message, a
   write to a shared log, a rendered response to another party.

Any two of the three is a WARNING; all three is CRITICAL, because untrusted input
can then steer private data out of the system.

In the rationale, name each of the three with its file and line, and describe the
path from input to exfiltration in one sentence. Prefer the fix that removes a leg
of the triangle entirely over one that merely filters the input.`,
  },
  {
    name: 'phantom-api-gate',
    description: 'Verify that every API, flag or field the diff calls actually exists in the repo.',
    type: 'security',
    source: 'manual',
    body: `# Phantom API gate

Code that calls something which does not exist fails at run time, not at review
time, and it is the most common way generated code breaks.

For each symbol the diff CALLS but does not define — a function, method, option,
config key, env var, CLI flag, or response field it reads — check whether the diff
or the surrounding context shows it existing. When it does not:

- Report a CRITICAL if the call is on a path that always runs.
- Report a WARNING if it is on a rare or error-only path.

Be honest about uncertainty: if the symbol plausibly exists elsewhere in the repo
and you simply cannot see it, do not report it. This gate is for calls that look
invented — a plausible-sounding option that no code in view ever defines.`,
  },
  {
    name: 'test-quality-rubric',
    description:
      'For every branch the diff adds, require a test that takes it; name the uncovered branch.',
    type: 'rubric',
    source: 'manual',
    body: `# Test quality rubric

Work from the PRODUCTION code in the diff, not from the test file. For each unit
the diff adds or changes:

1. **Enumerate the branches.** Every \`if\`/\`else\`, \`try\`/\`catch\`, early return,
   ternary, guard clause, \`switch\` case, and every \`throw\`.
2. **Match each branch to a test that takes it.** A branch with no matching test is
   a WARNING; cite the PRODUCTION line of the uncovered branch, not the test file.
   If the unit has no test at all, that is CRITICAL.
3. **Check the boundaries** of every numeric or length comparison the diff adds:
   zero, negative, the exact limit, and one past the limit. A guard tested only
   with a comfortably valid value is a WARNING.
4. **Check the failure paths.** A rejected promise, a thrown error or a non-2xx
   response that no test asserts on is a WARNING.

A test suite that exercises only the success path of new code is never "good
coverage", regardless of the line-coverage number — say so explicitly in the
summary when that is what you find.`,
  },
  {
    name: 'api-contract-gate',
    description:
      'Compare changed route signatures against their previous form and report breaking changes.',
    type: 'convention',
    source: 'manual',
    body: `# API contract gate

For every route handler or shared schema the diff touches, diff the OLD signature
against the NEW one, field by field, and classify each difference:

**Breaking (CRITICAL)** — an existing caller that does not change starts failing:
- a parameter added as required, or made required after being optional;
- a parameter, response field or enum member removed or renamed;
- a type narrowed (string → enum, wider range → narrower, nullable → non-null);
- a path, method or status code changed;
- a default value changed so existing behaviour silently differs.

**Silent (WARNING)** — same shape, different meaning: pagination defaults,
ordering, rounding, timezone, null-vs-absent.

**Safe** — a new optional parameter with a default, a new response field, an
entirely new route.

Always name the caller that breaks and how, e.g. "a client that omits \`currency\`
now receives 422 where it previously defaulted to USD". Offer the compatible
alternative: keep it optional with the old default, add a field alongside rather
than renaming, or version the route.`,
  },
];
