# INSIGHTS — server

Non-obvious learnings for this module, maintained by the `engineering-insights` skill.
Read before non-trivial changes. **Append-only**: correct an entry with a dated
`CORRECTION:` bullet below it; don't edit or delete. Promote an entry to `AGENTS.md`
only if an agent is likely to hit it on most tasks. Prune in a periodic human review
when the file passes ~200 entries.

<!-- Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> because <why> — evidence: path/to/file.ts (symbol) -->

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-11-26 · Grounding/prompt code lives in reviewer-core: `src/platform/grounding.ts` / `prompt.ts` / `structured.ts` are re-export shims of `@devdigest/reviewer-core`, so edits there have no effect or get lost — edit `reviewer-core/src/` instead.
  - CORRECTION 2026-11-27: the `src/platform/{grounding,prompt,structured}.ts` shims were deleted — import from `@devdigest/reviewer-core` directly; the rest of this entry (edit `reviewer-core/src/`) still holds.
- 2026-11-26 · `@devdigest/shared` is vendored twice (`server/src/vendor/shared` and `client/src/vendor/shared`) and the copies already differ (adapters, trace, knowledge, eval-ci, productionize) — a contract change that works in the API leaves client types disagreeing unless you update both copies and diff them.
- 2026-11-26 · Run cost (M1): reviewer-core always computed `ReviewOutcome.costUsd`, but run-executor dropped it and migration 0009 had dropped `agent_runs.cost_usd`; 0010 re-adds it. `RunStats.cost_usd` must stay `nullish` (not `nullable`): `run_traces` jsonb docs written before M1 lack the key and are parsed with the current contract.
- 2026-11-27 · NEVER copy the `constructor(private container: Container)` service shape from `repos`/`agents`/`reviews`/`repo-intel` into new code, because it is a service locator that hides the real dependencies and makes service tests build the whole container. Use `modules/pulls/` as the template instead: ports and `XxxServiceDeps` in `types.ts`, with the service composed in `routes.ts`. Rules are in `.claude/skills/onion-architecture/` — evidence: server/src/modules/pulls/types.ts (PullsServiceDeps)
- 2026-11-27 · ALWAYS persist the run trace (and `agent_run_skills`) BEFORE `completeAgentRun(status:'done')` because `waitForPrRuns` and the UI poll status, then read the trace — the old order let them read a pre-final trace — evidence: server/src/modules/reviews/run-executor.ts (runOneAgent)
- 2026-11-27 · Skills (M2) go in the SYSTEM message before the injection guard and are NOT `<untrusted>`-wrapped (the guard would tell the model to ignore them); trust for third-party skills is the importing human's explicit confirmation — evidence: reviewer-core/src/prompt.ts (assemblePrompt, renderSkillBlock)

## Tool & Library Notes
- 2026-11-26 · do NOT read the `{ severity: 'NOTICE', routine: 'transformCreateStmt' … }` objects printed by `pnpm db:migrate` as a failure because they are Postgres "already exists, skipping" notices (vector extension, `drizzle` schema, `__drizzle_migrations`) emitted on every run; success is the final `✓ migrations applied` — confirm a new column via `information_schema.columns` if in doubt — evidence: server/src/db/migrate.ts (runMigrations)
- 2026-11-26 · pnpm 11+ fails the install with `ERR_PNPM_IGNORED_BUILDS` (esbuild, ssh2, cpu-features, protobufjs) because it blocks dependency build scripts and the project has no approval config — use pnpm 10 (`npm i -g pnpm@10`), then delete the half-installed `node_modules`, since `scripts/dev.sh` skips the install whenever that folder exists.

## Recurring Errors & Fixes
- 2026-11-27 · A test run whose trace lacks expected prompt fields is usually a FAILED run: when a `MockLLMProvider` fixture fails the Review schema (e.g. `category: 'tests'` instead of `'test'`), the LLM call is recorded but the run fails and the trace is rebuilt from the log buffer. Assert `agent_runs.error` is null first — evidence: server/test/skills.it.test.ts

## Session Notes

## Open Questions
