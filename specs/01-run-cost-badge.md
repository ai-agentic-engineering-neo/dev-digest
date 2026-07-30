# Run Cost Badge

**Status:** implemented — `73b3849`, `641abb2` (branch `feat/L01`).
Written after the fact to document the design; later specs precede their code.

## Context

A review run costs real money, and until now nothing in the studio showed how
much. You could not answer "what did reviewing this PR cost me?" without
opening the OpenRouter dashboard, and you could not compare agents or models
on cost at all.

The data was already there. `reviewer-core` computes cost on every run —
`OpenRouterProvider.completeStructured` requests `usage: { include: true }`,
prefers OpenRouter's own `usage.cost`, and falls back to the injected
`estimateCost` (`platform/price-book.ts` → `adapters/llm/pricing.ts`). The
value reached `ReviewOutcome.costUsd` and was then **discarded one line before
persistence** in `run-executor.ts`.

Commit `d45ab0d` had removed the *persistence* of run cost while deliberately
keeping the pricing engine; `58c6ac7` had earlier stripped the usage line from
the timeline. This feature restores both and adds the PR-list column.

## Scope

Cost and token usage for every **completed** run, on four surfaces:

| Surface | Shows | Component |
|---|---|---|
| PR list — `COST` column | `$0.014` (latest run) | `PRRow` |
| Run timeline — under the run time | `9,119 tok · $0.0013` | `RunHistory` |
| Run trace drawer — beside Duration/Tokens/Findings | `COST $0.06` | `TraceBody` |
| Verdict banner — under the summary | `$0.014 · 8.2K→1.3K` | `VerdictBanner` |

**Not in scope:** cost aggregation per repo, per agent, or over time; budgets
or alerts; historical backfill of runs that predate the `cost_usd` column
(they stay `NULL` and render `—`); any change to how cost is *calculated*.

## Approach

### Constraint: zero additional model calls

Cost is read from values already produced during the run. Nothing in this
feature calls a model, a pricing API, or OpenRouter's dashboard.

### Server

- Migration `0010` re-adds `agent_runs.cost_usd` (`double precision`, nullable).
- `run-executor.ts` stops discarding `outcome.costUsd`; it flows through
  `completeAgentRun` → `run.repo.ts`. Failed and cancelled runs persist `null`.
- `cost_usd` returns to `RunStats` / `RunSummary`; `tokens_in` / `tokens_out` /
  `cost_usd` are added to `PrMeta`. **Hand-port to both `vendor/shared`
  copies** — there is no sync script, and divergence type-checks clean.
- `GET /repos/:id/pulls` gains a `latestRunByPr` lookup, mirroring the existing
  latest-review `score` block: one `inArray` query ordered newest-first, first
  seen per PR wins. **Gated on `status === 'done'`** so a PR whose newest run
  is still running or failed shows `—` rather than a half-finished run's zeros
  or a stale older run's numbers.

### Client

Two shared formatters in `client/src/lib/format.ts`, used by all four
surfaces so the same run reads identically everywhere:

- `formatCost(usd)` — `null`/`undefined` → `—`; `0` → `$0.00`; below a dollar
  `toPrecision(3)` with trailing zeros trimmed and a two-decimal floor;
  `≥ $1` → `toFixed(2)`.
- `formatTokens(in, out)` — `8.2K→1.3K`.

`formatTokens` moved here out of `RunTraceDrawer/helpers.ts`, which was
folder-local and emitted a different shape (`12k→1.5k`).

The verdict banner gets its usage by matching `review.run_id` against the
`prRuns` the PR detail page **already fetches** for the timeline — threaded
down through `FindingsTab` → `ReviewRunAccordion`. No extra request, and no
redundant join onto `reviewsForPull`.

### Two rules that carry the design

**`null` is not `$0`.** Unknown cost — no completed run, or a model missing
from the price book — renders `—`. A genuinely free run renders `$0.00`. On
the map-reduce strategy `costUsd` collapses to `null` if *any* chunk lacks a
cost, so this distinction is load-bearing, not pedantry.

**Fixed decimals destroy these numbers.** Real runs here cost
**$0.0004–$0.02** (measured against `agent_runs`). The helper deleted in
`d45ab0d` used `toFixed(2)`, rendering nearly every run as `$0.00`; a decimal
ladder capped at four places turns `$0.00039347` into `$0.0004`, one
significant digit. Hence significant-digit formatting.

Where a run isn't settled, each surface omits the number rather than faking
one: the list gates server-side on `status = 'done'`, the banner on
`runSettled`, the timeline on `tok > 0` (failed and cancelled runs persist
`0/0`, so the total already excludes them).

## Verification

**Automated**

- `cd server && pnpm test` — contract fixtures now require `cost_usd`.
- `cd client && pnpm test` — `format.test.ts` pins the formatter against real
  values (`0.00039347` → `$0.000393`, `0.012` → `$0.012`, `1.234` → `$1.23`,
  `null` → `—`, `0` → `$0.00`); `PRRow`, `VerdictBanner`, `RunHistory` and
  `RunTraceDrawer` each assert their own surface.
- `pnpm typecheck` in both packages.

**Manual**

1. `cd server && pnpm db:migrate` — migrations do not run on boot.
2. `./scripts/dev.sh`, then run a review on any PR.
3. PR list shows a cost for that PR; a never-reviewed PR shows `—`.
4. On the PR: the timeline row shows `N,NNN tok · $X`, the verdict banner
   shows `$X · N.NK→N.NK`, and the trace drawer shows a `COST` stat.
5. A run still in flight, or one that failed, shows no price anywhere.
6. Cross-check one run's figure against the OpenRouter dashboard.

**Design parity** — these are the values the mockups show, and the formatter
reproduces each exactly: `$0.014` `$0.041` `$0.003` `$0.028` `$0.012` `$0.022`
`—` (list) · `$0.0013` `$0.0014` `$0.0012` (timeline) · `$0.06` (drawer).
