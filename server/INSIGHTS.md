# Insights — server

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work

## Codebase Patterns
- `LOG_LEVEL` can arrive as an empty string from `.env` → config schema must accept it (e993f25).
- Server boot needs `reviewer-core/node_modules` installed — it compiles reviewer-core source via path alias (e993f25).
- 2026-10-07 — `getRunTrace` returns the stored `run_traces` jsonb cast to `RunTrace` without parsing, and GET routes have no zod response schema → any new field on `RunStats`/`RunTrace` must be `.nullish()` (old traces lack it) and clients must handle `undefined` (server/src/modules/reviews/repository/run.repo.ts:getRunTrace).

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes
- 2026-10-07 — Run Cost Badge: re-added `agent_runs.cost_usd` (migration 0010, after 0009 dropped it); partial cost on failed runs comes from reviewer-core `onUsage` (server/specs/run-cost-badge.md).

## Open Questions
