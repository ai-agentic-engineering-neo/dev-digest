# INSIGHTS — server

Non-obvious learnings for this module, maintained by the `engineering-insights` skill.
Read before non-trivial changes. **Append-only**: correct an entry with a dated
`CORRECTION:` bullet below it; don't edit or delete. Promote an entry to `CLAUDE.md`
only if an agent is likely to hit it on most tasks. Prune in a periodic human review
when the file passes ~200 entries.

<!-- Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> because <why> — evidence: path/to/file.ts (symbol) -->

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-11-26 · Grounding/prompt code lives in reviewer-core: `src/platform/grounding.ts` / `prompt.ts` / `structured.ts` are re-export shims of `@devdigest/reviewer-core`, so edits there have no effect or get lost — edit `reviewer-core/src/` instead.
- 2026-11-26 · `@devdigest/shared` is vendored twice (`server/src/vendor/shared` and `client/src/vendor/shared`) and the copies already differ (adapters, trace, knowledge, eval-ci, productionize) — a contract change that works in the API leaves client types disagreeing unless you update both copies and diff them.
- 2026-11-26 · Run cost (M1): reviewer-core always computed `ReviewOutcome.costUsd`, but run-executor dropped it and migration 0009 had dropped `agent_runs.cost_usd`; 0010 re-adds it. `RunStats.cost_usd` must stay `nullish` (not `nullable`): `run_traces` jsonb docs written before M1 lack the key and are parsed with the current contract.

## Tool & Library Notes
- 2026-11-26 · do NOT read the `{ severity: 'NOTICE', routine: 'transformCreateStmt' … }` objects printed by `pnpm db:migrate` as a failure because they are Postgres "already exists, skipping" notices (vector extension, `drizzle` schema, `__drizzle_migrations`) emitted on every run; success is the final `✓ migrations applied` — confirm a new column via `information_schema.columns` if in doubt — evidence: server/src/db/migrate.ts (runMigrations)
- 2026-11-26 · pnpm 11+ fails the install with `ERR_PNPM_IGNORED_BUILDS` (esbuild, ssh2, cpu-features, protobufjs) because it blocks dependency build scripts and the project has no approval config — use pnpm 10 (`npm i -g pnpm@10`), then delete the half-installed `node_modules`, since `scripts/dev.sh` skips the install whenever that folder exists.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
