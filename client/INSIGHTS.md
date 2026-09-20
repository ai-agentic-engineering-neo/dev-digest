# INSIGHTS.md — @devdigest/web

Append-only. Read before starting work in this package. Updated by the
`engineering-insights` skill — only when a session learns something
non-obvious; never rewritten, only appended to.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- 2026-09-20: React's `onMouseEnter`/`onMouseLeave` are synthesized from native
  `mouseover`/`mouseout` (EnterLeaveEventPlugin), not from native
  `mouseenter`/`mouseleave`. `fireEvent.mouseEnter`/`mouseLeave` in RTL tests
  silently fail to trigger these handlers — use `fireEvent.mouseOver`/`mouseOut`
  instead (see `vendor/ui/kit/Popover.test.tsx`,
  `components/findings-severity-icons/FindingsSeverityIcons.test.tsx`).

## Decisions

- 2026-09-20: `vendor/ui/kit` has no hover-triggered popover/tooltip and no
  portal infrastructure (`Modal`/`Dropdown` are both portal-free, positioned
  via CSS `position: absolute` on a relatively-positioned wrapper). The new
  `Popover` primitive follows the same no-portal convention; to render inside
  an `overflow: hidden` ancestor (e.g. the PR list's `s.tableCard`) it takes a
  `strategy="fixed"` mode that reads the trigger's `getBoundingClientRect()`
  and positions with `position: fixed` instead of relying on ancestor CSS.
- 2026-09-20: The PR list's Findings column (like `score`/`cost_usd`) reflects
  only the PR's LATEST review — an older review with real findings won't show
  if a newer, cleaner review superseded it. By design (matches existing
  score/cost aggregation in `pulls/routes.ts`), but easy to mistake for a bug
  during manual QA when a PR has multiple reviews of very different quality.

## Recurring Errors & Fixes

## Session Notes

- 2026-09-20: Before implementing a UI feature, check `git status` for
  untracked component directories under the relevant route — this repo had a
  fully-written but unwired `SeverityCounters` component (untracked) sitting
  ready to be finished (it called `SeverityBadge` with `onClick`/`active`
  props the primitive didn't support yet). Building on it instead of writing
  a parallel implementation avoided duplicate work.

## Open Questions
