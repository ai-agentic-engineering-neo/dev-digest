# spec — findings severity counters (PR list + Timeline + Review runs)

Two different controls show a per-severity findings count, each with its own
contract:

1. **PR list "Findings" column** and **PR detail Timeline** — a hover-only,
   read-only `FindingsCounter`/`FindingsPopover`
   (`app/repos/[repoId]/pulls/_components/FindingsSummary/`). See "Hover
   counters" below.
2. **PR detail → Agent runs → Review runs → expanded run card** — a
   clickable `SeverityFilterPills` row, under the `VerdictBanner`/PR SCORE,
   that filters the `FindingCard` list in the same card
   (`[number]/_components/FindingsPanel/SeverityFilterPills.tsx`). See
   "Filter pills" below.

See [`pages.md`](pages.md) for where each is shown, and
[`../../server/specs/pr-findings-summary.md`](../../server/specs/pr-findings-summary.md)
for the PR list's server-side counting contract.

## Hover counters (PR list + Timeline)

- **No LLM call, no extra request.** The counter is a plain COUNT/filter over
  findings the page already loaded (`PrMeta.findings_summary` for the list;
  `ReviewRecord.findings`, joined by `run_id`, for the Timeline). Opening the
  popover never triggers a network request.
- **Only non-zero severities render a badge.** A severity with a count of 0
  shows no badge at all — CRITICAL/WARNING/SUGGESTION are independent, not a
  fixed three-slot row.
- **All-zero renders a muted `0`, not `—`.** `—` means "no review yet"; `0`
  means "reviewed, nothing found" — the two states must stay visually and
  textually distinct.
- **Dismissed findings never count.** Neither the badge numbers nor the
  popover list include a finding with `dismissed_at` set.
- **The popover is read-only.** Every preview line shows only text (severity
  icon, title, category, `file:line`, confidence, a short description) — no
  accept/dismiss button, no link, no other affordance. `within(popover)`
  must find zero buttons. There is no click-to-filter here — that
  interaction lives only in the Review-runs pills below.
- **The popover shows every counted finding**, sorted CRITICAL → WARNING →
  SUGGESTION (then by confidence, descending). It is never server- or
  client-truncated; a capped height + internal scroll handles long lists.
- **Hover, not click, drives the popover.** It opens on `mouseenter`/`focus`
  of the counter and closes on `mouseleave`/`blur` (with a short delay so the
  cursor can travel into the popover to scroll it) or on `Escape`. Clicking
  the counter must never navigate — it sits inside a clickable PR row /
  Timeline entry and stops event propagation.
- **The title text differs by surface, deliberately.** The PR list's popover
  reads exactly `"{N} FINDINGS"` — it summarizes the PR's latest review, not
  one run. Every other surface (the Timeline) reads `"{N} FINDINGS IN THIS
  RUN"`, because it's scoped to one specific agent run. `N` is the sum of the
  three counts shown on the trigger.

## Filter pills (Review runs)

- **Location: inside the expanded run card, above the finding list** — the
  first thing in `FindingsPanel`'s toolbar, to the left of the existing
  "Hide low confidence" toggle (separated by a divider once at least one pill
  renders). Visually this sits directly under `VerdictBanner` (verdict + PR
  SCORE), matching the acceptance criterion.
- **No LLM call.** Counts come from `countBySeverity()`, a plain COUNT/filter
  over the run's own `findings` array.
- **Counts include dismissed findings.** Unlike the hover counters, a
  dismissed finding still renders as a (muted) `FindingCard` below, so the
  pill total must match what's actually shown — excluding it would break the
  "pill count == cards shown" invariant.
- **Only non-zero severities render a pill.**
- **Click toggles a single-severity filter.** Clicking a pill narrows the
  list below to that severity only; clicking the same (already-active) pill
  again clears the filter and restores the full list. Pills stay visible
  and keep their totals while a filter is active — they don't disappear.
- **The severity filter composes with "Hide low confidence"**, not replaces
  it — both narrow `visibleFindings()` independently, so it's possible (with
  low-confidence findings of the active severity) for the on-screen card
  count to be lower than the pill's total while that toggle is also on.

## Out of scope (starter)

- A click-to-filter or drill-down from the PR-list/Timeline hover popover —
  it is a glance-only preview; filtering only exists in the Review-runs
  pills.
- Keyboard navigation between popover rows (arrow keys) — the popover is a
  glance, not an interactive panel.
- Multi-severity selection on the filter pills — only one severity (or none)
  can be active at a time.

## Touchpoints

- Hover counters: `_components/FindingsSummary/` (`FindingsCounter`,
  `FindingsPopover`, `FindingPreviewRow`, `helpers.ts`)
- PR list: `_components/PRRow/PRRow.tsx` (reads `PrMeta.findings_summary`
  directly)
- Timeline: `[number]/_components/RunHistory/RunHistory.tsx` (builds the
  per-run summary from the `reviews` prop via `summarizeFindings`)
- Filter pills: `[number]/_components/FindingsPanel/` (`SeverityFilterPills.tsx`,
  `countBySeverity`/`visibleFindings` in `helpers.ts`), rendered from
  `FindingsPanel.tsx`
