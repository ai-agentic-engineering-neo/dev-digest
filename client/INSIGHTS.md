# Insights — client

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

### 2026-09-16 — `client/src/lib/findings.ts` is now the single source of truth for severity grouping/ordering + file:line formatting
Previously `severityCounts`/`FILTERABLE_SEVERITIES`/`SEVERITY_ORDER` lived in `FindingsPanel/helpers.ts`+`constants.ts` and `RunHistory.tsx` imported them cross-folder (`../FindingsPanel/helpers`); `lineLabel` was duplicated identically in `FindingCard/helpers.ts`. Extracted to `client/src/lib/findings.ts`, re-exported from `FindingsPanel/constants.ts`/`helpers.ts` and `FindingCard/helpers.ts` so existing import sites didn't need touching. Needed for the new PR-list `FindingsSummary` popover (`pulls/_components/FindingsSummary`), which sits in a sibling route directory and has no natural "parent" component to import cross-folder from. Add any new finding-severity/formatting logic here, not back into a component-local `helpers.ts`, if more than one route needs it.

### 2026-09-14 — Timeline finding counts reuse `FindingsPanel`'s `severityCounts` helper, keyed by matching `run_id`
`RunSummary` (`client/src/vendor/shared/contracts/trace.ts:95-117`) only carries flat `findings_count`/`blockers` — no per-severity breakdown — so `RunHistory.tsx`'s per-run row can't compute CRITICAL/WARNING/SUGGESTION chips from that alone. Fix: `FindingsTab.tsx` already holds `runs: ReviewRecord[]` (each with a `.findings` array and a `run_id`) alongside `prRuns: RunSummary[]`; build a `run_id → FindingRecord[]` map there and pass it into `RunHistory` as `findingsByRunId`, then call the existing `severityCounts()` (`FindingsPanel/helpers.ts`) per row and render `SeverityBadge` `compact` chips (same as the FindingsPanel filter bar). No backend change needed — the data already exists client-side, just under a different prop than the one the row was reading from.

### 2026-09-14 — one shared cost formatter across all 3 cost surfaces
`client/src/components/run-cost-badge/RunCostBadge.tsx` (`formatRunCost`/`formatTokens`, three `variant`s: `compact`/`detail`/`timeline`) is the single place cost gets formatted — used in the PR list (`PRRow.tsx`), the PR-detail timeline (`RunHistory.tsx`) and verdict banner (`VerdictBanner.tsx`), AND reused (not reimplemented) for the 4th Stat tile in `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`. A prior, since-reverted implementation (commit `d45ab0d2`'s parent) had `TraceBody` using its own flat `formatCost` (`usd.toFixed(2)`, "n/a" for null) instead — that reads as "$0.00" for any sub-cent run and diverges from the badge's significant-digit formatting used everywhere else. Reuse `formatRunCost` for any new cost display rather than writing a local formatter.

### 2026-09-14 — check git history before implementing a "missing" feature
Same finding as `server/INSIGHTS.md`'s entry of the same title — this repo had "Cost" (PR list column, timeline badge, verdict-banner line, sidebar stat) fully built and reverted twice (`93119a5e`, `d45ab0d2`, wiped by `c6af1e4`). `git show <sha> -- client/src/...` recovers working component APIs, i18n keys (`client/messages/en/{prReview,runs}.json`), and test cases (`RunCostBadge.test.tsx`, `RunHistory.test.tsx`, `VerdictBanner.test.tsx`) instead of designing from scratch.

### 2026-09-14 — `SeverityBadge` already renders icon + label + count
`client/src/vendor/ui/primitives/Badge.tsx:52-88` — `SeverityBadge` takes an optional `count` prop; non-compact it renders icon + uppercase label + count. Wrap it in a plain `<button>` to build a clickable severity counter/filter bar instead of hand-rolling badge markup — done for the findings-by-severity filter in `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`.

## Mistake

### 2026-09-16 — the Review-runs severity pill row rendered all 3 severities even at zero count, unlike the parallel Timeline row
`FindingsPanel.tsx` (used inside `ReviewRunAccordion` for the "Review runs" pill row) mapped over the full `FILTERABLE_SEVERITIES` array unconditionally, so a run with only CRITICAL findings still showed empty "WARNING 0" / "SUGGESTION 0" pills. `RunHistory.tsx`'s Timeline row (`RunHistory.tsx:205`, pre-existing) already got this right — `FILTERABLE_SEVERITIES.filter((sev) => counts[sev] > 0)` — but the two were never reconciled since they lived in different files with duplicated severity-counting logic. Fixed by filtering the same way, plus keeping the active `severityFilter`'s own pill visible even at 0 (else a hide-low-confidence toggle that zeroes out the filtered severity leaves no pill to click to clear the filter). Check both severity-pill call sites together when changing this logic — both now read `FILTERABLE_SEVERITIES`/`severityCounts` from the shared `client/src/lib/findings.ts` (see the Pattern entry below), so a future fix in one place actually covers both.

### 2026-09-14 — `borderColor`/`borderWidth` are themselves shorthands; mixing either with `borderLeftColor`/`borderLeftWidth` still warns
`FindingCard/styles.ts`'s `card()` had a comment claiming it used "all-longhand" props to avoid React's dev-mode "conflicting style property" warning, but it set `borderColor` + `borderLeftColor` (and `borderWidth` + `borderLeftWidth`) together — `borderColor`/`borderWidth` are physical shorthands covering all four sides internally, so React still flags the conflict on rerender (confirmed via the console error naming `FindingCard.tsx:57`). The actual fix is per-side-only props: `borderTopColor`/`borderRightColor`/`borderBottomColor`/`borderLeftColor` (and the `*Width` equivalents) — never the bare `border{Color,Width}` property when any single-side override is also set.

## Decision

## Context

### 2026-09-14 — `client/src/vendor/shared` is a PARTIAL mirror of `server/src/vendor/shared`, not a byte-identical copy
`client/src/vendor/shared/contracts/platform.ts` is kept byte-identical to the server copy (confirmed via `diff`, and via `git log` showing both edited in the same commits, e.g. `b407ba1`, `97b6edc`). But `client/src/vendor/shared/adapters.ts` is NOT — it's missing several server-only types (`CommitFilesPayload`, `GitClient.sync`/`diffNameOnly`, the `openrouter` LLM id, etc.) because nothing in `client/src` actually imports them (confirmed via `grep -rn "GitHubClient\|RepoRef" client/src`). When adding a new shared type: check whether client code actually consumes it before assuming you must mirror the whole file — mirror only what's referenced, matching the existing (already-diverged) state, not a hypothetical full sync.

## Open Questions
