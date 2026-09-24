/**
 * The curated community skill catalog, SHIPPED WITH THE SERVER (Rules §9):
 * searching and importing make no network call. Every entry was written and
 * reviewed for this product (attribution: `repo`); `stars` is 0 because the
 * entries are not mirrored from a public repository.
 *
 * Importing an entry goes through the same preview → confirm flow as any
 * foreign skill and lands DISABLED (`source='community'`,
 * `source_ref='community:<id>'`).
 */
import type { CommunityCatalog } from '../application/ports.js';
import type { CatalogEntry } from '../domain/catalog.js';

const REPO = 'devdigest/community-skills';

const ENTRIES: readonly CatalogEntry[] = [
  {
    id: 'owasp-top-10-review',
    name: 'owasp-top-10-review',
    repo: REPO,
    stars: 0,
    lang: 'any',
    type: 'security',
    tags: ['security', 'owasp', 'web'],
    desc: 'Checks changed server code against the OWASP Top 10 web risks.',
    description:
      'Flag server-side changes that introduce an OWASP Top 10 risk: broken access control, injection, SSRF, insecure design, security misconfiguration or vulnerable data handling.',
    body: `Review every changed request handler, query and outbound call against the
OWASP Top 10 (2021). Report a finding only when the diff itself introduces or
widens the risk, and name the category in the title (e.g. "A01 Broken access control").

- **A01 Broken access control** — a handler reads or writes a resource by id
  without checking that the caller owns it (tenant / workspace / user scope).
- **A02 Cryptographic failures** — secrets or tokens logged, stored in plain text,
  compared with \`===\` instead of a constant-time compare, weak hashes (MD5/SHA-1)
  for passwords.
- **A03 Injection** — SQL, shell, template or LDAP built by string concatenation
  from request data.
- **A04 Insecure design** — a sensitive action (delete, payout, role change) with
  no rate limit, confirmation or audit trail.
- **A05 Security misconfiguration** — CORS \`*\` with credentials, debug endpoints,
  verbose errors that echo stack traces or SQL.
- **A07 Identification and authentication failures** — session or JWT not validated
  (\`alg: none\`, missing expiry check).
- **A08 Software and data integrity failures** — deserializing untrusted data into
  objects, \`eval\` / \`new Function\` on input.
- **A10 SSRF** — the server fetches a user-supplied URL without an allow-list or a
  private-address check.

Severity: CRITICAL when the defect is reachable from an unauthenticated or
cross-tenant request; WARNING when it needs an authenticated user or a
misconfiguration; never report a category just because the file is security-related.`,
  },
  {
    id: 'sql-injection-gate',
    name: 'sql-injection-gate',
    repo: REPO,
    stars: 0,
    lang: 'sql',
    type: 'security',
    tags: ['security', 'sql', 'database'],
    desc: 'Blocks SQL built from untrusted input instead of bound parameters.',
    description:
      'Flag SQL that is assembled from request, env or model data by string concatenation or template interpolation instead of bound parameters.',
    body: `Trace every value that reaches a SQL string back to its origin. Flag it when
untrusted data (request params/body/headers, webhook payloads, LLM output, file
contents) is concatenated or interpolated into the statement text.

Report as CRITICAL:
- \`\` \`SELECT … WHERE id = \${req.params.id}\` \`\` passed to a raw query API
  (\`sql.unsafe\`, \`db.execute(string)\`, \`knex.raw\` without bindings, \`query(text)\`).
- Dynamic \`ORDER BY\` / column / table names taken from input without an allow-list.
- \`LIKE\` patterns built from input without escaping \`%\` and \`_\` (WARNING when
  only the pattern semantics change, CRITICAL when it becomes an injection).

Do NOT flag:
- Tagged templates that bind parameters (the postgres-js or Drizzle \`sql\` tag),
  \`$1\` placeholders with a values array.
- Query-builder calls (\`eq(col, value)\`, \`.where({ id })\`).
- Identifiers that come from a hard-coded constant or a closed enum.

Suggest the parameterised form in the finding's suggestion.`,
  },
  {
    id: 'react-hooks-rules',
    name: 'react-hooks-rules',
    repo: REPO,
    stars: 0,
    lang: 'typescript',
    type: 'convention',
    tags: ['react', 'frontend', 'hooks'],
    desc: 'Enforces the Rules of Hooks and effect-dependency hygiene.',
    description:
      'Flag React components or custom hooks in the diff that break the Rules of Hooks or use effects with missing, stale or unnecessary dependencies.',
    body: `Apply to changed \`.tsx\` / \`.jsx\` files and custom hooks (\`use*\` functions).

Report as CRITICAL (these are runtime bugs):
- A hook called conditionally, inside a loop, after an early \`return\`, or inside a
  nested function / event handler.
- A hook called from a plain function that is neither a component nor a \`use*\` hook.

Report as WARNING:
- \`useEffect\` / \`useMemo\` / \`useCallback\` that reads a prop, state or function
  missing from its dependency array (stale closure), or silences the lint rule.
- An effect that sets state derived purely from props/state (should be computed
  during render or with \`useMemo\`).
- An effect that subscribes, sets a timer or starts a fetch with no cleanup /
  abort on unmount or dependency change.
- Objects or arrays created inline and passed as a dependency, causing the effect
  to run on every render.

Report as SUGGESTION:
- \`useEffect\` used to respond to a user event that could run in the handler.

Do not flag server components that use no hooks.`,
  },
  {
    id: 'a11y-jsx-audit',
    name: 'a11y-jsx-audit',
    repo: REPO,
    stars: 0,
    lang: 'typescript',
    type: 'rubric',
    tags: ['accessibility', 'a11y', 'react', 'frontend'],
    desc: 'Catches accessibility regressions in changed JSX.',
    description:
      'Flag changed JSX that makes the UI unusable with a keyboard or a screen reader: missing names, non-semantic click targets, lost focus handling.',
    body: `Check every changed JSX element against WCAG 2.2 AA basics. Cite the exact
element line.

WARNING:
- \`<img>\` without \`alt\` (decorative images use \`alt=""\`).
- Icon-only \`<button>\` / link without \`aria-label\` or visually hidden text.
- \`onClick\` on a \`div\` / \`span\` without \`role\`, \`tabIndex={0}\` and a key handler —
  prefer a real \`<button>\`.
- Form controls without an associated \`<label>\` (\`htmlFor\` / wrapping) or
  \`aria-label\`.
- A modal/dialog that does not move focus into itself or return it on close.
- \`outline: none\` / \`focus:outline-none\` without a visible replacement focus style.

SUGGESTION:
- Heading levels that skip (h2 → h4) in the changed markup.
- Colour used as the only signal of state (error, selected) with no text or icon.
- \`aria-*\` attributes that duplicate native semantics (\`role="button"\` on \`<button>\`).

Never report CRITICAL for accessibility unless the change removes the only way
to complete a primary flow with a keyboard.`,
  },
  {
    id: 'error-handling-discipline',
    name: 'error-handling-discipline',
    repo: REPO,
    stars: 0,
    lang: 'typescript',
    type: 'convention',
    tags: ['reliability', 'errors', 'node'],
    desc: 'Finds swallowed errors, floating promises and lost causes.',
    description:
      'Flag changed code that swallows errors, leaves promises unhandled, or rethrows without the original cause so failures become silent or undiagnosable.',
    body: `Follow each changed \`try\` / \`catch\`, \`.catch()\` and async call.

WARNING:
- \`catch {}\` or \`catch (e) { return null }\` on a path whose failure the caller must
  know about (payments, writes, auth) — the error disappears.
- A promise that is neither awaited, returned nor explicitly \`void\`-ed with a
  \`.catch\` (floating promise) — an unhandled rejection can crash the process.
- \`throw new Error(msg)\` inside a \`catch\` without \`{ cause: err }\`: the stack of the
  real failure is lost.
- Logging an error AND rethrowing it at every layer (the same failure is logged
  N times).
- \`Promise.all\` over independent side effects where one failure should not
  abandon the others (\`Promise.allSettled\`).

SUGGESTION:
- Error messages that echo secrets, SQL or full request bodies to the client.

CRITICAL only when the swallowed error leads to data loss or a wrong success
response on a money / security path.`,
  },
  {
    id: 'input-validation-boundaries',
    name: 'input-validation-boundaries',
    repo: REPO,
    stars: 0,
    lang: 'typescript',
    type: 'security',
    tags: ['security', 'validation', 'api'],
    desc: 'Requires schema validation where untrusted data enters the system.',
    description:
      'Flag new request handlers, webhooks, queue consumers or LLM-output parsers in the diff that use untrusted data without schema validation at the boundary.',
    body: `Untrusted data must be parsed once, at the edge, into a typed value.

WARNING:
- A new route / webhook / consumer that reads \`req.body\`, \`req.query\`, headers or a
  message payload without a schema (zod, JSON Schema, valibot…) — or casts it
  with \`as SomeType\`.
- \`JSON.parse\` of external or model output used without validating the shape.
- Numeric input used as a size, limit, offset or timeout without bounds (can be
  negative, huge or \`NaN\`).
- File names or paths from input joined into a filesystem path without
  normalising and checking the result stays inside the intended directory.

CRITICAL:
- The unvalidated value reaches SQL, a shell command, a file path, a redirect URL
  or an authorisation decision.

Do NOT flag internal function calls between already-validated layers.`,
  },
  {
    id: 'test-assertion-quality',
    name: 'test-assertion-quality',
    repo: REPO,
    stars: 0,
    lang: 'any',
    type: 'rubric',
    tags: ['testing', 'quality'],
    desc: 'Flags tests that cannot fail or assert nothing meaningful.',
    description:
      'Flag new or changed tests whose assertions cannot fail, only check that code ran, or restate the implementation instead of the expected behaviour.',
    body: `Read each changed test and ask: "which bug in the code under test would make
this test fail?" If the answer is "none", report it.

WARNING:
- No assertion at all, or only \`expect(fn).not.toThrow()\` / \`toBeDefined()\` on a value
  that is always defined.
- Tautologies: asserting a mock returns what the test just told it to return;
  computing the expected value with the same function under test.
- Snapshot tests of large objects added without a reviewed, meaningful snapshot.
- \`expect\` inside a callback or \`.then\` that is never awaited, so the test finishes
  before the assertion runs.
- Error-path tests that catch the error and assert nothing about its type/code.

SUGGESTION:
- One test asserting many unrelated behaviours (split it so a failure names the
  broken behaviour).
- Magic numbers in expectations with no hint where they come from.

Category: \`test\`. Never CRITICAL.`,
  },
  {
    id: 'async-test-hygiene',
    name: 'async-test-hygiene',
    repo: REPO,
    stars: 0,
    lang: 'typescript',
    type: 'rubric',
    tags: ['testing', 'flaky', 'async'],
    desc: 'Catches timing-dependent async tests before they turn flaky.',
    description:
      'Flag tests in the diff that depend on real time, sleeps, execution order or shared state, so they pass locally and fail intermittently in CI.',
    body: `Flag the pattern, and in the suggestion name the deterministic alternative.

WARNING:
- \`setTimeout\` / \`sleep(n)\` used to "wait for" async work — await the promise, poll
  a condition with a timeout, or use fake timers.
- Assertions on \`Date.now()\` / \`new Date()\` without a fixed clock.
- Tests that share mutable module state or a DB row and pass only in file order
  (no reset in \`beforeEach\`).
- Parallel promises whose completion order is asserted.
- Real network, DNS or current-directory dependence in a unit test.
- Random data without a fixed seed that decides a branch.

SUGGESTION:
- Very long per-test timeouts added to make a slow test pass.

Category: \`test\`. Never CRITICAL.`,
  },
];

export const builtInCommunityCatalog: CommunityCatalog = {
  list: () => ENTRIES,
  get: (id) => ENTRIES.find((e) => e.id === id),
};
