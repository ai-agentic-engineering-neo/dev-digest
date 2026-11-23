# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. One line: `- YYYY-MM-DD — what — why/fix`.
If Claude keeps getting it wrong anyway, promote it to `server/CLAUDE.md`.

- 2026-11-22 — `db:migrate` / `db:seed` silently did nothing on Windows — the CLI-entrypoint check built `file://${argv[1]}` by hand; use `pathToFileURL(argv[1]).href`.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-11-23 — PR-list per-severity counts = `count(*)` over findings ⨝ reviews (`kind='review'`) `GROUP BY pr_id, severity`, folded into `{CRITICAL,WARNING,SUGGESTION}`; the starter had deliberately removed this breakdown, so the UI's Findings column needed this server field (src/modules/pulls/routes.ts › findings_by_severity).
- 2026-11-22 — SUPERSEDES 2026-11-22 "latest review leftJoin" entry — PR-list COST is the TOTAL over all agent runs (user decision), computed as `sum(agent_runs.cost_usd) GROUP BY pr_id`; the leftJoin pattern still applies if you ever need data of the latest review's run (src/modules/pulls/routes.ts › GET /repos/:id/pulls).
- 2026-11-22 — Run cost already exists upstream: reviewer-core returns `outcome.costUsd` (OpenRouter `usage.cost` or price-book estimate, null if any chunk unpriced); the server only has to persist it — don't add a second pricing path (src/modules/reviews/run-executor.ts › runOne, agent_runs.cost_usd).
- 2026-11-22 — To attach run data to "the latest review" use `leftJoin(agentRuns, agentRuns.id = reviews.runId)` — `reviews.run_id` has no FK, so it must be a left join and may be null (src/modules/pulls/routes.ts › GET /repos/:id/pulls).
- 2026-11-22 — New fields on `RunStats` must be `.nullish()` — traces are stored as one jsonb doc, so rows written before the field existed lack it and would fail parsing (src/vendor/shared/contracts/trace.ts › RunStats).

## Tool & Library Notes

## Recurring Errors & Fixes
- 2026-11-23 — `pathToFileURL(process.argv[1])` fails `pnpm typecheck` (noUncheckedIndexedAccess → `string | undefined`) — write `pathToFileURL(process.argv[1] ?? "")` (src/db/migrate.ts, src/db/seed.ts › CLI entrypoint).
- 2026-11-22 — Unit suite has 8 baseline failures on Windows (git-adapter-safety, indexer-pipeline, contained-read: POSIX path assumptions) — verified identical with changes stashed; not a regression signal (test/*.test.ts).

## Session Notes

## Open Questions
