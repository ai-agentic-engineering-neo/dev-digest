# Insights — server
<!-- Append-only, written via the engineering-insights skill
     (.claude/skills/engineering-insights/SKILL.md). Newest on top of each section.
     Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> — <why> (<path:line | command>) -->

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-14 · ALWAYS default new `RunStats`/`RunTrace` fields on read (`?? null`) in `getRunTrace` — `run_traces.trace` is a jsonb snapshot, old rows lack new fields and break the zod contract (server/src/modules/reviews/repository/run.repo.ts getRunTrace)
- 2026-10-14 · Use `agent_runs.review_batch_id` to group "one Run Review click" (one id per `runReview` call); rows before 2026-10-14 have null → treat as a batch of one (server/src/modules/pulls/status.ts latestReviewCostByPr)
- 2026-10-14 · DO persist run cost from `outcome.costUsd` at completion, don't recompute tokens×price on read — it keeps OpenRouter's real `usage.cost` and the price at run time; failed/cancelled → null (server/src/modules/reviews/run-executor.ts)

## Tool & Library Notes
- 2026-10-19 · `pnpm db:generate` blocks on an interactive "created or renamed?" prompt for every new column when the same table also drops one — non-TTY runs hang; drive it through a pty and answer Enter (= create), or split the drop into its own migration (server/src/db/migrations/0013_slim_gideon.sql)
- 2026-10-18 · NEVER add `'types'` to dependency-cruiser `conditionNames` together with a `\.d\.ts$` exclude — npm deps (drizzle-orm) resolve to `.d.ts`, get excluded, and `forbidden` rules on them silently never fire; probe a rule with a deliberate violation before trusting it (server/.dependency-cruiser.cjs)

## Recurring Errors & Fixes
- 2026-10-18 · `pnpm arch:check` reports 5 `drizzle-only-in-repositories` errors in legacy routes (workspace/settings/pulls/polling) that are NOT new — the baseline pins `drizzle-orm@0.38.4` paths and the S7 bump moved it to 0.45.4; re-run `pnpm arch:baseline` after a dep bump (only for this path drift) instead of chasing them (server/.dependency-cruiser-known-violations.json)

## Session Notes
- 2026-10-19 · L02 Conventions: modules/conventions (code-only sampling → one ConventionExtraction call → verifyEvidence gate), convention_scans, skills accept `source: extracted` + evidence_files (specs/conventions.md)
- 2026-10-18 · L02 Skills: modules/skills (CRUD + versions + zip/md import preview), agent_skills.enabled, enabled skills → prompt + skills_detail/block_tokens in trace (specs/skills.md)
- 2026-10-14 · Run Cost Badge: cost_usd + review_batch_id on agent_runs, cost in RunSummary/RunStats/PrMeta (specs/run-cost-badge.md)

## Open Questions
