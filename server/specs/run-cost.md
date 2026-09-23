# Run cost

Status: implemented (2026-09-20), PR-list aggregation revised 2026-09-23.

What a review run costs in USD, from the provider's token counts to the three
places the studio shows it.

## Goal

Make spend visible at the three altitudes a user actually asks about it:

1. **Per run** — Agent runs tab → Timeline tile, and the Trace drawer → Stats
   `COST` block. "What did this one review cost?"
2. **Per PR** — the `COST` column in the Pull Requests list. "What has this PR
   cost us so far?"
3. Neither is a billing system. These are estimates good enough to notice a
   model choice is expensive, not to reconcile an invoice.

## Where the number comes from

Three sources, in falling order of trust:

1. **Provider-reported cost.** OpenRouter returns `usage.cost` on the response;
   when present it wins outright (`reviewer-core/src/llm/openrouter.ts:97`).
   It's the only figure that reflects the provider's actual billing, including
   discounts and cache hits.
2. **Live price book.** `server/src/platform/price-book.ts:34` — per-model
   input/output prices fetched from OpenRouter and cached, refreshed lazily.
3. **Static table.** `server/src/adapters/llm/pricing.ts:39` —
   `(tokensIn * p.in + tokensOut * p.out) / 1e6`. Last resort, and the one that
   goes stale when a provider changes prices.

An unknown model returns **`null`, never `0`** at every layer.

## Null is not zero

The single invariant this whole feature rests on:

> `null` means "we don't know what this cost". `0` means "this genuinely cost
> nothing". They must never collapse into each other.

Consequences, each enforced in code:

- `estimateCost` returns `null` for an unpriced model rather than falling back
  to 0 (`pricing.ts:41`).
- Summing across chunks is **null-poisoning**: one unpriced call makes the
  whole run's cost unknown, because a partial sum presented as the total would
  understate it (`reviewer-core/src/review/run.ts:184`).
- The UI renders `—` for null and `$0.00` only for a real zero
  (`client/src/components/run-cost-badge/RunCostBadge.tsx:31-46`).
- The DB column is nullable `double precision`, not `NOT NULL DEFAULT 0`
  (`server/src/db/schema/runs.ts:23`).

## Persistence

`ReviewOutcome.costUsd` → `completeAgentRun(…)` → `agent_runs.cost_usd`, and
separately into the run trace's `stats.cost_usd`
(`server/src/modules/reviews/run-executor.ts:213,246,265`).

The projection from `ReviewOutcome` into `completeAgentRun` is **hand-written
field-by-field**, so a field the destructuring omits is dropped silently — no
type error, no failing test. That is exactly how `costUsd` was computed but
never persisted for months (see `server/INSIGHTS.md`, 2026-09-20). Adding
anything observable to a run means diffing `ReviewOutcome`'s shape against that
call by hand.

## Read paths

| Route | What it returns | Aggregation |
|---|---|---|
| `GET /pulls/:id/runs` | `cost_usd` per run, raw column, **all statuses** | none |
| `GET /runs/:id/trace` | `stats.cost_usd` for that run | none |
| `GET /repos/:id/pulls` | `cost_usd` per PR | **SUM over successful runs** |

### PR-list aggregation (revised 2026-09-23)

Originally the column showed the *latest* completed run's cost. That answers
"what did the last review cost", but the column sits in a list whose whole job
is comparing PRs — and a PR reviewed three times has cost three times as much.
It now shows the **total**: `sumRunCosts()` over every `status='done'` run for
that PR (`server/src/modules/pulls/status.ts`, used at
`server/src/modules/pulls/routes.ts:169`).

Why only `status='done'`: a failed run has no trustworthy usage figure to add,
and surfacing a partial spend for a review that produced nothing is more
confusing than omitting it. This is a deliberate accepted gap — a PR whose only
run failed shows `—` even though tokens were burned.

`sumRunCosts` resolves the null cases explicitly:

| Input | Result | Column shows |
|---|---|---|
| no successful runs | `null` | `—` |
| runs exist, every cost null | `null` | `—` |
| some priced, some null | sum of the priced ones | `$0.0042` |
| one run, genuinely 0 | `0` | `$0.00` |

It's a pure function in `status.ts` (not inline in the route) specifically so
those four cases are unit-testable without a database —
`server/test/pulls-status.test.ts`.

### Why JS grouping and not `SUM()` in SQL

The route already reads these rows for other derivations and the PR list is
small (tens of rows), so a second IN-query + a JS tally matches the shape of
the score and severity rollups either side of it. The whole block is
deliberately read-time derivation with no FK denormalization: nothing to keep
in sync, at the cost of a query per list render.

## No LLM calls on read

Every route above is DB-only. The only `completeStructured` call in the review
path is `reviewer-core/src/review/run.ts:174`, reachable solely from
`run-executor.ts:192` during an actual run. Opening a PR, sorting the list or
opening the trace drawer never contacts a provider.

## Out of scope

- Budgets, quotas or alerts on spend.
- Cost for anything other than review runs (the `ci_runs` and `eval_runs`
  tables have their own `cost_usd` columns, unused by this feature).
- Attributing cost to a user or an API key.
- Reconciling estimates against a provider invoice.
