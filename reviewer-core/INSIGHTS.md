# Insights — reviewer-core

Accumulated lessons, non-trivial decisions, traps we've already run into.

Append-only: add to the bottom of the matching section, never rewrite or
delete. A finding that supersedes an older one gets its own dated entry; the
old entry stays. Format — `- YYYY-MM-DD — what is true. What to do or avoid
next time. (path/file.ts:42)`. Written by the `engineering-insights` skill, or
by hand in the same format.

## What Works

## What Doesn't Work

<!--
- 2026-09-18 — example entry: state what turned out to be true, then what to do
  or avoid next time, and point at the evidence. (`path/to/file.ts:42`)
-->

## Codebase Patterns

- 2026-09-23 — cost aggregation across chunks is deliberately **null-poisoning**:
  `costUsd` starts at `0` but becomes `null` permanently as soon as ONE chunk
  returns a null cost, so a multi-chunk run with a single unpriced call reports
  "unknown", not a partial sum. This looks like a bug when you first read it
  (why throw away the costs we do know?) — a partial sum presented as the total
  silently understates spend, which is worse than admitting ignorance. Never
  "fix" this by summing the non-null chunks; the same `null ≠ 0` rule runs
  through `estimateCost` (null for an unpriced model) and the UI (`—`, never
  `$0.00`). Note the PR-LIST total is a different calculation with a different
  rule — `sumRunCosts` sums the priced runs and ignores unpriced ones, because
  there the unit being summed is a whole run, not a fragment of one.
  (`reviewer-core/src/review/run.ts:184`)
- 2026-09-23 — provider-reported cost wins over the local estimate when
  present: OpenRouter returns `usage.cost` and it is used directly, falling
  back to `estimateCost` only when absent. So a discrepancy between the studio's
  cost and a price-table calculation is expected, not a bug — the provider
  figure reflects real billing (cache hits, discounts). Check which source a
  number came from before debugging it.
  (`reviewer-core/src/llm/openrouter.ts:97`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
