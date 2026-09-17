# Insights — server

Lessons/gotchas an agent can't guess from code alone.

## Migration journal corruption (2026-08)

Merging a branch by copying its whole `src/db/migrations/` dir over upstream's — instead of appending — rewrote history: it replaced an existing entry, dropped a later upstream migration, and lost columns from regenerated snapshots. Fresh databases crashed; already-migrated ones didn't, masking the break in some CI lanes.

**Rule:** never copy the migrations dir wholesale across branches. Always regenerate with `pnpm db:generate` and resolve journal conflicts by appending, never replacing. (Commit `2006964`.)
