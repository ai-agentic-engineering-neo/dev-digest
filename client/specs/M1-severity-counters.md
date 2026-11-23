# M1 — Severity counters in a review run

## Goal
On the PR page → **Agent runs** tab, findings are grouped by run; to know how many of them are critical you have to scroll the list and count by eye.
Show the severity distribution of a run at a glance and let the user filter that run's list by one severity.

## Scope
- In the **body** of an expanded `ReviewRunAccordion`, above the finding cards (inside `FindingsPanel`), a row of counters: `3 CRITICAL · 5 WARNING · 2 SUGGESTION`.
- Clicking a level filters **this run's** list to that level; clicking the active level again clears the filter.
- The filter combines with the existing **Hide low confidence** toggle (logical AND).

### Out of scope
- New API routes, DB tables/migrations, changes to `@devdigest/shared` contracts, any LLM call.
- The `blockers` count in the `ReviewRunAccordion` header (non-dismissed CRITICAL) — stays as is.
- `FindingCard`, the Timeline icons, the PR-list Findings column/popover.
- Persisting the filter (URL / storage); it is local UI state of one run and resets when the accordion is collapsed.

## Data
- Source: `review.findings` already loaded by `usePrReviews(prId)` (`GET /pulls/:id/reviews`) and passed to `FindingsPanel` as props. No new request.
- Levels: the `Severity` contract — `CRITICAL`, `WARNING`, `SUGGESTION` (`INFO` from the UI kit's `SEV` is not shown).
- Counts are derived from `findings` (not stored in state), so after accept/dismiss (`useFindingAction` invalidates `["reviews", prId]`) they stay in sync without a reload.
- Counts are over **all** findings of the run (independent of the Hide low confidence toggle).

## UI
- `FindingsPanel/helpers.ts`: pure `countBySeverity(findings)` → `{ CRITICAL, WARNING, SUGGESTION }`; `visibleFindings(findings, hideLow, severity | null)` filters by confidence and severity, then sorts as today.
- `FindingsPanel.tsx`: `const [severity, setSeverity] = useState<Severity | null>(null)`; counters row rendered above the list.
- Colors / icons from `SEV` in `@devdigest/ui` (no new palette).
- Active level: highlighted with its `SEV` color (background or border), the other two dimmed; the highlight does not depend on hover. Only one level is active at a time.
- A level with 0 findings shows `0` and the row layout does not break.
- Empty result after filtering → the existing `EmptyState` (`panel.noMatchTitle` / `panel.noMatchBody`).
- i18n: counter labels and aria text in `client/messages/en/prReview.json` under `panel`.

## Acceptance criteria
1. An expanded run shows counters for all three severity levels in the format `N CRITICAL · N WARNING · N SUGGESTION`; a level with no findings shows `0`.
2. Each number equals the count of that level's findings in this run.
3. Clicking a level leaves only that level's findings in this run's list; the active counter is highlighted with its `SEV` color, the others are dimmed.
4. Clicking another level moves the filter and the highlight to it; clicking the active level again restores the full list and removes the highlight.
5. With Hide low confidence on, the list shows only findings that pass both conditions.
6. Clicking a counter sends no network request and starts no agent run.
7. After accept/dismiss of a finding the counters still match the list without a page reload.
8. Unit/component tests cover counting and filtering; `pnpm test` and `pnpm typecheck` in `client/` are green.

## Open questions
- Assignment screenshot caption says a zero level "is not shown", while P3 says it "shows 0". Decision: show `0` (dimmed, not clickable) — acceptance criteria take precedence over the screenshot caption.
