# Insights — repo root

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** this file holds only findings that cross package boundaries — the
shared contracts, the toolchain, CI, and the dev scripts. Anything scoped to a
single package lives in that package's file:
[`server`](server/INSIGHTS.md) · [`client`](client/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

## What Works

- **2026-09-16** — `main` is trimmed, but the lessons' code is still in git.
  Before building a lesson feature, look for a prior implementation:
  `git log -S '<identifier>' --oneline --all`. The Run Cost feature came back
  from the pair `93119a5` (added it) and `d45ab0d` (removed it) — together they
  held the schema change, the route aggregate, the component and the i18n keys.
  Cheaper and more faithful than re-deriving it from the design mockups.

## What Doesn't Work

## Codebase Patterns

- **2026-09-16** — No route anywhere in `server/src/modules/` declares
  `schema.response`, so the `@devdigest/shared` contracts are compile-time only
  on read paths — a response that violates its Zod schema is served, not
  rejected. Consequence when adding a field to a contract that describes a
  PERSISTED document (`RunStats` lives inside the `run_traces.trace` jsonb):
  use `.nullish()`, not `.nullable()`. `nullable()` still requires the key, so
  documents written before the field existed stop type-checking, while rows in
  a nullable DB column are fine with `.nullable()`.
  `server/src/vendor/shared/contracts/trace.ts`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- **2026-09-16** — Run Cost (server + client + shared contracts): recovered the
  reverted implementation from git history, re-threaded `costUsd` end to end.

## Open Questions
