# client — learnings

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

- 2026-11-21 — Never run a second `next dev` in `client/` (any port) while `pnpm dev` is up: both share `client/.next`, and the original server then 404s its chunks (`ChunkLoadError: Loading chunk app/agents/page failed`). Recovery: stop it, `rm -rf .next`, `pnpm dev`. Evidence: scripts/e2e.sh:148

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — Failed runs carry `tokens_in/out = 0` (not null) in `RunSummary`; gate any token/cost display on `status === "done"` or a failed run renders `0→0`. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:204

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

## Decisions

<!-- A decision and the reason for it. -->

- 2026-11-21 — Review-run headers get their cost from the already-loaded `usePrRuns` (map `run_id → cost_usd`, done runs only) rather than widening the `ReviewRecord` contract; reuse that map for any other per-review run metric. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:50

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and specs/ for the package; no source code changed.

- 2026-11-21 — Built M1 run cost badge (client): `RunCostBadge` (compact/detailed) in PR list, timeline, review-run header and trace COST tile; spec client/specs/M1-cost-badge.md.

## Open Questions

<!-- What is still unresolved. -->
