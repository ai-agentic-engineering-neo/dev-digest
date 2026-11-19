# M1 — Run cost badge (client)

Data/API half: [server/specs/M1-run-cost-badge.md](../../server/specs/M1-run-cost-badge.md).

## Goal
Show what each review run cost (USD) and how many tokens it used, wherever runs appear.

## Scope
**In**: four places, all fed by `cost_usd` and `tokens_in`/`tokens_out` from existing queries.
No new endpoints and no new hooks.

| # | Screen | Where | Shows |
|---|---|---|---|
| 1 | PR list `/repos/:repoId/pulls` | new **COST** column between STATUS and UPDATED | `$0.012` (latest finished run) |
| 2 | PR detail → Agent runs timeline | run row, right column under the time | `9 119 tok · $0.0013` |
| 3 | Run trace drawer → Stats | 4th tile after DURATION / TOKENS / FINDINGS | **COST** `$0.06` |
| 4 | PR detail → VerdictBanner | title row, next to the findings/agent badges | `$0.014 · 8.2K→1.3K` |

**Out**: total spend per PR, cost on the Agents and Eval pages, budgets, and a toggle between
estimated and actual cost.

## Component: `RunCostBadge`
`src/components/run-cost-badge/` with props
`{ costUsd: number | null | undefined; tokensIn?; tokensOut?; variant: 'compact' | 'full' }`.
- `compact`: cost only (`$0.012`). Used for the PR list and the timeline.
- `full`: cost and tokens (`$0.014 · 8.2K→1.3K`). Used for the VerdictBanner.
- Mono font, muted colour. The `title` holds the exact USD value.

Formatters live in `src/lib/format-cost.ts`:
- `formatUsd(n)`: `null`/`undefined` → `—`; `0` → `$0.00`; `< 0.01` → 4 decimals; `< 1` → 3 decimals; otherwise 2 decimals.
- `formatTokensK(in, out)`: `8.2K→1.3K`.
- `formatTokenTotal(n)`: `9 119` (thousands grouped with a space).

## Rules
- No data → `—`, never `$0.00`. This covers running, failed and cancelled runs, runs from before
  M1, and models with an unknown price.
- The timeline shows the `tok · $` line only for finished (`done`) runs.
- The VerdictBanner finds its run by `review.run_id` in the already-loaded `pr-runs` list.
- All labels come from next-intl (`prReview.list.columns.cost`, `runs.trace.stat.cost`).

## Acceptance criteria
- Every finished run shows cost in all four places. Runs without data show `—`.
- The PR list COST column lines up with the header (shared `GRID`).
- Unit tests cover the formatter edge cases (null, 0, <0.01, <1, ≥1) and each wired component.
