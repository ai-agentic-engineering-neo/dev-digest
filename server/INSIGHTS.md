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

- **2026-09-16** — `completeAgentRun`'s value type is declared TWICE and the two
  copies are not linked: the `ReviewRepository` facade re-types the whole object
  literal (`src/modules/reviews/repository.ts:151`) around the real
  implementation (`src/modules/reviews/repository/run.repo.ts:142`). Adding a
  field to only one of them compiles at the call site and fails at the facade.
  Expect the same shape for other repository methods re-exported through that
  facade.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- **2026-09-16** — Run Cost: `agent_runs.cost_usd` re-added (migration 0010),
  threaded through the run executor, repository and the PR-list route.

## Open Questions
