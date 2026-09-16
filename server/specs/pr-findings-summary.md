# spec — PR list findings summary

What `GET /repos/:id/pulls` must guarantee for the `findings_summary` field
(the per-severity counters shown in the PR list's Findings column and reused
by the client for the Agent-runs timeline popover). See
[`review-flow.md`](review-flow.md) for what producing a review guarantees;
this spec only covers reading the severity breakdown back out.

## Preconditions

- Same as the list endpoint itself: the repo has been imported. The PR may or
  may not have a review yet.

## Guarantees

- **No LLM call.** `findings_summary` is a plain COUNT/filter over findings
  already persisted by a prior review run — never a new model invocation, on
  list load or on any repeat fetch.
- **Sums every agent from the latest ROUND, not just one review.** A
  "review all" click creates one `agent_runs` row per enabled agent, all
  within milliseconds of each other (`ranAt`, set at creation) even though
  each agent's `reviews` row is written later, whenever ITS LLM call finishes
  — so completion times ("created_at") can differ by seconds. Picking "the
  single review with the newest `created_at`" (like `score` does) can silently
  drop another agent's findings from the exact same click. Instead,
  `findings_summary` groups the PR's `agent_runs` by `ranAt` proximity
  (`latestRoundRunIds()`, a 10s window — `ROUND_WINDOW_MS`) and sums the
  findings from every `kind='review'` review whose `run_id` falls in that
  latest round. **`score` is a separate, pre-existing field and still reflects
  only the single latest review** — the two can diverge (e.g. `score: 100`
  from the last-finishing agent while `findings_summary` still shows another
  agent's WARNING from the same round). A PR with no `agent_runs` at all (e.g.
  a hand-seeded review, never actually run through the app) falls back to the
  single latest review, matching `score`'s original behavior.
- **Dismissed findings are excluded.** A finding with `dismissed_at` set
  counts toward neither `counts` nor `items`.
- **`null` means "no review yet".** A PR with no `kind='review'` review gets
  `findings_summary: null`, never a summary with all-zero counts — the two
  states (no review vs. reviewed-with-zero-findings) are distinguishable.
- **Invariant:** for every severity, `counts[severity]` equals the number of
  `items` with that `severity`. `items` is never truncated server-side (the
  client scrolls a capped-height popover instead).
- **Preview payload is read-only.** `items[]` carries only display fields
  (`id, severity, category, title, file, start_line, end_line, confidence,
  rationale`) — no accept/dismiss affordance, and `rationale` is truncated to
  a short preview (the full text lives on the PR detail page's finding
  cards).

## Out of scope (starter)

- A severity breakdown across a PR's full review history (only the latest
  round is summarized).
- Aligning `score` to the same "latest round" rule — it remains "latest
  single review", a pre-existing behavior this feature did not change.
- Server-side pagination of `items` — the starter's finding counts per PR are
  small enough that returning them all is cheap.

## Touchpoints

- Route: `modules/pulls/routes.ts` (`GET /repos/:id/pulls`)
- Grouping: `modules/reviews/helpers.ts` (`summarizeFindings`,
  `latestRoundRunIds`, `ROUND_WINDOW_MS`)
- Contracts: `vendor/shared/contracts/findings.ts` (`SeverityCounts`,
  `FindingPreview`, `FindingsSummary`), `vendor/shared/contracts/platform.ts`
  (`PrMeta.findings_summary`)
