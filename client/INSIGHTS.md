# Insights — client

Non-obvious, file-grounded findings that reading the code does not reveal.
Written and maintained through the `engineering-insights` skill, which carries the format,
the section rules and the quality bar.

## What Works

## What Doesn't Work

**2026-09-21** — Do not key UI state in a findings panel on the identity of its `findings` prop.
`useFindingAction` invalidates `["reviews", prId]` on success, the refetch hands down a fresh array,
and any `useEffect` with `findings` in its deps fires on every accept/reject — a severity filter
reset itself the moment the reader acted on a card, which reads as the list jumping on its own.
Reviews are per-run and each run mounts its own panel, so remount already gives fresh state; key
such effects on `prId` alone. Evidence: client/src/lib/hooks/reviews.ts:158

## Codebase Patterns

**2026-09-19** — One run's token count is rendered two different ways on screens a click apart: the
Agent-runs timeline sums them (`9,119 tok`, `RunCostBadge.tsx:31`) while the trace drawer keeps them
separate and rounded (`12k→1.5k`, `RunTraceDrawer/helpers.ts:27`). Neither is wrong on its own, but
the same run reads as two different numbers, and the drawer's form cannot be compared to the
timeline's at all. Reuse one of the two when adding a third surface rather than inventing a format
that matches neither. Evidence: client/src/components/run-cost-badge/RunCostBadge.tsx:31


## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
