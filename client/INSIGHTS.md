# Insights — client

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

### 2026-09-14 — one shared cost formatter across all 3 cost surfaces
`client/src/components/run-cost-badge/RunCostBadge.tsx` (`formatRunCost`/`formatTokens`, three `variant`s: `compact`/`detail`/`timeline`) is the single place cost gets formatted — used in the PR list (`PRRow.tsx`), the PR-detail timeline (`RunHistory.tsx`) and verdict banner (`VerdictBanner.tsx`), AND reused (not reimplemented) for the 4th Stat tile in `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`. A prior, since-reverted implementation (commit `d45ab0d2`'s parent) had `TraceBody` using its own flat `formatCost` (`usd.toFixed(2)`, "n/a" for null) instead — that reads as "$0.00" for any sub-cent run and diverges from the badge's significant-digit formatting used everywhere else. Reuse `formatRunCost` for any new cost display rather than writing a local formatter.

### 2026-09-14 — check git history before implementing a "missing" feature
Same finding as `server/INSIGHTS.md`'s entry of the same title — this repo had "Cost" (PR list column, timeline badge, verdict-banner line, sidebar stat) fully built and reverted twice (`93119a5e`, `d45ab0d2`, wiped by `c6af1e4`). `git show <sha> -- client/src/...` recovers working component APIs, i18n keys (`client/messages/en/{prReview,runs}.json`), and test cases (`RunCostBadge.test.tsx`, `RunHistory.test.tsx`, `VerdictBanner.test.tsx`) instead of designing from scratch.

### 2026-09-14 — `SeverityBadge` already renders icon + label + count
`client/src/vendor/ui/primitives/Badge.tsx:52-88` — `SeverityBadge` takes an optional `count` prop; non-compact it renders icon + uppercase label + count. Wrap it in a plain `<button>` to build a clickable severity counter/filter bar instead of hand-rolling badge markup — done for the findings-by-severity filter in `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`.

## Mistake

## Decision

## Context

## Open Questions
