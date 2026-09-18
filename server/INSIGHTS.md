# Insights — @devdigest/api

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/api`. Findings that cross package boundaries
go in the repo-root `INSIGHTS.md`.

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-18** — `server/CLAUDE.md`'s "Layer duties are strict … no raw SQL
  and no HTTP inside a service" describes the intent, not the tree. Eight files
  query the DB outside a repository — `pulls/routes.ts`, `polling/routes.ts`,
  `workspace/routes.ts`, `settings/routes.ts`, `settings/feature-models.ts`,
  `repos/helpers.ts`, `reviews/diff-loader.ts`, `reviews/run-executor.ts` — and
  `pulls`, `polling` and `workspace` have no `service.ts`/`repository.ts` at
  all, so their handlers go straight from URL to SQL. `repos/helpers.ts`
  imports `db/schema.js` under a docblock promising "pure functions only".
  These are allowlisted in `server/.dependency-cruiser.cjs`; `pnpm arch` is
  green on the current tree, so any NEW violation is yours. Copying the shape of
  `pulls/routes.ts` for a new endpoint will fail that check.

- **2026-09-17** — `CLAUDE.md`'s "Every table still carries `workspace_id`" is
  not literally true. On the review path only `reviews`, `pull_requests`,
  `agent_runs` and `multi_agent_runs` have the column; `findings`, `pr_intent`,
  `pr_brief`, `pr_files`, `pr_commits` and `run_traces` have none
  (`src/db/schema/reviews.ts:28`, `pulls.ts:35`, `pulls.ts:47`, `runs.ts`).
  They are tenant-scoped only through their parent FK
  (`findings.review_id -> reviews.workspace_id`), so a
  `select().from(t.findings)` with no join to `reviews` reads every workspace
  even though the handler called `getContext()`.

- **2026-09-17** — There is no `score` column on `pull_requests`
  (`src/db/schema/pulls.ts:8-28`, `migrations/0000_init.sql:241-259`). A PR's
  score lives on `reviews.score` (`schema/reviews.ts:23`) and `agent_runs.score`
  (`runs.ts:31`) and has to be joined in. The mistake is invisible to the
  compiler when the query goes through `db.execute(sql.raw(...))`:
  `pnpm typecheck` stays green and Postgres fails at runtime with `42703 column
  does not exist`. The only raw SQL in `src/` is
  `modules/repo-intel/repository.ts:402-406`, and it is parameterised — a new
  raw query needs an `*.it.test.ts` to prove its columns exist.

- **2026-09-17** — A "deliberately not implemented" comment in a route can be
  stale scaffolding, not a decision. `pulls/routes.ts` said the per-severity
  FINDINGS breakdown was "intentionally not surfaced on the list", while
  `rollupSeverities` sat 40 lines away in `pulls/status.ts:23` — exported,
  unit-tested (`test/pulls-status.test.ts:52`), called by nothing, and with a
  module docblock describing that exact breakdown. Before writing a new
  aggregation, grep the module for an unused pure helper: the starter ships
  them ahead of the lesson that wires them up. **2026-09-17, same file:** the
  cost block's comment asserted "latest completed run" as if it were the spec —
  it was the starter's guess, and the user wanted the SUM of every done run.
  Treat a rollup comment in `pulls/routes.ts` as a description of the code, not
  as a product decision: the list's aggregation WINDOW (latest vs all) is never
  written down anywhere, so confirm it before extending a column.

- **2026-09-16** — `completeAgentRun`'s value type is declared TWICE and the two
  copies are not linked: the `ReviewRepository` facade re-types the whole object
  literal (`src/modules/reviews/repository.ts:151`) around the real
  implementation (`src/modules/reviews/repository/run.repo.ts:142`). Adding a
  field to only one of them compiles at the call site and fails at the facade.
  Expect the same shape for other repository methods re-exported through that
  facade.

## Tool & Library Notes

- **2026-09-18** — Two dependency-cruiser settings decide whether `pnpm arch`
  (`server/.dependency-cruiser.cjs`) checks anything at all, and both fail
  SILENTLY with a green "no dependency violations found". (1) Listing
  `node_modules` in `options.exclude` drops external modules from the graph, so
  every rule about an npm package (drizzle-orm, fastify, the SDKs) stops
  matching — keep `doNotFollow: { path: 'node_modules' }` for speed and restrict
  `exclude` to `clones`/`dist`. (2) Without
  `options.tsPreCompilationDeps: true`, `import type { … }` crossings are
  invisible, which is most of the boundary traffic in this codebase. Third trap,
  this one loud: on a circular rule `viaNot: 'X'` ("no module in the cycle
  matches X") is NOT the same as the documented-looking `via: { pathNot: 'X' }`
  ("some module does not match X") — the latter is true of nearly every cycle.
  Verify any rule change by injecting a violation and re-running, not by reading
  a green result.

## Recurring Errors & Fixes

- **2026-09-17** — `Run failed: 401 User not found.` mid-agent-run is OpenRouter
  rejecting the key, not a bug in the run pipeline. `container.buildLlm` only
  checks that the secret is a non-empty string
  (`src/platform/container.ts:183`), so `Resolving openrouter provider done
  (0ms)` proves nothing — the first real auth happens in
  `chat.completions.create`. Confirm in one call before reading any code:
  `curl -H "Authorization: Bearer $KEY" https://openrouter.ai/api/v1/key`.
  A valid key is `sk-or-v1-` + 64 lowercase hex (73 chars); anything longer or
  mixed-case came from another service. Side effect of a bad key: `PriceBook`
  swallows the 401 (`container.ts:143`) and silently falls back to the static
  price table, so costs still render.

## Session Notes

- **2026-09-18** — Added the `onion-architecture` skill
  (`.claude/skills/onion-architecture/`) plus `server/.dependency-cruiser.cjs`
  and a `pnpm arch` script; each rule was confirmed to fire against an injected
  violation before the allowlist was written.

- **2026-09-17** — Ran the PR-review prompt against PR #4 (the
  `test/reviewer-bait` fixture); review only, no code change.

- **2026-09-17** — PR-list COST switched from the latest done run to the sum of
  all done runs (`sumRunCosts` in `modules/pulls/status.ts`); contract comment
  updated in BOTH vendor copies of `contracts/platform.ts`.

- **2026-09-17** — Diagnosed a failing agent run down to an invalid
  `OPENROUTER_API_KEY`; no code change.

- **2026-09-16** — Run Cost: `agent_runs.cost_usd` re-added (migration 0010),
  threaded through the run executor, repository and the PR-list route.

## Open Questions
