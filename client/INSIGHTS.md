# client/ — INSIGHTS

Non-obvious knowledge you can't infer from the code or git history: gotchas hit
in practice, "why it's built this way", debugging dead ends.

Contract:

- Append only — never rewrite, reword, or prune existing entries.
- One dated bullet per insight, newest on top of its section:
  `- YYYY-MM-DD — one actionable sentence. (file-or-PR ref)`
- If it belongs in the README, `docs/`, or a `specs/` file instead — put it there.

## What Works

<!-- newest on top -->

- _none yet_

## What Doesn't Work

<!-- newest on top -->

- _none yet_

## Codebase Patterns

<!-- newest on top -->

- 2026-09-16 — Fixed-decimal cost formatting rounds REAL OpenRouter costs to "$0.000" (haiku-class runs on small diffs cost $0.0001–0.0004, below 3-decimal resolution) — `formatCost` therefore keeps 2 significant digits with 2–6 decimals ($0.060 / $0.0013 / $0.000038), superseding the earlier fixed 3/4-decimal rule. (src/lib/cost.ts)
- 2026-09-16 — USD cost renders null as an em-dash, never `$0.00` — an unpriced model or a run that failed before billing is unknown, not free; formatting lives in `src/lib/cost.ts` (3 decimals under $1 for badges/stats, 4 for the per-run timeline meta). (src/lib/cost.ts)

## Tool & Library Notes

<!-- newest on top -->

- _none yet_

## Recurring Errors & Fixes

<!-- newest on top -->

- 2026-09-16 — `getByText("—")` in PRRow tests matches multiple cells (cost, null `updated_at` via `relativeTime`, null score) — give fixtures non-null `updated_at`/`score` before asserting on the em-dash, or scope the query to the cost cell. (pulls/_components/PRRow/PRRow.test.tsx)

## Session Notes

<!-- newest on top -->

- _none yet_

## Open Questions

<!-- newest on top -->

- _none yet_
