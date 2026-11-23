# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. One line: `- YYYY-MM-DD — what — why/fix`.
If Claude keeps getting it wrong anyway, promote it to `server/CLAUDE.md`.

- 2026-11-22 — `db:migrate` / `db:seed` silently did nothing on Windows — the CLI-entrypoint check built `file://${argv[1]}` by hand; use `pathToFileURL(argv[1]).href`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes
- 2026-11-22 — Unit suite has 8 baseline failures on Windows (git-adapter-safety, indexer-pipeline, contained-read: POSIX path assumptions) — verified identical with changes stashed; not a regression signal (test/*.test.ts).

## Session Notes

## Open Questions
