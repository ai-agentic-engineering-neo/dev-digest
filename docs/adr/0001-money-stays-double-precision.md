# 0001 — Run costs stay `double precision` for now

Status: Accepted · 2026-11-25 · plan item D2

## Context
`cost_usd` is `double precision` in `agent_runs`, `ci_runs` and `eval_runs`
(server/src/db/schema/{runs,ci,eval}.ts). Binary floats can't represent most
decimal cents exactly, so sums drift in the last digits. Today no SQL aggregates
cost: the PR list's cost column is summed in JS (`pulls/domain/cost.ts`
`aggregatePrCosts`) over a handful of runs, and the UI formats to cents
(`client/src/lib/format-cost.ts`), so the drift is invisible. The values
themselves come from provider estimates, which are not exact either.

## Decision
Keep `double precision`. Don't migrate until cost becomes money that is
aggregated or reconciled.

## Consequences
- No migration, no contract change (`cost_usd` stays a JSON number).
- Any new code that sums costs must round at the presentation edge, not store
  rounded sums.

## Revisit when
- costs are summed in SQL (`SUM(cost_usd)`) for reports, budgets or billing, or
- totals are compared to a provider invoice / shown with more than cent precision.

Then: migrate to `numeric(12,6)`; postgres-js returns numeric as a string, so map
it to `number` in the repositories and keep the contracts unchanged.
