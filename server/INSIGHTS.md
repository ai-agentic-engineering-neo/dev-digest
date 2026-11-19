# server — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->
- 2026-11-19 — Need a FAILED review run in an `.it.test` → pass a structured fixture that fails the Review schema (e.g. `appWith({ not: 'a review' })`); `MockLLMProvider.completeStructured` throws and the executor's real failure path runs (evidence: server/test/reviews.it.test.ts "a FAILED review run stores cost_usd = null")

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->
- 2026-11-19 — Run cost needed in UI → use `outcome.costUsd` from `reviewPullRequest` (OpenRouter `usage.cost`, else `PriceBook` estimate), persisted to `agent_runs.cost_usd`; NEVER re-estimate from tokens or add model calls (evidence: server/src/modules/reviews/run-executor.ts#execute, reviewer-core/src/llm/openrouter.ts)
- 2026-11-19 — Adding a field to `RunStats`/`RunTrace` (stored as jsonb in `run_traces`) → ALWAYS make it `.nullish()`, else traces persisted before the change fail to parse (evidence: server/src/vendor/shared/contracts/trace.ts#RunStats.cost_usd)

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-19 — USD/float columns in Drizzle → use `doublePrecision`, not `numeric` (postgres.js returns `numeric` as string, breaking `z.number()` contracts) (evidence: server/src/db/schema/runs.ts#agentRuns.costUsd)

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-19 — `pnpm db:migrate` prints `{ severity: 'NOTICE', code: '42710' … }` objects (vector extension / drizzle schema already exist) that look like failures → ignore them; success = final `✓ migrations applied` line (evidence: server/src/db/migrate.ts)
- 2026-11-19 — Whole API process died with a raw `GitError … Repository not found` after Refresh on the seeded fake repo `acme/payments-api` → cause was an unhandled rejection of `EnqueuedJob.done` (callers fire-and-forget); keep `done.catch(() => {})` in `JobRunner.enqueue` and NEVER rethrow from a job path nobody awaits (evidence: server/src/platform/jobs.ts#enqueue, server/test/jobs-runner.test.ts)
- 2026-11-19 — supersedes 2026-11-19 entry on `EnqueuedJob.done`: the `done.catch` fix and `jobs-runner.test.ts` were reverted at user request → crash is STILL present; a failed clone/index job (e.g. Refresh on seeded `acme/payments-api`) kills the API, so restart `./scripts/dev.sh` after it (evidence: server/src/platform/jobs.ts#enqueue)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->

## Open Questions
<!-- still unclear; move out once answered -->
