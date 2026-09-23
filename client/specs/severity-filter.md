# Severity counters + filter

Status: implemented (2026-09-21).

## Goal

Surface the CRITICAL/WARNING/SUGGESTION breakdown of a review's findings as a
glanceable signal, in two places:

1. **PR list** (`/repos/:repoId/pulls`) — per-row severity pills in a new
   FINDINGS column, plus a hover/focus popover with a read-only preview of
   the findings ("N FINDINGS IN THIS RUN").
2. **PR detail → Agent runs tab** (`/repos/:repoId/pulls/:number?tab=findings`)
   — inside each `ReviewRunAccordion`, and a compact version + the same
   hover popover on each Timeline run tile (unlimited findings there, since
   the data's already client-side — see "Popover" below).

## Two separate controls — not one

The severity breakdown appears as **pills** (display only) in three places
(PR list row, Timeline tile, review-run header) and as **filter buttons**
(interactive) in exactly one place: inside an opened `ReviewRunAccordion`,
below the pills. Collapsing "show the counts" and "filter by them" into one
clickable pill would make the PR-list icon and the Timeline tile — which
have no findings list to filter — behave inconsistently with the one place
that does. So:

- `SeverityPills` — never clickable itself (severity icon + count, uses `SEV`
  tokens for color/icon, i18n label). Renders only severities with count > 0.
- `SeverityFilterButtons` — three real `<button>`s, always rendered
  (Critical/Warning/Suggestion, even at 0), `aria-pressed` on the active one.
  Clicking the active button clears the filter.

## Count semantics (why this exact number)

The pill for a review run counts the **same array the panel is about to
render**, i.e. `visibleFindings(findings, hideLow)` — after the "hide low
confidence" toggle, before the severity filter. This keeps the invariant
"pill number == cards shown below" true even when `hideLow` is on. Dismissed
findings are not filtered out (they render, just muted), so they count too.

The PR-list pill and popover are a different context (one review, no local
toggles) and count **all** of the latest review's findings, unfiltered.

## Filter state

Single severity, single-select, lives in `?severity=` on the PR-detail URL
(alongside the existing `?tab` / `?trace`). One value for the whole page: a
deep link from the list (`?tab=findings&severity=CRITICAL`) filters every
expanded review-run accordion consistently, not just one. Clicking the same
filter button again clears it (`setParam("severity", null)`).

`FindingsPanel` resets its keyboard-nav focus index to 0 whenever the filter
changes, so `j`/`k` doesn't point at a now-hidden card.

## No LLM calls

Counts are `Array.prototype.filter`/reduce over findings already in memory
(fetched once via `usePrReviews` / `usePulls`). Toggling the filter or
hovering the popover never triggers a network request.

## Popover (`FindingsPopover`, shared by the PR list and the Timeline)

Read-only in the sense of "no actions": severity icon, title, category,
`file:start-end`, confidence %, truncated rationale — no buttons, no
`onClick` on any row. Accept/Dismiss only exist on the PR-detail
`FindingCard`, a different component. On the PR list, `findings` is the
server's `findings_preview` — ALL of the latest review's findings, not
capped (a review's finding count is small and text-only, so sending it all
is cheap; a truncated list would defeat the point of a scrollable popover).
On a Timeline tile it's that run's full findings array straight from
already-fetched client state. Neither is capped, so `total` always equals
`findings.length` — the field is kept separate (rather than deriving the
title from `findings.length` inline) so a future cap on one side doesn't
require touching the other caller.

Opens on hover **and** focus (keyboard users tab to the trigger). Rendered
through a **React Portal into `document.body`**, positioned `fixed` via a
`getBoundingClientRect()` snapshot of the trigger (`anchorRect` prop) — not
CSS `position: absolute` relative to a DOM ancestor, which gets silently
clipped by any `overflow: hidden` ancestor between the trigger and the page
root (the PR-list table card has one, to clip its own rounded corners).

The popover genuinely accepts mouse input (no `pointer-events: none`) so its
`overflow-y: auto` content can be wheel-scrolled when the list is longer
than the fixed max-height — this matters most on the Timeline, where the
list isn't capped. Because it's a portal, moving the cursor from the
trigger onto the popover is a real `mouseleave` on the trigger at the DOM
level (they aren't nested), so closing on that instant would make the
popover impossible to reach. `useFindingsPopoverAnchor()` debounces the
close (~150ms) and the popover's own `onMouseEnter`/`onMouseLeave`
(`popoverHandlers`) cancel/reschedule it, so the trigger and the popover
behave as one hoverable region. It still closes immediately (no debounce)
on page scroll, since it has no way to reposition mid-scroll anyway.

## Out of scope

- Multi-select severity filter (only single-select, per the design).
- Persisting the filter choice across PRs/sessions (URL-only, resets on
  navigation to a different PR).
- Changing what counts as "dismissed" or the Accept/Dismiss action itself.
