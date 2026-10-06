# Spec — Run Cost Badge (client side)

Status: implemented · Lab L01, task 3 · Data/API: [server/specs/run-cost-badge.md](../../server/specs/run-cost-badge.md)

## Where it shows (3 screens)
1. **Pull Requests list** — new `COST` column between STATUS and UPDATED: `$0.014`
   (`RunCostBadge variant="compact"`, value = `PrMeta.cost_usd`).
2. **PR Detail → Agent runs timeline** — a second line under the run time: `9,119 tok · $0.0013`
   (`RunCostBadge variant="detailed"`, from `RunSummary`). Hidden while the run is `running`;
   failed/cancelled runs show their partial usage; nothing at all when there is no usage.
3. **Run trace drawer → Stats** — `COST` tile between TOKENS and FINDINGS (`formatUsd(stats.cost_usd)`).

## Formatting — `src/lib/format-cost.ts` (single source)
| Value | Shown |
|---|---|
| `null` / `undefined` | `—` (never `$0.00`) |
| `0` (free model) | `$0` |
| `0 < x < 0.0001` | `<$0.0001` |
| `x < 1` | 3 significant digits: `$0.00131`, `$0.014`, `$0.041` |
| `x ≥ 1` | `$1.23` |
| tokens | `9,119` (en-US grouping) |

The `detailed` badge's tooltip shows the exact split: `in 8,200 → out 919 tokens · $0.00131`.

## Components
- `src/components/run-cost-badge/RunCostBadge.tsx` — shared (used on the list and the detail page).
  - `compact`: `{ usd }`
  - `detailed`: `{ usd, tokensIn, tokensOut }`
- The trace drawer reuses its existing `Stat` tile; only the string comes from `formatUsd`.
- i18n: badge strings live in `common.cost.*` (shared component); column/stat labels in
  `prReview.list.columns.cost` and `runs.trace.stat.cost`.

## Acceptance criteria
- Every finished run shows a badge; a run without data shows `—`.
- ≥3 significant digits (`$0.012`, not `$0.01`).
- Stale / unfinished runs never show a fake price.

## Out of scope
Overview verdict card cost line; "Review runs" accordion header cost.
