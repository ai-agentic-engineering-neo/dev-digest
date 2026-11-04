# Run Cost Badge — server (+ reviewer-core, shared contracts)

Client half: [../../client/specs/run-cost-badge.md](../../client/specs/run-cost-badge.md).

## Goal

Persist the USD cost of every agent run and expose it on the existing GET routes, so the UI can show
cost per run (timeline, trace drawer) and total spend per PR (PR list). **Zero extra model calls** —
cost already arrives with every LLM response (`usage.cost` from OpenRouter, else the PriceBook /
`estimateCost` fallback) and is summed in `reviewer-core` (`ReviewOutcome.costUsd`); today it is
simply dropped by `run-executor.ts` before persistence.

## Background

- `agent_runs.cost_usd` existed in `0000_init` and was dropped in `0009_complex_runaways.sql`.
  We re-add it with a **new generated migration** (approved by the user, 2026-11-04).
- `costUsd === null` means "unknown" (some call used a model with no price). It is never coerced to 0.

## Scope

### reviewer-core — `src/review/run.ts`
- Add optional `onUsage?: (u: { tokensIn: number; tokensOut: number; costUsd: number | null }) => void`
  to `ReviewInput`; call it after **each** successful chunk call with that chunk's usage.
- `ReviewOutcome` is unchanged (already carries `tokensIn/tokensOut/costUsd`).
- Purpose: when a later chunk throws (map-reduce), the caller still knows what was already spent.
- Known limitation: usage of a call that itself throws (e.g. schema retries exhausted, 429) is not
  reported — the provider throws before returning usage. Partial cost = completed chunks only.

### Shared contracts — BOTH copies (`server/src/vendor/shared`, `client/src/vendor/shared`)
Edit approved by the user. Add the same field to both copies:
- `RunSummary.cost_usd: z.number().nullable()`
- `RunStats.cost_usd: z.number().nullish()` — `nullish` so traces stored before this feature still parse.
- `PrMeta.cost_usd: z.number().nullish()` — list endpoint only, like `score`.

### DB — `src/db/schema/runs.ts`
- Add `costUsd: doublePrecision('cost_usd')` (nullable) to `agentRuns`.
- `pnpm db:generate` → new migration file; never edit `0009` or earlier. Apply with `pnpm db:migrate`.

### Persistence — `modules/reviews`
- `completeAgentRun` (`repository/run.repo.ts` + the `ReviewRepository` wrapper in `repository.ts`):
  new `costUsd: number | null` value, written to `cost_usd`.
- `run-executor.ts`:
  - success: pass `outcome.costUsd` to `completeAgentRun` and `cost_usd` into `trace.stats`.
  - accumulate `onUsage` into local `spent = { tokensIn, tokensOut, costUsd }` (null-propagating sum,
    same rule as reviewer-core).
  - failure / cancel: persist `spent` (tokens AND cost) instead of the current hard-coded `0`s;
    `traceFromBuffer` stats get the same values. A run that failed before any LLM call → tokens 0,
    `cost_usd` **null** (nothing spent is shown as "—", not "$0.00").
- `listRunsForPull`: map `run.costUsd` → `cost_usd`.

### PR list — `modules/pulls/routes.ts` `GET /repos/:id/pulls`
- `cost_usd` per PR = **sum of `agent_runs.cost_usd` over ALL runs of that PR** (any status, incl.
  partial failed runs) = total spend on the PR.
- One extra query next to the existing latest-review query:
  `select pr_id, sum(cost_usd) from agent_runs where workspace_id = $ws and pr_id in (...) group by pr_id`.
  Must filter by `workspaceId` explicitly (no automatic guard).
- `sum()` ignores NULL rows; a PR with no runs or only NULL-cost runs → `cost_usd: null`.
  Postgres returns `sum(double precision)` as a number-ish string via the driver → coerce with `Number()`.

## Acceptance criteria

1. After a successful run, `agent_runs.cost_usd` equals `ReviewOutcome.costUsd`; `GET /pulls/:id/runs`
   (run history) and `GET /runs/:id/trace` return it as `cost_usd` / `stats.cost_usd`.
2. A map-reduce run failing on chunk N persists tokens + cost of chunks 1..N-1.
3. A run failing before any LLM call, or with an unknown-price model, has `cost_usd = null`.
4. `GET /repos/:id/pulls` returns `cost_usd` = sum over the PR's runs, `null` when nothing priced;
   only runs of the caller's workspace are counted.
5. Old traces without `stats.cost_usd` still parse; old runs return `cost_usd: null`.
6. No new LLM calls; no change to review output.
7. Tests:
   - reviewer-core unit: `onUsage` fires once per chunk with correct numbers (`test/run.test.ts`).
   - server unit: executor persists partial usage on failure (mock LLM from `src/adapters/mocks.ts`).
   - server `.it.test.ts`: pulls list sum + workspace scoping; run history returns `cost_usd`.
   - `server/test/contracts.test.ts` updated for the new fields.
   - `reviewer-core` change ⇒ run server unit tests too.

## Implementation order

1. reviewer-core `onUsage` + test → 2. contracts (both copies) → 3. schema + `db:generate` + migrate →
4. repo + executor → 5. pulls route aggregation → 6. tests (`pnpm typecheck`, unit, it).
