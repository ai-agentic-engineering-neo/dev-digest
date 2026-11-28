# What may be rated CRITICAL

A reviewer may rate a finding `CRITICAL` only when it breaks a rule listed
here, and reports it under that rule's id. Everything else a skill says is at
most `WARNING`. `scripts/verdict.mjs` reads the ids from this file (every list
item that opens with a backticked `tag/name`) and demotes a `CRITICAL` whose
rule is not among them.

The bar for a new entry: breaking the rule in newly written code produces a
real defect (a bug, a security hole, lost or corrupt data, a crash, a broken
build, a test that cannot fail) or breaks a boundary the repo enforces, **and**
a reviewer can point at the line. Style, naming, preference and "consider…"
advice never qualify. Several skills carry their own CRITICAL / HIGH labels
(`react-best-practices`, `zod`, `security`); those labels are not this bar and
are ignored.

## Checked by script, not by a reviewer

`scripts/collect.mjs` finds these itself. They always block and, except the
secret scan, cannot be suppressed. Do not report them again.

| Rule | Fires when |
|---|---|
| `repo/applied-migration-edited` | an existing `server/src/db/migrations/*.sql` is modified, renamed or deleted |
| `repo/shared-contract-one-copy` | a file under one `src/vendor/shared` copy changed and its twin did not |
| `repo/secret-in-diff` | an added line matches a real key format (suppressible, for fixtures) |
| `repo/env-file-in-diff` | a `.env` / `.env.*` file is part of the change |
| `repo/claude-md-not-symlink` | a `CLAUDE.md` is a regular file instead of a link to `AGENTS.md` |
| `onion/deps-validate` | `pnpm deps:validate` reports a violation |

## onion-architecture

- `onion/outward-import` — a ring 0–1 file (`domain.ts`, `service.ts`, `ports.ts`, any other module file, anything in `reviewer-core/src` except `llm/openrouter.ts`) imports `db/`, `adapters/`, `platform/container.ts`, an SDK, `repository.ts`, `routes.ts` or another module's internals, type-only imports included. Why: the core stops being testable without infrastructure and `deps:validate` fails in CI. (SKILL.md "Rings and files", "Wiring")
- `onion/query-in-route` — a `routes.ts` handler runs a query or touches `container.db` other than to construct a repository at the top of the plugin. Why: a use case with no service method, unreachable by a unit test. (SKILL.md "What the checker cannot see")
- `onion/env-outside-config` — `process.env` is read outside `platform/config.ts`, `adapters/secrets/local.ts`, `db/migrate.ts`, `db/seed.ts`. Why: the value skips config validation. (SKILL.md "Config and clock")
- `onion/impure-domain` — a `domain.ts`, or any file in `reviewer-core/src`, calls `Date.now()`, `new Date()` with no argument, `Math.random()`, or reads the filesystem, env or network. Why: the rule can no longer be tested with plain values. (SKILL.md "Config and clock", "reviewer-core")
- `onion/transaction-across-io` — a database transaction stays open across an LLM or GitHub call, or `tx` appears as a parameter of a port. Why: a slow provider holds locks and a connection for the whole call. (SKILL.md "Drizzle")

## fastify-best-practices

Written for TypeBox/Ajv, `node:test` and `@fastify/postgres`. This repo uses
Zod through the type provider, Vitest and Drizzle: apply the rule, not the
example's tooling.

- `fastify/hook-send-without-return` — a hook (`onRequest`, `preHandler`, …) calls `reply.send()` and does not return right after. Why: the handler it was guarding still runs. (rules/error-handling.md:236, rules/hooks.md:405)
- `fastify/route-input-without-schema` — a route reads `request.body`, `request.query` or `request.params` with no schema declared for that part in the route options; an `as` cast or a `Schema.parse(req.body)` in the handler does not count. Why: unvalidated input reaches the service. (rules/cors-security.md:441; `server/AGENTS.md` Conventions)
- `fastify/shared-decorator-without-fp` — a plugin whose decorator or hook is used outside its own scope is not wrapped in `fastify-plugin`. Why: the decorator is `undefined` at runtime although it type-checks. (rules/plugins.md:20, :39)

## drizzle-orm-patterns

Its examples use `serial` and `timestamp` without a time zone; do not treat the
examples as rules. Editing an applied migration is checked by script.

