# Client insights

Non-obvious findings from working on `@devdigest/web`. Appended by the `engineering-insights` skill. Read on task start; append on task end. See [`.claude/skills/engineering-insights/rubrics.md`](../.claude/skills/engineering-insights/rubrics.md) for what goes in each section.

## What Works

## What Doesn't Work

## Codebase Patterns

### PR-list grid: GRID string + COLUMN_KEYS array must update in lockstep
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/constants.ts:28`

Adding or removing a column in the PR list requires editing two things in the same order: the `GRID` CSS template (`1fr 132px 92px 60px …`) and the `COLUMN_KEYS` array that feeds the header row's i18n lookup. They are not derived from a single source; a mismatch silently misaligns headers and cells. Also add a matching `list.columns.<key>` entry to every `messages/<locale>/prReview.json`.

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

## Open Questions
