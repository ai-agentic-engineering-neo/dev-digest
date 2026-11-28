# M1 — Severity filter on findings (client)

Status: built

## Problem

An expanded review run lists its findings sorted by severity, but a reviewer
cannot see how many findings each level has, or narrow the list to one level.
On a run with many findings the critical ones have to be found by scrolling.

## Goals

- An expanded run shows one counter per severity above its findings:
  `3 CRITICAL · 5 WARNING · 2 SUGGESTION`.
- Clicking a counter leaves only that level in the run's list. Clicking it
  again brings the full list back.
- Counting and filtering use the findings that are already loaded.

## Non-goals

- Severity icons or a findings popover on the PR list, the Timeline or the Trace.
- Keeping the filter in the URL, or sharing it between runs.
- Any server, contract or seed change.

## Behaviour

- The counters sit on the left of the `FindingsPanel` toolbar, in the order
  CRITICAL, WARNING, SUGGESTION. `Hide low confidence` stays on the right.
- All three counters are always shown. A level with no findings shows `0`, is
  dimmed and cannot be clicked.
- A counter is the number of cards a click on it will show: it counts the run's
  findings after `Hide low confidence` is applied and before the severity
  filter. Accepted and dismissed findings stay in the list, so they are counted.
- One level can be active at a time. Clicking another level moves the filter
  to it; clicking the active level clears it.
- The active counter is filled with its severity colour and the other two are
  dimmed. This does not depend on hover, so the filter state is readable from a
  screenshot.
- With `Hide low confidence` on, the list shows findings that pass both
  conditions. When none do, the panel shows its existing empty state
  (`panel.noMatchTitle`). The active counter then shows `0` but stays clickable,
  so the filter can still be cleared.
- The filter is local to one run and resets when the run is collapsed, the same
  as `Hide low confidence`.
- Changing either filter moves the keyboard focus (`j` / `k`) back to the first
  card.
- Accepting or dismissing a finding reloads the reviews query, and the counters
  are recomputed from the new data without a page reload.

## Changes

- Routes: none.
- Components (under `src/app/repos/[repoId]/pulls/[number]/_components/`):
  - `SeverityFilter/` — new: the row of three counter buttons.
  - `FindingsPanel/FindingsPanel.tsx` — holds the active level and renders the row.
  - `FindingsPanel/helpers.ts` — `countBySeverity`, and `visibleFindings` takes
    `{ hideLow, severity }`.
  - `FindingsPanel/constants.ts` — `SEVERITY_FILTERS`.
  - No `@devdigest/ui` change. `Chip` has a fixed accent colour when active and
    `SeverityBadge` is not a button, so the counter is a local button that takes
    its colours from the `SEV` tokens.
- Hooks: none. No request is sent when a counter is clicked.
- Strings: `messages/en/prReview.json` → `panel.severity.CRITICAL`,
  `panel.severity.WARNING`, `panel.severity.SUGGESTION`,
  `panel.severityFilterLabel`.
- Contracts: `FindingRecord` and `Severity`, unchanged.

## Acceptance criteria

- [x] An expanded run shows three counters in the form `1 CRITICAL`, `3 WARNING`, `1 SUGGESTION`.
- [x] Each counter equals the number of findings of that level in the run's list.
- [x] Clicking a level leaves only that level in the list.
- [x] Clicking the active level again restores the full list.
- [x] With `Hide low confidence` on, only findings that pass both filters remain.
- [x] A level with no findings shows `0` and the row keeps its layout.
- [x] The active level is highlighted in its severity colour and the others are dimmed.
- [x] When nothing passes the filters, the existing empty state is shown.
- [x] Clicking a counter sends no request.

## Tests

- `FindingsPanel/helpers.test.ts`: counts per level including a zero; the
  severity filter; the severity filter together with `hideLow`.
- `FindingsPanel/FindingsPanel.test.tsx`: counters match the cards; a click
  filters; a second click clears; both filters together; the empty state.
- `SeverityFilter/SeverityFilter.test.tsx`: the active level is `aria-pressed`;
  a zero level is disabled; a zero level that is active stays clickable.
- e2e `04-pr-findings.flow.json`: the seeded run shows `1 CRITICAL`.

## Related specs

- None. The feature has no server part.

## Open questions

- None.
