# Insights — server

Lessons an agent cannot guess from the code alone. Read this before starting work in
this module; append to it at wrap-up, but only when something non-obvious came up.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

_No entries yet._

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

_No entries yet._

## Recurring Errors & Fixes

### Migration journal corruption (2026-08)

Merging a branch by copying its whole `src/db/migrations/` dir over upstream's — instead of appending — rewrote history: it replaced an existing entry, dropped a later upstream migration, and lost columns from regenerated snapshots. Fresh databases crashed; already-migrated ones didn't, masking the break in some CI lanes.

**Rule:** never copy the migrations dir wholesale across branches. Always regenerate with `pnpm db:generate` and resolve journal conflicts by appending, never replacing. (`server/src/db/migrations/`, commit `2006964`.)

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
