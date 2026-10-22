# Quality improvement plan

Status: draft
Packages: client, server, reviewer-core, e2e
Date: 2026-10-15

## Goal

Make the codebase follow the practices our skills describe, so new lessons (L03+) build on
clean layers instead of copying existing shortcuts. Findings come from a full pass over every
package against these skills: `onion-architecture`, `frontend-ui-architecture`,
`react-best-practices`, `next-best-practices`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `security`, `zod`.

Order matters: **Phase 0 comes first**. Without automated guards the other fixes will
regress.

## Scope

In scope: tooling, security hardening, DB indexes, server layering, client structure, tests.

Out of scope: new features, visual redesign, multi-instance deployment (the app is
single-instance by design — see `server/INSIGHTS.md`).

## Phase 0 — Guards (do first)

### 0.1 Add ESLint to every package
- **Problem:** no package has an ESLint config or a `lint` script.
  `// eslint-disable-line react-hooks/exhaustive-deps` in
  `client/.../ConfigTab/ConfigTab.tsx` does nothing, and nothing catches hook-dependency bugs.
- **Do:** client: `eslint-config-next` + `eslint-plugin-react-hooks`. server and
  reviewer-core: `typescript-eslint`. Add a `pnpm lint` script and a CI step to
  `client.yml`, `server-unit.yml` and `reviewer-core.yml`.
- **Skills:** react-best-practices, next-best-practices, typescript-expert.

### 0.2 Enforce server layers with dependency-cruiser
- **Problem:** the layer rules exist only on paper. `dependency-cruiser` is already a server
  dependency.
- **Do:** add `server/.dependency-cruiser.cjs` with the rules from
  `.claude/skills/onion-architecture/references/layers-and-rules.md`:
  - `drizzle-orm` and `db/schema` may be imported only from `repository*` and `db/`;
  - services may not import `fastify` or any SDK;
  - modules may not import each other's `repository` or `service`.

  Add `pnpm lint:arch` to CI. Start from a **baseline** of known violations (the list in
  `review-checklist.md`) so CI fails only on new ones.
- **Skills:** onion-architecture.

### 0.3 Stop shared-contract drift
- **Problem:** `server/src/vendor/shared` and `client/src/vendor/shared` differ in
  `adapters.ts`, `contracts/trace.ts`, `eval-ci.ts`, `knowledge.ts` and `productionize.ts`.
- **Do:** sync the client copy from the server one (the server is the source of truth). Add
  a CI step that fails when `diff -r server/src/vendor/shared client/src/vendor/shared` is
  non-empty.
- **Skills:** zod.

## Phase 1 — Security and database

### 1.1 Argument injection in `RipgrepCodeIndex.grep`
- **Problem:** `server/src/adapters/codeindex/ripgrep.ts` passes `pattern` to `rg` as a
  positional argument. A pattern that starts with `-`, such as `--pre=<cmd>`, is parsed as a
  flag, and `--pre` runs a command. Nothing calls this method yet. Once it is exposed as an
  LLM tool, text in a PR could reach it through prompt injection.
- **Do:** pass the pattern as `-e <pattern>`. Add a unit test that uses a pattern starting
  with `--`.
- **Skills:** security (A05 Injection, Agentic AI).

### 1.2 Index foreign keys
- **Problem:** `agent_runs` has 6 foreign-key columns and no indexes. `reviews.ts` and
  `agents.ts` have no secondary indexes. Run history and the PR list query by `pr_id` and
  `workspace_id`.
- **Do:** add indexes that match the real queries. At minimum:
  - `agent_runs (pr_id, ran_at desc)`
  - `agent_runs (workspace_id)`
  - the FK columns that reviews and findings filter on.

  Generate the migration with `pnpm db:generate`. `server/src/db/migrations/` is
  do-not-touch, so agree on the migration before merging.
- **Skills:** postgresql-table-design, drizzle-orm-patterns.

### 1.3 Constrain `agent_runs.status`
- **Problem:** `status` is a free `text` column. A typo becomes a new state that the UI
  doesn't handle.
- **Do:** use `text('status', { enum: [...] })` plus a `CHECK` constraint. Ship it in the same
  migration as 1.2.
- **Skills:** postgresql-table-design.

### 1.4 Parse `run_traces.trace` on read
- **Problem:** `reviews/repository/run.repo.ts:189` casts the jsonb with
  `row.trace as RunTrace`, so old rows break consumers silently (see `server/INSIGHTS.md`).
- **Do:** run `RunTrace.safeParse` in the repository, keep newly added fields `.nullish()`,
  and log rows that fail to parse.
- **Skills:** onion-architecture (zod-boundaries), zod.

## Phase 2 — Server layering (Onion)

### 2.1 Move Drizzle out of routes and executors
- **Problem:** 8 files query the DB outside a repository:
  - routes: `pulls/routes.ts` (353 lines: queries, GitHub sync and tallying in handlers),
    `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`;
  - application code: `reviews/run-executor.ts`, `reviews/diff-loader.ts`,
    `settings/feature-models.ts`, `repos/helpers.ts`.
