# Run cost badge

Status: implemented
Packages: server, client

## Goal

Show what each AI review costs, so a reviewer can see spend per run and per PR at a
glance. The engine already computes the cost: `reviewer-core/src/review/run.ts` returns
`outcome.costUsd`, taken from OpenRouter `usage.cost`, else from the injected
`PriceBook.estimate`, else `null`. It is `null` if any chunk is unpriced. This feature
**stores and shows** that number. It makes **no extra model calls**.

Background: commit `d45ab0d` removed per-run cost from the starter (the
`agent_runs.cost_usd` column, `cost_usd` on `RunStats` / `RunSummary`, the COST stat).
This lesson adds it back and shows it in two new places.

## Scope

In scope: three surfaces.

1. **PR list:** a new `COST` column showing the **sum of all agent runs** of the PR
   (total spend), e.g. `$0.014`.
2. **PR detail → Agent runs timeline:** under each finished run's time, show
   `9,119 tok · $0.0013`.
3. **Run trace drawer → Stats:** a 4th tile, `COST`, between TOKENS and FINDINGS.

Out of scope: the VerdictBanner cost line, eval/CI cost (already handled separately),
and backfilling cost for runs made before the migration.

## Contracts

Change `server/src/vendor/shared` and mirror the change into `client/src/vendor/shared`.

| Schema | File | Field |
|---|---|---|
| `RunStats` | `contracts/trace.ts` | `cost_usd: z.number().nullish()` |
| `RunSummary` | `contracts/trace.ts` | `cost_usd: z.number().nullable()` |
| `PrMeta` | `contracts/platform.ts` | `cost_usd: z.number().nullish()` (list endpoint only, like `score`) |

`RunStats.cost_usd` is **nullish** because traces are stored as jsonb in
`run_traces.trace`, and `getRunTrace` casts that jsonb instead of parsing it. Traces
saved before this change have no `cost_usd` field, and they must still open.

DB: `agent_runs.cost_usd double precision NULL`. The migration is generated with
`pnpm db:generate` (`0010_*`), not written by hand.

## Behaviour

### Server

- `run-executor.ts`: read `costUsd` from `outcome`, pass it to `completeAgentRun`, and
  write it into the trace `stats.cost_usd`. Failed and cancelled runs store `null`.
- `repository/run.repo.ts`: `completeAgentRun` stores `costUsd`, and `listRunsForPull`
  returns `cost_usd`.
- `pulls/routes.ts` (`GET /repos/:id/pulls`): one grouped query,
  `SUM(cost_usd) … WHERE pr_id IN (…) GROUP BY pr_id`. SQL `SUM` skips NULLs, so a PR
  whose costs are all null, or that has no runs, gets `cost_usd: null`. Drizzle `sum()`
  returns a string, so convert it with `Number()`.

### Client

- `lib/format-cost.ts` → `formatCost(usd?: number | null)`, with precision based on
  the amount:
  - `< $0.01` → 4 decimals (`$0.0013`)
  - `< $1` → 3 decimals (`$0.014`)
  - otherwise → 2 decimals (`$1.24`)
  - `null` / `undefined` → `—` (never `$0.00`)
- `components/run-cost-badge` → `RunCostBadge` with two variants:
  - `compact`: `$0.014`, used in the PR list.
  - `full`: `9,119 tok · $0.0013`, used in the timeline. Tokens are `in + out`,
    formatted with `toLocaleString`.
- PR list: add `cost` to `COLUMN_KEYS` after `status` and a matching track to `GRID`.
  Add the i18n key `prReview.list.columns.cost`.
- Timeline (`RunHistory.tsx`): show the `full` badge only for runs with
  `status === "done"`.
- Trace (`TraceBody.tsx`): add `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />`.
  Add the i18n key `runs.trace.stat.cost`.

## Acceptance criteria

- [ ] Every finished run shows its cost in the timeline and in the trace. The PR list
      shows the summed cost per PR.
- [ ] A run with no price data (unknown model, failed, made before the migration)
      shows `—`, never `$0.00`.
- [ ] No extra LLM calls. The cost comes from `outcome.costUsd`.
- [ ] The touched contract files match between the server and client `vendor/shared`
      copies.
- [ ] Traces saved before this change (no `stats.cost_usd`) still open without errors.

## Tests

- server `test/contracts.test.ts`: a RunTrace fixture with `cost_usd`, and one without it.
- server `test/reviews.it.test.ts`: after a mock review (the mocks return
  `costUsd: 0.001`), check that the cost is set in the DB row, in `GET` runs, and in
  trace `stats.cost_usd`.
- server pulls list (integration): two runs on one PR are summed; a PR with no runs
  returns `null`.
- client: unit tests for `formatCost` at the precision boundaries;
  `RunHistory.test.tsx` checks `tok · $`; `RunTraceDrawer.test.tsx` checks the COST
  tile; the PR list test checks the Cost column and the `—` case.

## Open questions

None. The aggregate type, number format, timeline content and scope were agreed on
2026-10-09.
