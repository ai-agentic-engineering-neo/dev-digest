# Insights — reviewer-core

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. One line: `- YYYY-MM-DD — what — why/fix`.
If Claude keeps getting it wrong anyway, promote it to `reviewer-core/CLAUDE.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
- 2026-11-24 — `node_modules` here is npm-installed on Windows (win32-only esbuild/rollup). The API still runs on Linux because it only needs `openai` + `zod`, but `npm test` (vitest) on Linux probably needs `npm ci` there first. Not checked yet, and running it would drop the win32 binaries again.