- **Do:**
  1. **`pulls` first.** Create `PullsRepository` and `PullsService`; the route becomes
     parse → service → status (`onion-architecture/examples.md` #2).
  2. Then `settings`, `polling` and `workspace`.
  3. `run-executor` and `diff-loader` go through repositories.
  4. `repos/helpers.ts` imports `RepoRow` from the repository instead of `db/schema`.

  Shrink the 0.2 baseline after each step.
- **Skills:** onion-architecture, fastify-best-practices.

### 2.2 Response schemas on routes
- **Problem:** none of the 37 routes declares a `response` schema. Responses are not checked
  against the contracts, extra fields can leak, and serialization is slower.
- **Do:** add Zod `response` schemas from `@devdigest/shared` to each route, starting with
  `pulls` and `reviews`.
- **Skills:** fastify-best-practices (schemas, serialization), zod.

### 2.3 Speed up `references()`
- **Problem:** `RipgrepCodeIndex.references()` re-walks and re-reads every file for each
  symbol, so indexing cost grows with symbols × files.
- **Do:** read each file once per indexing pass (an in-memory content cache passed through
  the pipeline), or search for many symbols in one pass.
- **Skills:** onion-architecture (stays inside the adapter), fastify performance.

## Phase 3 — Client

### 3.1 Server pages and segment error handling
- **Problem:** all 5 `page.tsx` files are `"use client"`. There is no `error.tsx`,
  `loading.tsx`, `not-found.tsx` or error boundary, so a render error blanks the whole app.
- **Do:** keep `page.tsx` a thin server component that reads `params` and renders a client
  `*View` from `_components/`. Add `error.tsx` (with a reset button), `loading.tsx` and
  `not-found.tsx` for the `repos/[repoId]`, `agents` and `settings` segments.
- **Skills:** next-best-practices (RSC boundaries, error handling), react-best-practices
  (error boundaries).

### 3.2 Remove the PR detail waterfall
- **Problem:** `repos/[repoId]/pulls/[number]/page.tsx` loads the whole PR list to turn the
  PR number into its uuid, and only then fetches the detail.
- **Do:** add `GET /repos/:id/pulls/by-number/:number` on the server (or accept the number on
  the existing routes) and fetch the detail directly. Update both contract copies.
- **Skills:** next-best-practices (avoiding waterfalls), onion-architecture.

### 3.3 Query-key factory; invalidation inside hooks
- **Problem:** query keys are string literals spread across hooks and pages. The PR page
  calls `qc.invalidateQueries({ queryKey: ["pr-runs", prId] })` itself.
- **Do:** add key factories in `src/lib/hooks` (e.g. `prKeys.runs(id)`). Move every
  invalidation into mutation hooks or small `useInvalidate…` helpers. Pages never touch
  `queryClient`.
- **Skills:** frontend-ui-architecture (business-logic), react-best-practices (data
  fetching).

### 3.4 Derive instead of syncing state
- **Problem:** two components copy or reset state in effects:
  - `ConfigTab` keeps 9 `useState` copies of `agent` and resets them in a `useEffect` keyed
    on `agent.id`;
  - `FindingsPanel` calls `setFocusIdx(0)` in an effect.
- **Do:** render `<ConfigTab key={agent.id} />` and keep the form in one `useReducer`. Reset
  the focus index when the filter changes, either with a key or with a render-time check
  against the previous filter.
- **Skills:** react-best-practices ("Derive, don't store", useEffect rules).

### 3.5 Path aliases
- **Problem:** 53 deep relative imports, e.g. `../../../../../lib/hooks`.
- **Do:** replace them with `@/lib/...` and `@/components/...`. Add the ESLint rule
  `no-restricted-imports` for `../../../*`.
- **Skills:** frontend-ui-architecture (imports-boundaries).

### 3.6 One styling convention
- **Problem:** there are 302 inline `style={{}}` objects, next to Tailwind 4 and per-component
  `styles.ts` files.
- **Do:** choose one approach (recommended: `styles.ts` for tokens and layout, Tailwind
  utilities for one-off spacing), write it in `client/CLAUDE.md`, and migrate files as they
  are touched.
- **Skills:** react-best-practices (Tailwind), frontend-ui-architecture.

### 3.7 i18n and accessibility
- **Problem:** some UI strings are hard-coded, e.g. "Add a repository" in
  `onboarding/_components/AddRepoView`. Only 12 files use `aria-label`.
- **Do:** move the strings to `messages/en`. Audit icon-only buttons, modal focus traps and
  `aria-live` on toasts and run status.
- **Skills:** react-best-practices (accessibility).

## Phase 4 — Tests

- **reviewer-core:** 3 test files for about 1,000 lines. Add unit tests for
  `llm/structured.ts`, `grounding.ts` and `review/reduce.ts`. They are pure code, so tests
  are cheap.
- **server:** a unit test for 1.1; a `*.it.test.ts` per new repository from 2.1.
- **client:** tests for the key factories and mutation-hook invalidation (3.3), and for the
  `ConfigTab` reset (3.4).
- **e2e:** add `noUncheckedIndexedAccess` to `e2e/tsconfig.json`, as the other packages have.

## Acceptance criteria

- [ ] `pnpm lint` passes in client, server and reviewer-core, and runs in CI.
- [ ] `pnpm lint:arch` runs in CI; the baseline is empty once Phase 2 is done.
- [ ] The CI shared-contract diff check is green.
- [ ] `RipgrepCodeIndex.grep` passes the pattern with `-e`, and a test covers `--pre`.
- [ ] A migration adds FK indexes and the `agent_runs.status` constraint.
- [ ] No `drizzle-orm` / `db/schema` import outside `repository*` and `db/`.
- [ ] Every route declares a `response` schema.
- [ ] Every app segment has `error.tsx`, `loading.tsx` and `not-found.tsx`; `page.tsx`
      files are server components.
- [ ] PR detail makes one request chain (no list → detail waterfall).
- [ ] No string-literal query keys outside `src/lib/hooks`.
- [ ] No deep `../../../` imports in client.

## Open questions

- Styling convention for 3.6: `styles.ts`, Tailwind, or a mix? Needs a team decision.
- For 3.2: add a new by-number endpoint, or switch the PR routes to `(repoId, number)` keys?
- Should Phase 2 be done as a separate refactor, or only as files are touched for lessons?