- `drizzle/sql-string-concat` — SQL built by string concatenation or interpolation and passed to `db.execute()` or `sql.raw()`, instead of the query builder or the parameterised `sql` template. Why: SQL injection. (references/best-practices.md:323)
- `drizzle/multi-write-without-transaction` — two or more writes that must succeed or fail together run outside one `db.transaction()`. Why: a failure between them leaves half the data written. (references/best-practices.md:65, SKILL.md:113)
- `drizzle/fk-reference-not-arrow` — `.references()` receives `table.column` directly instead of `() => table.column`. Why: a forward or circular table reference is `undefined` at module load. (SKILL.md:122)

## postgresql-table-design

Written as SQL; map it onto the Drizzle schema. This repo uses `uuid` primary
keys and stores cost as `doublePrecision` on purpose: neither is a finding.

- `pg/timestamp-without-tz` — a new time column is `timestamp` without `{ withTimezone: true }`. Why: stored instants shift with the session time zone. (SKILL.md:48)
- `pg/unique-over-nullable` — a unique constraint or index meant to enforce uniqueness includes a nullable column and is not `NULLS NOT DISTINCT`. Why: rows with NULL there duplicate freely. (SKILL.md:19)
- `pg/on-conflict-without-unique-index` — `onConflictDoUpdate` / `onConflictDoNothing` names target columns with no unique index on exactly those columns. Why: the statement errors at runtime. (SKILL.md:116)

## frontend-architecture

No tool checks these; the skill's "Check before you finish" greps are the
check, and the diff must not add a line to any of them. A line the branch did
not touch is pre-existing and does not block.

- `fe-arch/data-access-outside-lib` — `fetch(`, `useQuery(`, `useMutation(` or `useInfiniteQuery(` in `src/app` or `src/components`, tests excepted. Why: bypasses the one data path `page → src/lib/hooks → src/lib/api.ts`. (SKILL.md "Data", grep 6)
- `fe-arch/import-direction` — `src/lib` or `src/components` imports from `src/app`; `src/lib` imports from `src/components`; a route imports from an unrelated route; or a file imports another component folder's `constants`, `helpers` or `styles` instead of its `index.ts`. Why: shared code now depends on a screen. (SKILL.md "Imports", greps 2–3)
- `fe-arch/impure-pure-file` — a `helpers.ts` or `constants.ts` imports React, Next, TanStack Query or next-intl, or a `helpers.ts` reads the clock without a `now` parameter. Why: the file can no longer be tested with plain inputs. (SKILL.md "Files in a component folder", greps 4–5)
- `fe-arch/top-level-in-tsx` — the diff adds a top-level `const`, `let`, `var` or lower-case `function` to a `.tsx` (other than a Next export such as `metadata`). Why: a rule or constant in the view, with nowhere to test it. (SKILL.md "Files in a component folder", grep 1)

## next-best-practices

Most of these are latent today: no page is a Client Component and there are no
route handlers or server actions.

- `next/async-client-component` — a component in a `'use client'` file is an `async` function. Why: runtime error. (rsc-boundaries.md:9)
- `next/navigation-in-try-catch` — `redirect()`, `permanentRedirect()`, `notFound()`, `forbidden()` or `unauthorized()` is called inside a `try` whose `catch` swallows the error. Why: the navigation silently does not happen. (error-handling.md:63)
- `next/sync-request-api` — `params` or `searchParams` is not typed `Promise<…>` and awaited, or `cookies()` / `headers()` is not awaited. Why: every property read is `undefined`. (async-patterns.md:7)
- `next/non-serializable-prop` — a Server Component passes a function (other than a `'use server'` action) or a class instance to a Client Component. Why: runtime error, or methods are stripped. (rsc-boundaries.md:48)
- `next/metadata-in-client-component` — a `'use client'` file exports `metadata` or `generateMetadata`. Why: build error. (metadata.md:7)

## react-best-practices

- `react/unstable-key` — `key` is `Math.random()` or another value recomputed on each render. Why: every item remounts on each render and loses state and focus. (SKILL.md:132)
- `react/index-key-mutable-list` — the array index is the `key` of a list that can be reordered, filtered, inserted into or deleted from. Why: state attaches to the wrong item. (SKILL.md:131)
- `react/and-renders-zero` — `{n && <X />}` where `n` is a number that can be `0`. Why: a literal `0` appears in the UI. (SKILL.md:137)
- `react/effect-missing-cleanup` — a `useEffect` subscribes, starts a timer or adds a listener and returns no cleanup that undoes it. Why: leaks, duplicate listeners, callbacks after unmount. (SKILL.md:74)
- `react/effect-missing-deps` — a reactive value read inside `useEffect`, `useMemo` or `useCallback` is missing from its dependency array. Why: the callback runs with stale props or state. (SKILL.md:73)

