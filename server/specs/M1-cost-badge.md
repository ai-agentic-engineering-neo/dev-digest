# M1 · Run cost badge (server)

Client side: `client/specs/M1-cost-badge.md`.

## Goal
Show what each agent review run cost (USD + tokens), so reviewers can see spend per run and per PR.
It costs nothing extra: no additional model calls, only the usage the provider already returns.

## User-visible behaviour
- `GET /pulls/:id/runs`: each `RunSummary` carries `cost_usd`.
- `GET /runs/:id/trace`: `stats.cost_usd`.
- `GET /repos/:id/pulls`: each `PrMeta` carries `cost_usd`, the **latest-round** cost.
  - That is the sum of `cost_usd` over the newest run of each agent on the PR. Older re-runs are ignored.
  - A latest run with no cost contributes nothing, and the round does not fall back to an older run.
  - Runs of deleted agents are skipped.
  - When no run in the round has a cost, `cost_usd` is null.

`null` means unknown. The UI shows it as "—", never "$0.00".

## Where the cost comes from
1. `reviewer-core` `openrouter.ts` uses `usage.cost` from OpenRouter, or `PriceBook.estimate()` if the response has none.
2. The OpenAI and Anthropic adapters take tokens and price them with `estimateCost()`.
3. `reviewPullRequest` sums cost across map-reduce chunks. If any chunk is null, the total is null.
4. `run-executor` writes it to `agent_runs.cost_usd` and to `trace.stats.cost_usd`.

## Contract & data changes
- DB: `agent_runs.cost_usd double precision` (nullable). Migration `0010` re-adds the column that `0009` dropped.
- `RunSummary.cost_usd: number | null`.
- `RunStats.cost_usd: number | null | undefined`. It is `nullish` because traces saved before M1 have no such field.
- `PrMeta.cost_usd: number | null | undefined`. Only the list endpoint fills it.
- Both copies of `@devdigest/shared` are updated.
- Pure helper: `src/modules/pulls/cost.ts` → `latestRoundCost()`.

## Out of scope
- Cost of failed or cancelled runs. They stay null: tokens spent before the failure are not recovered.
- Backfill for historical runs.
- e2e coverage. The seed creates no `agent_runs`.

## Acceptance
- [x] Completed run persists `cost_usd` (`test/reviews.it.test.ts`).
- [x] Runs list, trace stats and PR list expose it (same test).
- [x] Latest-round aggregation rules (`test/pulls-cost.test.ts`).
- [x] Old traces without `cost_usd` still parse (`test/contracts.test.ts`).
- [x] Engine sums cost per chunk; one null chunk makes the total null (`reviewer-core/test/run.test.ts`).
