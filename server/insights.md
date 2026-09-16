# Insights — server

Non-obvious things learned while working in this module — discovered gotchas,
dead ends, decisions and the reasoning behind them, "why is it done this way"
answers. Captured by the `engineering-insights` skill. Append-only: never
rewrite or delete a past entry — a correction is a new dated entry that
references the old one. Check this file before deep-diving in this module.

## What Works

## What Doesn't Work

## Decisions

## Recurring Errors & Fixes

- **2026-09-15** — `pnpm db:migrate` fails with `column "X" of relation "Y" already exists` even on a freshly `git reset` starter tree: the local Postgres volume (`devdigest_pgdata`) is never wiped by a git revert, so it can still carry schema/data from previously-merged-then-reverted branches (e.g. `agent_runs.cost_usd` and unrelated leftover columns `critical_count`/`warning_count`/`suggestion_count` were already physically present before this session's migration re-added `cost_usd`). Before running `db:migrate` after picking up schema work, check the live DB first: `docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\d <table>'` and `select * from drizzle.__drizzle_migrations`. If a column already exists and matches the intended schema, don't re-run the ALTER — baseline the generated migration as applied instead: `sha256` the migration `.sql` file (matches `drizzle-orm/postgres-js/migrator`'s `readMigrationFiles`, which hashes the raw file content) and `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256>', <journal "when" ms>)` — no data touched, journal reconciled with physical reality (`server/src/db/migrations/0010_superb_abomination.sql`).

## Codebase Patterns & Tool Notes

## Open Questions

## Session Notes
