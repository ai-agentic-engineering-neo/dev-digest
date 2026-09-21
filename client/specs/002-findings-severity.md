# 002 — Findings by severity: counters, filter, read-only popover (Lesson L01, ТЗ #16–21)
Status: done (e2e flow steps pending a fresh-seed run)

## Goal
Show how many findings of each severity a review run produced and let the user narrow the
list to one severity — in three places, with zero new LLM calls (counts are a plain
group-by over already-persisted `findings.severity`).

1. PR detail → Agent runs → **Review runs** → expanded run card: under VerdictBanner / PR SCORE a row of
   pills `N Critical · N Warning · N Suggestion` (non-zero only). Click = filter, click again = clear.
2. PR detail → Agent runs → **Timeline**: each done run tile shows severity icons with counts
   (dotted underline in severity colour) before `· N blockers`. Hover → findings popover.
3. **PR list** → new FINDINGS column: icons with counts summed over the latest review of each agent.
   Hover → popover "N FINDINGS IN THIS RUN".

## Contract (shared schemas · routes · UI)
- Data:
  - `PrMeta.severity_counts: SeverityCounts | null` (`GET /repos/:id/pulls`) — latest review only.
    Server side: `server/specs/002-pr-severity-counts.md`.
  - Timeline + Review runs: `ReviewRecord.findings` from the already-loaded `usePrReviews(prId)`,
    matched to a run by `review.run_id`. No new endpoint.
  - PR list popover previews: lazy `usePrReviews(prId)` enabled only once the popover opens
    (TanStack cache → one request per PR); findings of the latest `kind === "review"` record of each agent (`latestReviewsPerAgent`).
- `src/components/finding-severity/`:
  - `helpers.ts` — `SEVERITY_KEYS`, `countBySeverity(findings)`, `totalFindings(counts)`, `SEV_COLOR`
    (moved from `FindingCard/constants.ts`; FindingCard imports it from here).
  - `SeverityCounts` — compact `icon + number` row, non-zero severities only; `—` when none.
  - `FindingsPopover` — hover/focus trigger; panel ~380px, absolute, above neighbours, scrollable;
    closes on mouseleave (short delay) and Esc; trigger `stopPropagation` on click (no row
    navigation / no trace drawer). Props: `findings`, `isLoading`, `onOpen`, `variant: "run" | "list"`.
    Header: timeline `ⓘ N FINDINGS`; list `ⓘ N FINDINGS IN THIS RUN` (count = loaded previews once fetched).
  - `FindingPreview` — **read-only**: severity icon chip, title, category icon+name, `file:line`
    (mono, accent), `● NN% conf` (`ConfidenceNum`), rationale clamped to 2 lines with "…". No buttons.
- `FindingsPanel`: state `severityFilter: Severity | null`; `visibleFindings(findings, hideLow, severity)`.
  Pill counts = `countBySeverity` of the list **after hide-low, before the severity filter**, so a
  pill's number always equals the cards of that severity rendered below. Filter change resets j/k focus.
  - New `_components/SeverityFilterPills/`: `<button aria-pressed>` per non-zero severity, active pill
    outlined in its severity colour; shown in the toolbar left of "Hide low confidence".
- `RunHistory`: prop `reviewsByRunId: Map<string, ReviewRecord>` (built in `FindingsTab`).
- PR list: `COLUMN_KEYS` += `findings` after `score`; `GRID` gets a ~120px column; `PRRow` cell =
  `FindingsPopover(variant="list")` around `SeverityCounts`; `latestReview(reviews)` in `pulls/helpers.ts`.
- i18n:
  - `prReview.list.columns.findings`
  - `prReview.panel.severityFilter.{CRITICAL,WARNING,SUGGESTION}` ("{count} Critical" …), `.clear`
  - `common.findingsPopover.{run,list,loading}` (ICU plural on count)

## Out of scope
Actions inside the popover (accept/dismiss/learn), category/confidence filters, INFO severity,
aggregates across all runs of a PR, cost/score changes, reviewer-core / LLM changes.

## Acceptance criteria
- [x] #16 Expanded run card shows `N Critical · N Warning · N Suggestion` under the verdict, only present severities.
- [x] #17 Each pill number = number of finding cards of that severity in the same card (also with Hide low confidence on).
- [x] #18 Click on a pill leaves only that severity; second click restores the full list of that run.
- [x] #19 Counts come from grouping existing findings; opening the page / toggling the filter triggers no LLM call
      and no request other than the cached `GET /pulls/:id/reviews`.
- [x] #20 PR list: hovering the FINDINGS icons of a row opens a popover titled "N FINDINGS IN THIS RUN".
- [x] #21 Popover previews (list and timeline) show only severity icon, title, category, file:line, % confidence,
      short rationale — no buttons.
- [x] Review runs card header shows severity icons (not "N findings" text) with the same hover popover; clicking them doesn't toggle the card.
- [x] Scrolling inside the popover keeps it open; a page scroll closes it.
- [x] Timeline tile shows severity icons with counts; hovering them opens the same popover; clicking them doesn't open the trace.
- [x] Tests: `SeverityCounts.test.tsx`, `FindingsPopover.test.tsx`, `SeverityFilterPills.test.tsx`,
      `FindingsPanel.test.tsx` (filter + counts), `RunHistory.test.tsx` (icons + hover), `PRRow.test.tsx` (column + hover).
- [ ] e2e flow: `e2e/specs/04-pr-findings.flow.json` (click "1 Warning" → only the N+1 card; click again → both;
      hover timeline icons → "2 findings"), `e2e/specs/02-repo-pulls-detail.flow.json` (hover #482 icons → "2 findings in this run").

## Links
- `server/specs/002-pr-severity-counts.md`
- Plan: seed PR #482 has 1 CRITICAL ("Hardcoded Stripe secret key in commit") + 1 WARNING ("N+1 query in user list endpoint").