## react-testing-library

Written for Vite, React Router, MSW and user-event. Client tests here mock
`fetch` and use `fireEvent` by design: neither is a finding.

- `rtl/mock-the-subject` — a test mocks or stubs the component, hook or function it asserts on. Why: the test exercises the mock and cannot fail. (SKILL.md:600)
- `rtl/fixed-delay` — a test waits with `setTimeout` or a fixed sleep instead of `findBy*` / `waitFor`. Why: it passes or fails on timing. (SKILL.md:384)
- `rtl/leaked-state-between-tests` — a module-level mock, fake timers or a shared mutable fixture is not reset or restored per test. Why: tests pass or fail depending on order. (SKILL.md:598)

## zod

Fastify routes already parse through the type provider and map the error, so
the last two rules apply at the other boundaries: LLM output, GitHub payloads,
config, and API responses on the client. Perf rules target Zod 4; ignore them.

- `zod/async-refine-sync-parse` — a schema with an async `refine`, `superRefine` or `transform` is run with `parse` / `safeParse`. Why: it throws at runtime. (references/parse-async-for-async-refinements.md:10)
- `zod/string-input-without-coerce` — a schema for query-string, route-param or form data uses bare `z.number()` or `z.boolean()`. Why: every valid request is rejected, because the values arrive as strings. (references/schema-coercion-for-form-data.md:10)
- `zod/coerce-boolean-on-string` — `z.coerce.boolean()` on string input. Why: `"false"` and `"0"` parse as `true`. (references/schema-coercion-for-form-data.md:76)
- `zod/unvalidated-json` — the result of `JSON.parse()` or `response.json()` from an external source is used without passing through a schema. Why: a crash or wrong data on an unexpected shape. (references/parse-never-trust-json.md:10)
- `zod/parse-external-uncaught` — `.parse()` on external data outside a route schema, with no `safeParse` and no error handling that maps the failure. Why: an unhandled `ZodError`. (references/parse-use-safeparse.md:10)

## typescript-expert

No critical rules. The skill is a troubleshooting guide and its review
checklist states no failure. `any`, unjustified `as`, a non-exhaustive
`switch` and a `paths` alias with no runtime counterpart are `WARNING`.

## security

Written for Express, MongoDB and JWT. Skip its auth, JWT, Mongoose, multer and
Express-middleware rules. Apply its own confidence gate (SKILL.md:16-24):
report only what an attacker can actually control, and never test files or
server-controlled constants.

- `sec/hardcoded-secret` — a literal secret, API key, token, private key or credentialed connection string in code or config. Why: it leaks through version control. (checklists.md:11, SKILL.md:182-195)
- `sec/command-injection` — `exec()`, `spawn({ shell: true })`, `eval()` or `Function()` receives a value derived from a request, a PR or another external source. Why: remote code execution. (SKILL.md:105)
- `sec/unsanitized-html` — `dangerouslySetInnerHTML`, or an equivalent HTML sink, fed by non-constant content with no sanitisation. Why: stored XSS; LLM output and PR content are attacker-influenced. (SKILL.md:99, :208)
- `sec/path-traversal` — a filesystem path built from external input is used without checking that it resolves inside its base directory. Why: reads or writes outside that directory. (SKILL.md:218, :174)
- `sec/ssrf-user-controlled-url` — a server-side `fetch` or HTTP call to a URL taken from a request or another external source, with no allowlist. Why: SSRF. (SKILL.md:24)

## repo-rules

From the root `AGENTS.md` ("Repo-wide rules", "Do not touch") and the package
`AGENTS.md` files. The mechanical ones are in the table at the top.

- `repo/untrusted-not-fenced` — PR or repo content (diff, title, body, comments, file text) reaches a prompt without `wrapUntrusted`, or a keyword denylist is added in its place. Why: prompt injection through a pull request.
- `repo/grounding-bypassed` — a finding reaches the stored review or the output without passing the grounding gate, or the score is not recomputed from the surviving findings. Why: the reviewer reports problems on lines that do not exist.
- `repo/real-provider-in-test` — a test calls a real LLM, GitHub or git instead of the mocks in `server/src/adapters/mocks.ts` or a stubbed `LLMProvider`. Why: the suite needs keys and network, and spends money.
- `repo/secret-in-db-or-config` — a secret is written to the database or to `AppConfig`, or `server/.env`, `client/.env` or `~/.devdigest/secrets.json` is read into output. Why: keys leak into storage, logs or responses.
