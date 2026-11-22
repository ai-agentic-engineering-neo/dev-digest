# Client insights

Non-obvious findings from working on `@devdigest/web`. Appended by the `engineering-insights` skill. Read on task start; append on task end. See [`.claude/skills/engineering-insights/rubrics.md`](../.claude/skills/engineering-insights/rubrics.md) for what goes in each section.

## What Works

## What Doesn't Work

### Window-level finding shortcuts fire behind modals
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:58`

FindingsPanel's j/k/a/d keyboard handler is attached to `window`, so it keeps firing while any modal is open — pressing `a`/`d` would silently accept/dismiss the focused finding behind the dialog. Any modal opened from the panel must gate the handler on its open state (early-return).

## Codebase Patterns

### PR-list grid: GRID string + COLUMN_KEYS array must update in lockstep
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/constants.ts:28`

Adding or removing a column in the PR list requires editing two things in the same order: the `GRID` CSS template (`1fr 132px 92px 60px …`) and the `COLUMN_KEYS` array that feeds the header row's i18n lookup. They are not derived from a single source; a mismatch silently misaligns headers and cells. Also add a matching `list.columns.<key>` entry to every `messages/<locale>/prReview.json`.

### Kit Modal: no Escape handling, header X is labelled "Close"
**Date:** 2026-11-22
**Evidence:** `client/src/vendor/ui/kit/Modal.tsx:58`

`Modal` from `@devdigest/ui` only closes via backdrop click or the header IconBtn — add a local `keydown` Escape listener in the consumer. The header button's accessible name is "Close", so a footer "Close" button makes `getByRole("button", { name: "Close" })` ambiguous in tests; use `getAllByRole` or scope with `within(...)`.

### PR-list popovers must portal: the table card clips overflow
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/styles.ts` (tableCard)

`tableCard` has `overflow: hidden`, so an absolutely-positioned popover inside a row is cut off. Render it with `createPortal` to `document.body`, `position: fixed` from the trigger's rect, and cap `maxHeight` to the space on the chosen side (`placePopover` in `_components/FindingsCell/helpers.ts`).

### Mutations that touch findings/reviews must also invalidate ["pulls"]
**Date:** 2026-11-22
**Evidence:** `client/src/lib/hooks/reviews.ts` (useFindingAction)

The PR list's score + FINDINGS counts are derived server-side from reviews and non-dismissed findings. Dismissing a finding or deleting a run/review must invalidate the `["pulls"]` prefix, not just `["reviews", prId]`, or the list shows stale counts until an unrelated refetch.

## Tool & Library Notes

### Number.toPrecision(n) switches to scientific notation below ~1e-6
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts`

`(1.23e-7).toPrecision(3)` returns `"1.23e-7"`, which is unfit for a user-facing badge. Guard numeric formatters by testing `/e/i` on the output and falling back to `toFixed(n).replace(/0+$/, "")` for the ultra-tiny branch. `parseFloat(toPrecision(3)).toString()` is also useful to strip trailing zeros (`"0.0120" → "0.012"`).

## Recurring Errors & Fixes

## Session Notes

### 2026-11-22 — Run Cost Badge: one util + one component reused across 3 screens
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunCostBadge/RunCostBadge.tsx`

Feature added COST to the PR list column, the RunHistory timeline row, and the TraceBody Stats section. Followed the existing colocation convention: shared primitive (`RunCostBadge` + `formatCost`) lives under `pulls/[number]/_components/`, imported by the PR-list row via a relative path. Spec rules in `formatCost`: null / undefined / exactly 0 → em-dash `—`; otherwise 3 sig figs (`$0.012`, `$1.23`); never `$0.00`.

### 2026-11-22 — Per-run severity counters + filter + modal
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`

SeverityCounters (pill = filter button + sibling ⓘ button) and SeverityFindingsModal live next to FindingsPanel, which owns the single-select `severity` + `detailsFor` state per run. Counts come from all findings (`countBySeverity`) so they stay fixed when hide-low is on; only `visibleFindings(findings, hideLow, severity)` drives the list. Shared fixtures: `FindingsPanel/fixtures.test-data.ts` (name avoids the `*.test.ts` glob).

## Open Questions
