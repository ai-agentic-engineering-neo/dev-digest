# M1 — Run cost badge (server)

Status: built

## Problem

A reviewer cannot see what an agent run cost. Each LLM call already returns
usage and cost, but `run-executor` discarded the run's `costUsd`, and
`agent_runs` had no cost column (it was dropped in migration 0009).

## Goals

- Every completed agent run stores its USD cost on `agent_runs.cost_usd`.
- The run history, the run trace and the PR list return that cost.
- No extra model calls. The cost is OpenRouter's real `usage.cost`; when that
  is missing, it is tokens × price from the `PriceBook` / `estimateCost`.

## Non-goals

- Backfilling cost for runs stored before this change. They stay `null`.
- Recording the tokens or cost already spent by failed or cancelled runs.
- A per-PR total across all runs, and the Agent Performance and CI cost screens.

## Behaviour

1. `reviewer-core` adds up `costUsd` across chunks into `ReviewOutcome.costUsd`.
   It is `null` if any call's cost was unknown. This code is unchanged.
2. `run-executor` writes that value to `agent_runs.cost_usd` and to
   `run_traces.trace.stats.cost_usd` when the run is `done`.
3. Failed, cancelled and skipped runs store `cost_usd = null`.
4. `GET /repos/:id/pulls` adds `last_run_cost_usd` to each PR: the cost of the
   newest run with `status='done'`. It is `null` when the PR has no completed
   run or that run's cost is unknown. Running and failed runs are skipped, so
   the list never shows a partial price. The lookup is one `IN` query, the same
   way the latest score is fetched.

## Changes

- Table: `agent_runs.cost_usd double precision null` (`src/db/schema/runs.ts`),
  migration `0010_fair_hydra.sql`.
- Module `reviews`: `run-executor.ts`, `repository.ts`, `repository/run.repo.ts`
  (`completeAgentRun` takes `costUsd`; `listRunsForPull` returns `cost_usd`).
- Module `pulls`: `routes.ts` (latest completed run cost per PR).
  This is a deliberate exception to "a milestone is a new module". The cost is
  produced in `reviews` and the list lives in `pulls`; a new module would only
  duplicate those reads.
- Contracts (both copies of `@devdigest/shared`):
  - `RunStats.cost_usd` (nullish, because stored traces from before M1 do not have it)
  - `RunSummary.cost_usd` (nullable)
  - `PrMeta.last_run_cost_usd` (nullish)
- Seed: PR #482 gets one completed Security Reviewer run (8,200 → 1,300 tokens,
  $0.0142) with a trace, and is linked to the sample review. This step is
  idempotent.

## Acceptance criteria

- [x] A done run stores a cost > 0 when the provider reports one.
- [x] `/runs/:id/trace`, `/pulls/:id/runs` and `/repos/:id/pulls` all return the same value.
- [x] A failed run stores `null`, and the PR list returns `null` for that PR.
- [x] Old traces without `cost_usd` still parse.
- [x] No additional LLM calls (the cost comes from the existing response `usage`).

## Tests

- `test/reviews.it.test.ts`:
  - "M1 run cost: a done run persists…": persisted cost and all three routes.
  - "M1 run cost: a failed run…": `null` cost on a failed run.
- `test/contracts.test.ts`: a `RunTrace` with and without `cost_usd`.

## Related specs

- [client/specs/M1-cost-badge.md](../../client/specs/M1-cost-badge.md)

## Open questions

- Should failed runs record the partial spend? That needs `reviewer-core` to
  return usage when it throws. It was deferred and failed runs show "—" for now.
