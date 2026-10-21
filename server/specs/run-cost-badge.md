# Run Cost Badge (L01) — server

Show the cost and tokens of every review run. This file owns the data model,
the API shape, and the executor change. The UI half lives in
[`client/specs/run-cost-badge.md`](../../client/specs/run-cost-badge.md).

Status: **implemented 2026-09-25** (all steps below; migration `0010_huge_marten_broadcloak`).
The client half landed the same day. Written 2026-09-25.

## Goal

Every completed run exposes `tokens_in`, `tokens_out`, and `cost_usd`, and the
GET routes the four UI surfaces read from carry those numbers:

| Surface | Route | Field(s) |
|---|---|---|
| PR list COST column | `GET /repos/:id/pulls` | `PrMeta.cost_usd` (sum over the PR) |
| Agent runs timeline | `GET /pulls/:id/runs` | `RunSummary.cost_usd` + tokens |
| Run trace drawer, Stats | `GET /runs/:id/trace` | `RunTrace.stats.cost_usd` + tokens |
| Review Runs accordion | `GET /pulls/:id/runs` (client joins by `run_id`) | same as timeline |

Constraints from the lab brief: a run without data shows «—», never `$0.00`;
**zero additional model calls**; cost = tokens × price, or the provider's own
`usage.cost` when it returns one.

## Where the numbers already come from

Nothing new is computed. This feature re-plumbs a value the engine still
produces and the server dropped in commit `d45ab0d`:

- `reviewer-core` `reviewPullRequest` returns `costUsd: number | null`
  (`reviewer-core/src/review/run.ts`). It sums per-call `costUsd`; one unknown
  chunk makes the whole run `null`.
- `OpenRouterProvider.completeStructured` uses OpenRouter's `usage.cost` when
  present, else the injected estimator (`reviewer-core/src/llm/openrouter.ts`).
  The server injects `PriceBook.estimate` (live `/models` prices with the
  static table as fallback, `server/src/platform/container.ts`).
- `OpenAIProvider` / `AnthropicProvider` use the static table in
  `server/src/adapters/llm/pricing.ts`; unknown model → `null`.
- The PriceBook's `/models` fetch is a catalog request, not a model call.

`reviewer-core` needs **no change**.

## Scope

In:
- Re-add `agent_runs.cost_usd` and persist it at run completion.
- `cost_usd` on `RunSummary`, `RunStats`, and `PrMeta` (shared contracts).
- Per-PR cost rollup on the PR list route.
- One seeded completed run so a fresh DB shows cost on every surface (demo + e2e).
- Tests listed below.

Out:
- Backfilling runs that predate the column (they show «—»; decided 2026-09-25).
- Agent-level cost aggregates (`observability.ts` `total_cost_usd`, L07/L08).
- The Multi-Agent page `page.meta` `{cost}` placeholder.
- Any change to pricing tables, PriceBook, or the LLM adapters.

## Data model

`server/src/db/schema/runs.ts`:

```ts
costUsd: doublePrecision('cost_usd'),   // null = unknown, 0 = free model
```

Generate migration `0010_*` with `pnpm db:generate`. Expected SQL:
`ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;`.
Migration `0009` (the drop) stays untouched. No backfill.

Semantics of the column:

| Situation | `cost_usd` |
|---|---|
| Done run, provider returned `usage.cost` | that value (summed over chunks) |
| Done run, price known from PriceBook / static table | tokens × price |
| Done run, unknown model | `null` |
| Done run on a zero-priced model | `0` |
| Failed / cancelled run | `null` (tokens stay `0` as today) |
| Run completed before migration 0010 | `null` |

## Contracts (`server/src/vendor/shared`, then copy to client)

`contracts/trace.ts`:
- `RunStats`: add `cost_usd: z.number().nullable()`.
- `RunSummary`: add `cost_usd: z.number().nullable()`.

`contracts/platform.ts`, `PrMeta` (list endpoint only, like `score`):
- `cost_usd: z.number().nullish()` — sum of `cost_usd` over the PR's runs with
  `status = 'done'` and non-null cost; `null` when there is none.
- `cost_runs: z.number().int().nullish()` — how many runs are in that sum, for
  the tooltip («3 runs»). `0`/`null` when `cost_usd` is null.

