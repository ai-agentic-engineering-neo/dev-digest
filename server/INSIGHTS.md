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

- **2026-09-17** — PR-list COST switched from the latest done run to the sum of
  all done runs (`sumRunCosts` in `modules/pulls/status.ts`); contract comment
  updated in BOTH vendor copies of `contracts/platform.ts`.

- **2026-09-17** — Diagnosed a failing agent run down to an invalid
  `OPENROUTER_API_KEY`; no code change.

- **2026-09-16** — Run Cost: `agent_runs.cost_usd` re-added (migration 0010),
  threaded through the run executor, repository and the PR-list route.

## Open Questions
