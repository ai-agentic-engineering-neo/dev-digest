# Run cost badge (M1)

## Goal
Show how many US dollars each review run cost, and how much each PR has cost in
total, so the user can see what reviews actually spend and compare agents/models.
Cost appears in three places: the Agent runs timeline, the PR list, and the
Run trace drawer.

## Context (what exists today)
- `reviewer-core` already returns `costUsd` per run (`src/review/run.ts:110`):
  OpenRouter's real `usage.cost` when available, otherwise the injected
  price-book estimate (`server/src/platform/price-book.ts`), or `null` when the
  model is unknown. If any chunk's cost is unknown, the run's cost is `null`.
- The server drops it: `run-executor.ts` persists only `tokensIn`/`tokensOut`,
  and `agent_runs` has no cost column. No UI shows cost.

## Scope
- In:
  - Persist cost per successful run.
  - Agent runs timeline row: `9,119 tok · $0.0013` under the run time.
  - PR list: new **Cost** column = sum of all runs of that PR.
  - Run trace drawer → Stats: new **Cost** stat card next to Duration/Tokens/Findings.
- Out (explicitly not doing):
  - Cost of failed/cancelled runs (they show `—`; the engine returns no usage on error).
  - Backfilling runs created before this feature (they show `—`).
  - Other items visible in the reference screenshots: Findings column and
    Run Review button in the PR list, copy-run button, "3/3 passed" badge.
  - Severity filter (the other half of M1) — separate spec.
  - Budgets, alerts, per-agent cost stats (M7/M8).

## Design

### Packages touched
server · shared contracts (server + client copy) · client. reviewer-core: none.

### Data
- `agent_runs.cost_usd` — `doublePrecision`, nullable, in
  `server/src/db/schema/runs.ts`. Migration via `pnpm db:generate`
  (never hand-edited).
- `null` means "unknown": old run, failed run, or model without a price.

### Server
- `modules/reviews/run-executor.ts`: take `costUsd` from the engine outcome and
  pass it to `completeAgentRun(...)`; also write `cost_usd` into the trace
  `stats`. Failed/cancelled paths leave it `null`.
- `modules/reviews/repository/run.repo.ts`: select `cost_usd` into `RunSummary`.
- `modules/pulls/routes.ts` (`GET /repos/:id/pulls`): one extra grouped query
  `SUM(cost_usd)` over `agent_runs` per PR (`WHERE pr_id IN (…)`, workspace
  scoped). Deleted runs are gone from the table, so they don't count.
  - All runs `null` (or none) → `cost_usd: null`.
  - Some runs known, some `null` → sum of the known ones (SQL `SUM` skips nulls).

### Contracts (change in BOTH `server/src/vendor/shared` and `client/src/vendor/shared`)
- `RunSummary.cost_usd: z.number().nullable()` (`contracts/trace.ts`).
- `RunStats.cost_usd: z.number().nullish()` — `nullish` because traces stored
  before this feature don't have the field.
- `PrMeta.cost_usd: z.number().nullish()` (`contracts/platform.ts`) —
  `nullish` because the GitHub adapter also builds `PrMeta` without cost.

### Client
- One shared formatter `formatUsd(value, { estimated })` in `src/lib/format.ts` —
  ONE format in all three places so decimals line up in the Cost column:
  - `null`/`undefined` → `—`
  - `> 0` and `< $0.0001` → `<$0.0001` (a real run cost $0.0000498 — must not read as free)
  - `< $1` → always 4 decimals (`$0.0041`, `$0.0140`, `$0.0000` for a free model)
  - `≥ $1` → 2 decimals (`$1.27`)
  - estimated → same digits, prefixed `~` (`~$0.0041`); tooltip is text only, no exact amount
  - (Revised 2026-11-22: the first version varied 3–4 decimals around the 1¢
    threshold, which cut right through real run/PR sums.)
- `RunHistory` (Agent runs timeline): right column shows the time and below it
  `{tokens} tok · {cost}` in mono, muted. Only for `done` runs.
- `PRRow` + PR list header (`pulls/page.tsx`, `pulls/styles`): new **Cost**
  column between Status and Updated, mono, right-aligned; `—` when null.
- `RunTraceDrawer` → `TraceBody`: fourth `Stat` "Cost" using `formatUsd`.
- All labels via next-intl: `messages/en/prReview.json` (list header),
  `messages/en/runs.json` (trace stat, `tok` unit) — check which file each
  component already uses.

### UI states
- Unknown cost → `—` (with a tooltip "Cost unknown for this model / run").
- Running run → no cost shown yet; appears after the run completes (existing refetch).

## Acceptance criteria
- [ ] A new successful run with an OpenRouter model stores a non-null `cost_usd`.
- [ ] Timeline row for that run shows `N tok · $X` next to the time.
- [ ] PR list shows a Cost column; value = sum of the PR's runs; `—` for never-reviewed PRs.
- [ ] Trace drawer Stats shows Cost; old traces show `—` and still render.
- [ ] Failed runs and pre-feature runs show `—` and don't break the PR sum.
- [ ] Deleting a run lowers the PR's Cost after refetch.
- [ ] Tests:
  - server unit: run-executor passes `costUsd` to `completeAgentRun` (mock LLM returns `costUsd: 0.001`).
  - server integration (`reviews.it.test.ts` / new `pulls-cost.it.test.ts`): PR list sums known costs, ignores nulls, returns `null` when none.
  - server `contracts.test.ts`: new fields parse; old trace without `cost_usd` still parses.
  - client: `formatUsd` table test; `RunHistory`, `PRRow`, `TraceBody` render cost and `—`.

## Addendum — estimated costs (2026-11-22)

Reverses "Out: backfilling runs created before this feature". Decisions:

- **Old runs get an approximate cost**: `tokens_in × input price + tokens_out × output price`
  at the **live OpenRouter list price** (`/models`). Only `done` runs with tokens
  and no cost; failed runs stay `—`. Calibration against one real run
  (2,867→277 tok, real $0.0000498, list estimate $0.00031) shows the list price
  overestimates ~6× (caching/provider routing), so an estimate is an upper bound.
- **Estimates are marked**: new column `agent_runs.cost_estimated boolean not null default false`.
  UI shows `~$0.0003` with tooltip "Estimated from tokens × list price". A PR sum
  is `~` when any run in it is estimated.
- **New runs are marked too** when the cost did not come from the provider:
  OpenAI/Anthropic adapters (always price table) and OpenRouter when
  `usage.cost` is missing. reviewer-core propagates `costEstimated` (any chunk
  estimated → run estimated). `StructuredResult/CompletionResult.costEstimated?: boolean`.
- **Mechanism**: one-off idempotent script `pnpm db:backfill-costs`
  (`server/src/db/backfill-costs.ts`). Warms the PriceBook; a model without a
  live price is skipped (no static-table fallback) and reported. Also writes
  `stats.cost_usd` / `stats.cost_estimated` into the run's trace document.
- Contracts: `RunSummary.cost_estimated: boolean`, `RunStats.cost_estimated` and
  `PrMeta.cost_estimated`: `boolean().nullish()`.

## Open questions
- Should the PR Cost tooltip break it down per agent? (Not in this milestone.)
