# server insights

Append-only. One line per finding, at the end of its section:
`- YYYY-MM-DD Fact, the action to take, and why. Applies to path/file.ext:LINE.`

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-09-19 Server boot (`src/server.ts`) never runs migrations; run `pnpm db:migrate` explicitly after pulling schema changes. Applies to `package.json:13`.
- 2026-09-19 An unindexed repo silently degrades to a diff-only review (no repo map is attached); index the repo first when review context looks thin. Applies to `src/modules/reviews/run-executor.ts:370`.
- 2026-10-05 `agent_runs.cost_usd` is NULL for runs before migration 0010 and for non-`done` runs, and the PR list takes cost from the latest review's run; do not backfill from tokens x price, or old figures stop matching the OpenRouter bill. Applies to `src/modules/pulls/run-cost.ts:13`.
- 2026-10-05 `runLog.logFor()` snapshots the buffer, so a line logged after the trace literal is never persisted; log (e.g. the `Run complete` cost line) before building the trace. Applies to `src/modules/reviews/run-executor.ts:292`.

## Tool & Library Notes

## Recurring Errors & Fixes
- 2026-10-05 `completeAgentRun` sets status `done` before `saveRunTrace`, so a test reading `/runs/:id/trace` right after `waitForPrRuns` can see no trace; poll in the helper. Applies to `test/reviews.it.test.ts:19`.

## Session Notes
- 2026-10-05 Added 3 entries to server/INSIGHTS.md (run-cost-badge).

## Open Questions
