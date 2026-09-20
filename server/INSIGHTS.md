# server insights

Append-only. One line per finding, at the end of its section:
`- YYYY-MM-DD Fact, the action to take, and why. Applies to path/file.ext:LINE.`

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-09-19 Server boot (`src/server.ts`) never runs migrations; run `pnpm db:migrate` explicitly after pulling schema changes. Applies to `package.json:13`.
- 2026-09-19 An unindexed repo silently degrades to a diff-only review (no repo map is attached); index the repo first when review context looks thin. Applies to `src/modules/reviews/run-executor.ts:370`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
