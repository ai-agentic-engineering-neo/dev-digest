# M1 — Run cost badge (client)

Data side: [`server/specs/M1-cost-badge.md`](../../server/specs/M1-cost-badge.md).

## Goal
Show the LLM spend (and tokens) of agent review runs wherever runs appear, so
users see what a review cost. Unknown cost renders **"—"**, never "$0.00".

## Scope / Non-goals
| # | Where | Component | Shows |
|---|---|---|---|
| A | PR list, **COST** column (Status → Cost → Updated) | `pulls/_components/PRRow` | latest done run: `$0.014` |
| B | PR detail → Agent runs → Timeline, under the run time | `RunHistory` | `9 119 tok · $0.0013` (done runs only) |
| C | Run trace drawer → Stats, 4th tile | `RunTraceDrawer/.../TraceBody` | `COST $0.06` |
| D | Review runs → verdict banner | `VerdictBanner` (run from `usePrRuns` by `review.run_id`) | `$0.014 · 8.2K→1.3K` |

Shared pieces:
- `src/lib/format-cost.ts`:
  - `formatCostUsd`: 2 significant digits below $1, cents at or above $1, `0` → `$0.00`,
    `null` → `—`.
  - `formatTokenCount`: thin-space thousands grouping.
  - `formatTokensArrow`: `8.2K→1.3K`.
- `src/components/run-cost-badge/RunCostBadge` has two variants: `compact` (A) and `full` (D).

**Non-goals:** cost on the Agent Performance / Multi-Agent pages; per-chunk breakdown; currency settings.

## API / contract changes
Reads only. It uses `PrMeta.cost_usd`, `RunSummary.cost_usd` and `RunStats.cost_usd`; see the
server spec. There are no new hooks: the existing `usePulls`, `usePrRuns` and `useRunTrace`
are enough.

## Acceptance criteria
1. A–D show the cost for new runs.
2. Legacy, failed and running runs show "—", or no cost line in the timeline for failed or
   running runs.
3. All strings come from `messages/en` (`list.columns.cost`, `timeline.tokCost`,
   `verdict.runCost`, `runs.trace.stat.cost`).
4. Tests:
   - `format-cost.test.ts`
   - `RunCostBadge.test.tsx`
   - `PRRow.test.tsx`
   - `RunHistory.test.tsx`
   - `RunTraceDrawer.test.tsx`
   - `VerdictBanner.test.tsx`