The client copy of `trace.ts` currently differs from the server copy only in
two doc comments; `platform.ts` is identical. Sync both files after editing.
Do not sync `adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`
as part of this task (pre-existing drift, out of scope).

## Server changes

1. `modules/reviews/repository/run.repo.ts`
   - `completeAgentRun`: accept `costUsd: number | null` and write it.
   - `listRunsForPull`: map `cost_usd: run.costUsd`.
   - New `costRollupForPulls(db, prIds)` → `Map<prId, { cost_usd, cost_runs }>`.
     One grouped query: `sum(cost_usd)`, `count(*)` over
     `agent_runs where pr_id in (...) and status = 'done' and cost_usd is not null`.
2. `modules/reviews/repository.ts`: expose `costRollupForPulls`.
3. `modules/reviews/run-executor.ts`
   - Destructure `costUsd` from the engine outcome; pass to `completeAgentRun`
     and into `trace.stats.cost_usd`.
   - `failAll`, the catch branch, and `traceFromBuffer` pass `null`.
4. `modules/pulls/routes.ts` (`GET /repos/:id/pulls`): call the rollup next to
   the existing latest-score lookup and map `cost_usd` / `cost_runs`.
5. `db/seed.ts`: insert one `agent_runs` row (`status 'done'`, provider/model of
   the seeded agent, `tokens_in 8_190`, `tokens_out 929`, `cost_usd 0.0013`,
   `duration_ms 8_200`, `findings_count 2`, `grounding '2/2 passed'`,
   `score 61`, `blockers 1`) plus a minimal `run_traces` document, and set
   the seeded review's `run_id` to it. Idempotent like the rest of the seed.
   This is what makes the e2e flow deterministic without a model call.

## Acceptance criteria

1. A completed run through the mock LLM (`adapters/mocks.ts`, `costUsd: 0.001`
   per call) persists `agent_runs.cost_usd = 0.001 × chunks` and the trace has
   the same value in `stats.cost_usd`.
2. A failed run persists `cost_usd = null`.
3. `GET /pulls/:id/runs` returns `cost_usd` on every row (null allowed).
4. `GET /repos/:id/pulls` returns `cost_usd` = sum over done runs with a cost,
   `null` when the PR has no such run; failed runs and null-cost runs are
   excluded; deleting a run (`DELETE /runs/:id`) removes it from the sum.
5. No new outbound LLM call is introduced (mock LLM call count unchanged in the
   integration test).
6. Fresh `pnpm db:seed` yields a PR whose list row, timeline, drawer, and
   accordion all show cost.

## Tests

- `test/contracts.test.ts`: add `cost_usd` to the `RunTrace` fixture; add a
  `RunSummary` and `PrMeta` parse case with `cost_usd: null`.
- `test/reviews.it.test.ts`: extend the existing run assertion with
  `run.costUsd` and `trace.stats.cost_usd`; add a failed-run case asserting
  `null`.
- New `test/pulls-cost.it.test.ts`: seed two done runs with cost, one done run
  with null cost, one failed run; assert the list rollup and the count.
- Unit: a hermetic test for the rollup mapping if it gets any logic beyond the
  query (otherwise the `.it.test` covers it).

## Plan (ordered)

1. Schema + `pnpm db:generate` + `pnpm db:migrate`.
2. Contracts in `vendor/shared`; copy `trace.ts` and `platform.ts` to the client.
3. `run.repo.ts` + `repository.ts`.
4. `run-executor.ts`.
5. `pulls/routes.ts` rollup.
6. Seed run.
7. Tests, `pnpm typecheck`, unit + integration suites.
8. `engineering-insights` wrap-up sweep for `server/`.

Commit: `feat(reviews): persist run cost and expose it on runs, traces and the PR list`.

## Decisions

- **Store cost at completion, do not compute on read.** Prices change; the
  cost at the time of the run is the truth. Rejected: tokens × current price
  in the GET routes.
- **PR cost = sum of all done runs.** Answers «how much has this PR cost».
  Rejected: latest run only (hides re-runs and multi-agent cost).
- **No backfill for pre-0010 runs.** Historical prices are unknowable; the
  brief says no data → «—».
- **`null` vs `0`.** `null` means unknown; `0` is a real price (free model)
  and renders as `$0.00`.

## Open questions

- Should the rollup also carry `tokens_total` for the list tooltip? Cheap to
  add in the same query; deferred until the tooltip design asks for it.
