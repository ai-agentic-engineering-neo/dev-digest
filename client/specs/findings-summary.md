# Findings summary (per-severity icons + hover popover)

Compact per-severity counters (`⓪2 ⚠1 💡3`, colors/icons from `SEV`) with a
hover popover listing the findings behind them. Component:
`src/components/findings-summary`.

## Where
- **PR list → Findings column.** Counts = `PrMeta.findings_by_severity` from
  `GET /repos/:id/pulls` (all `kind='review'` reviews of the PR). The popover's
  findings are fetched lazily on first hover (`usePrReviews`). No reviews → `—`.
- **PR page → Agent runs → Timeline.** Each settled run row shows its counts +
  " · N blockers"; popover heading "N findings in this run". Data = the already
  loaded reviews grouped by `run_id` (FindingsTab → RunHistory), no new request.

## Acceptance
- Zero levels are hidden; popover lists every counted finding (severity, title,
  category, file:line, confidence, 2-line rationale).
- Popover isn't clipped by the PR table card (fixed positioning).
