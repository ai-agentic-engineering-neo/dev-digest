# Insights — server

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

### 2026-09-14 — check git history before implementing a "missing" feature
When a feature looks like it's just never been built (e.g. cost tracking absent from `agent_runs`/`RunSummary`/the PR list), grep the git log for it before writing new code — this repo had "Cost" fully implemented and shipped, then reverted, twice: `93119a5e` (`feat(reviews): run cost badge`) and `d45ab0d2` (`feat(reviews): remove per-PR/run cost` — an even earlier attempt's removal), both wiped off `main` by `c6af1e4` (`revert: restore main to the starter state, homework belongs in forks`). `git show <sha> -- <path>` on those recovers a near-complete, previously-working reference diff (contracts, migration, repo/executor wiring, component APIs, i18n keys, test cases) instead of designing from scratch. `git diff <sha>^..HEAD -- <path>` confirms whether the current file still matches the pre-feature state before trusting the diff will apply cleanly.

## Mistake

## Decision

### 2026-09-14 — `agent_runs.batch_id` groups one runReview() call's runs
`server/src/db/schema/runs.ts` (`agentRuns.batchId`, uuid, no FK) + `server/src/modules/reviews/service.ts` (`runReview`, one `randomUUID()` shared across the per-agent `createAgentRun` loop). Needed because the PR-list Cost column sums the *latest review batch's* completed run costs (all agents one "Run Review" click targeted), not just the single most-recent run — the historical `93119a5e` implementation only ever surfaced the single-latest-run cost, so `batch_id` didn't exist before. Aggregation lives in `server/src/modules/pulls/latest-batch-cost.ts` (`latestBatchCostByPr`): newest-first, first-seen batch key per PR wins, only `status='done'` rows in that batch contribute, zero contributing rows → `null` not `0`.

## Context

### 2026-09-14 — `reviewer-core`'s `ReviewOutcome.costUsd` was being computed and discarded
`reviewer-core/src/review/run.ts`'s `reviewPullRequest()` already sums per-chunk LLM cost into `ReviewOutcome.costUsd` (map-reduce aware — null if any chunk's cost is unknown). `server/src/modules/reviews/run-executor.ts`'s `runOneAgent` received this in `outcome` but did `const { tokensIn, tokensOut, grounding } = outcome;`, silently dropping `costUsd` before it ever reached `completeAgentRun`. Any future "cost" feature work should start by checking whether the number is already flowing through `ReviewOutcome`/`CompletionResult`/`StructuredResult` (it usually is, via `estimateCost`/`PriceBook` in `server/src/adapters/llm/*` and `server/src/platform/price-book.ts`) before adding new computation.

## Open Questions
