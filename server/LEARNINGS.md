# server — learnings

Lessons captured while working in this module, written by the
`engineering-insights` skill. Append-only: add entries, never rewrite or delete
them; correct an entry by appending a new dated one that names it. Curated
facts about the module, where the module keeps them, are in `INSIGHTS.md`.

Entry format:
`- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — Run cost is already computed per LLM call (OpenRouter `usage.cost`, else `estimateCost`) and summed by reviewer-core into `ReviewOutcome.costUsd`; to surface it, persist it in `run-executor` — never add a model call or recompute from tokens. Failed/cancelled paths hard-code tokens 0 and cost null, so read cost only from `status='done'` runs. Evidence: server/src/modules/reviews/run-executor.ts:214

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

## Decisions

<!-- A decision and the reason for it. -->

- 2026-11-21 — M1 cost badge edited the existing `reviews` and `pulls` modules instead of adding a new module: the cost originates in `reviews` and the list route lives in `pulls`; a new module would only duplicate those reads. `PrMeta.last_run_cost_usd` = newest `done` run, so a running/failed newer run never replaces it with a fake price. Evidence: server/src/modules/pulls/routes.ts:172

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and specs/ for the package; no source code changed.

- 2026-11-21 — Built M1 run cost badge (server): `agent_runs.cost_usd` (migration 0010), cost in RunSummary/RunStats/PrMeta, idempotent seeded run for PR #482; spec server/specs/M1-cost-badge.md.

## Open Questions

<!-- What is still unresolved. -->

- 2026-11-21 — `TESTING.md` says `server/package.json` is `skip-worktree`, but `git ls-files -v` shows no skip-worktree file in this clone. Until confirmed, run the test split with `pnpm exec vitest run …` as CI does and do not add `test:unit` / `test:integration` scripts. Evidence: TESTING.md:83
