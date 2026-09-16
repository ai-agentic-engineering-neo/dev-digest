# INSIGHTS — client

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line — never silently edit or delete history.

Before writing here, check [CLAUDE.md](CLAUDE.md) — a finding that should
*always* apply belongs there as a standing rule. This file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it here.

## What Works

## What Doesn't Work

## Codebase Patterns

**2026-09-16** — There is no shared `client/src/lib/format.ts`; small display-formatting helpers (`formatSeconds`/`formatTokens`, now `formatCost`) are deliberately colocated per component tree (`pulls/helpers.ts`, `pulls/[number]/_components/RunTraceDrawer/helpers.ts`, and inline in `ReviewRunAccordion.tsx` next to `formatWhen`) rather than centralized — when a value needs formatting in more than one place, add a small local copy per tree instead of introducing a shared utils module. Evidence: `client/src/app/repos/[repoId]/pulls/helpers.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts`.

**2026-09-16** — `pulls/page.tsx`'s header row renders generically from `COLUMN_KEYS` (`constants.ts`), so adding a new PR-list column only needs `constants.ts` (new key + wider `GRID`) + the row component (`PRRow.tsx`) + an i18n key under `list.columns` — no separate header-component edit. Evidence: `client/src/app/repos/[repoId]/pulls/page.tsx:100-101`, `client/src/app/repos/[repoId]/pulls/constants.ts:42-49`.

**2026-09-16** — The findings-severity counter has two different sources of truth by design, not an oversight: the PR list reads the server-computed `PrMeta.findings_summary` directly (no client grouping), while the Timeline counter groups `ReviewRecord.findings` (already loaded by `usePrReviews`) client-side via `FindingsSummary/helpers.ts`'s `summarizeFindings()`, joined to a run by `run_id` in `RunHistory.tsx`'s `summaryByRunId` memo. Both paths independently exclude `dismissed_at` findings and are pinned by an invariant test (`counts[sev] === items.filter(...).length` for every severity) — confirmed no `fetch`/`useQuery`/`await` exists anywhere in `FindingsSummary/` or `RunHistory.tsx`, so opening the hover popover never issues a request. Evidence: `client/src/app/repos/[repoId]/pulls/_components/FindingsSummary/helpers.ts`, `client/src/app/repos/[repoId]/pulls/_components/FindingsSummary/helpers.test.ts:50-58` (invariant), `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx` (`summaryByRunId`).

**2026-09-16** — "PR list shows 0 findings but I can see one on the Agent-runs page" is very likely NOT a counting bug — `findings_summary` follows `score`'s "latest review only" rule (see `server/INSIGHTS.md`), so once any newer `kind='review'` row exists for the PR (even one that legitimately found nothing, e.g. because an unindexed/uncloned repo made the diff empty), every older review's findings stop counting anywhere in the list/Timeline. The finding the user sees is almost always sitting on an *older*, non-latest review further down the "Review runs" accordion (`GET /pulls/:id/reviews`, sorted newest-first) — check that list before assuming the grouping logic is wrong. Evidence: `server/src/modules/pulls/routes.ts:115-151`.

## Gotchas & Recurring Errors

**2026-09-16** — `ReturnType<typeof genericFn>` on a function whose type param is only inferred from a call-site argument (e.g. `summarizeFindings<F extends {...}>(findings: F[])`) resolves `F` to its constraint, not to any real call's inferred type — so a `Map<string, ReturnType<typeof summarizeFindings>>` silently narrows `items` to the constraint's stripped-down shape and fails to assign a real payload. Fix: give the function a concrete (non-generic) parameter/return type and name it (e.g. `FindingsSummaryView`), then use that name instead of `ReturnType<typeof fn>`. Evidence: `client/src/app/repos/[repoId]/pulls/_components/FindingsSummary/helpers.ts`.

**2026-09-16** — Two "count findings by severity" helpers coexist with OPPOSITE dismissed-handling, on purpose — don't port one's logic into the other. `FindingsSummary/helpers.ts`'s `summarizeFindings()` (PR-list/Timeline hover counters) EXCLUDES `dismissed_at` findings, because the hover popover never renders a dismissed finding at all. `FindingsPanel/helpers.ts`'s `countBySeverity()` (the Review-runs filter pills) INCLUDES them, because a dismissed finding still renders as a muted `FindingCard` right below the pills, so the pill total must match the on-screen card count. Evidence: `client/src/app/repos/[repoId]/pulls/_components/FindingsSummary/helpers.ts` vs `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts`.

**2026-09-16** — Correction to the entry above: matching the on-screen card count also requires the SAME `hideLow` filtering, not just the same dismissed-handling — `FindingsPanel`'s severity pills previously counted the raw (unfiltered) `findings` array while the cards below were filtered by `visibleFindings(findings, hideLow, ...)`, so toggling "Hide low confidence" on made a pill's number stop matching its visible card count. Fixed by extracting `hideLowConfidence()` and running both `countBySeverity()` and `visibleFindings()` through it, independent of `severityFilter` (so the pills themselves still don't disappear once one is clicked). Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts` (`hideLowConfidence`), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:38-39`.

**2026-09-16** — The two findings-popover title i18n keys are assigned by SCREEN, not by "does this row represent one run" — `findings.popoverTitleRun` ("{count} FINDINGS IN THIS RUN") is used on the PR-LIST row's popover (`PRRow.tsx:64`), and the plain `findings.popoverTitle` ("{count} FINDINGS") is used on the PR-detail Timeline's per-run popover (`RunHistory.tsx:228`) — the opposite of what the component names might suggest at a glance. This mapping is pinned by course-homework acceptance criteria (exact copy expected on the PR-list page), not derived from either screen's semantics — don't "fix" it by matching wording to which one is literally about a single run. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:64`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:228`, `client/messages/en/prReview.json` (`findings.popoverTitle`/`findings.popoverTitleRun`).

## Open Questions

## Session Notes
