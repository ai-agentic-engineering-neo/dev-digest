# Findings labels on PR list + agent runs

Source task: `tasks/add_findings_labels.md`. Design reference: `tasks/design.html`
(a bundled Design-canvas artifact — screens `dashboard` and `pr-runs`; JSX
extracted from its `__bundler/manifest` payload during this analysis).

## Ask, as written

> Add findings labels:
> - For agent runs in pull request
> - To Pull requests table (new column)

"Labels" = the existing severity (`CRITICAL`/`WARNING`/`SUGGESTION`) and
category (`bug`/`security`/`perf`/`style`/`test`) badges already used on
individual findings elsewhere in the app — not GitHub PR labels (no evidence
of a GitHub-labels integration anywhere in the design or codebase).

## What the design shows

- **`dashboard` screen** (`window.ScreenDashboard`): the Pull Requests table
  has a **Findings** column between Score and Status. Each cell
  (`FindingsCell`) shows one small badge per non-zero severity (icon + count,
  color-coded, `—` when empty), and hovering opens a `FindingsTooltip`
  listing every finding (severity badge, title, category tag, `file:line`,
  confidence, 2-line rationale).
- **`pr-runs` screen** (`window.ScreenPRDetail`, Agent runs tab):
  - **Timeline** rows (`TimelineRun` → `RunFindings`): same per-severity
    badge treatment as the dashboard cell, plus a `"· N blockers"` suffix,
    with the same hover tooltip.
  - **Review Runs** cards (`ReviewRunCard`): only a plain-text
    `"N findings · M blockers"` string in both the collapsed header and the
    expanded verdict block — no severity badges there. Expanding a card
    already shows full `FindingCard`s (severity badge + category tag per
    finding).

## Current implementation (verified in code, not assumed)

Severity/category are already first-class, not new concepts:

- `Severity`, `FindingCategory` — `server/src/vendor/shared/contracts/findings.ts`
  (mirrored in `client/src/vendor/shared/contracts/findings.ts`).
- `SeverityBadge`, `CategoryTag` — already in `@devdigest/ui`, already used in
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`.

Gaps against the design:

1. **PR list table** (`client/src/app/repos/[repoId]/pulls/`):
   `constants.ts` `COLUMN_KEYS` has 7 columns (pullRequest / author / size /
   score / status / cost / updated) — no Findings column, no grid slot for
   it (`GRID` would need a new track). `PRRow.tsx` renders no findings data.
   `PrMeta` (`server/src/vendor/shared/contracts/platform.ts:157`) has no
   findings field.

   **This is a reversal of an explicit prior decision**, not a green-field
   gap. `server/src/modules/pulls/routes.ts:115-118`:
   > "Latest-review SCORE per PR for the list's score ring. Computed on read
   > from reviews (no FK denorm); the list is small, so one IN-query + JS
   > grouping is cheap. (The per-severity FINDINGS breakdown is
   > intentionally not surfaced on the list — findings live on the PR
   > detail page.)"

   There's an unused `PrRowView` interface in `client/src/lib/types.ts:38`
   that already declares a `findings: { CRITICAL; WARNING; SUGGESTION }`
   shape and nothing else — dead code, referenced nowhere. Possibly a
   leftover stub from when that decision was reversed-then-reverted, or
   just aspirational scaffolding.

2. **Agent runs tab**, two different components, two different data
   sources:
   - `RunHistory.tsx` (Timeline, backed by `RunSummary` —
     `server/src/vendor/shared/contracts/trace.ts:96`) shows plain text
     `t("runStatus.findings", { count })` + `t("runStatus.blockers", …)`.
     `RunSummary` only carries `findings_count` (total) and `blockers`
     (count of findings that tripped the CI gate) — **no per-severity
     breakdown**. Matching the design's `RunFindings` badges here needs
     either a new denormalized breakdown or a read-time join, not just a
     client change.
   - `ReviewRunAccordion.tsx` (Review Runs, backed by `ReviewRecord`, which
     **does** include the full `findings[]` array already) also shows only
     plain text in its header (`{findings.length} findings · {blockers}
     blockers`). This one needs no backend change — the per-severity counts
     can be derived client-side from `review.findings`, same as
     `FindingsPanel` already must be doing internally to group findings.

No `FindingsTooltip`-equivalent component exists yet anywhere in
`client/src/vendor/ui` or the page-local `_components/` — it would be new,
and (per `CLAUDE.md`) belongs as a page-local component, not a vendor/ui
addition, unless it's meant to be reused across pages.

## Decisions (confirmed with user)

1. **Override the list's "no findings" decision — full breakdown.** The
   `routes.ts:115-118` scope call is superseded by this task. Implement full
   design parity: per-severity badges (icon + count) + hover tooltip with
   per-finding detail (severity, title, category, `file:line`, confidence,
   rationale snippet), backed by a real server-side aggregation.
2. **Agent-runs labels: Timeline row only**, matching the design exactly.
   `RunHistory.tsx` (Timeline) gets severity badges; `ReviewRunAccordion.tsx`
   header stays as today's plain-text count (unchanged) — same as
   `ReviewRunCard` in the design. This means `RunSummary` needs a real
   per-severity breakdown source (see below); the "no backend change" option
   was not chosen.
3. **All three severities** (CRITICAL/WARNING/SUGGESTION) count toward both
   the list column and the Timeline badges, matching the design as-is — no
   suppression of SUGGESTION noise.
4. **Display-only**, no new filter/sort tied to the findings data. Scope
   stays "render the labels," not "add a findings-based filter."

## Change surface

- `server/src/vendor/shared/contracts/platform.ts`: extend `PrMeta` with a
  findings breakdown, e.g. `findings: { CRITICAL: number; WARNING: number;
  SUGGESTION: number }` — **and** port the same targeted diff into
  `client/src/vendor/shared/contracts/platform.ts` (never copy the whole
  file — the two copies have already drifted; see `server/INSIGHTS.md`
  2026-09-15 entry). Likely also want an array of individual findings (or a
  capped preview) for the list's hover tooltip — decide the exact tooltip
  payload shape when implementing (full `Finding[]` per PR vs. a trimmed
  `{severity, category, title, file, start_line, end_line, confidence,
  rationale}[]`) to avoid over-fetching full rationale/suggestion markdown
  for every row.
- `server/src/modules/pulls/routes.ts`: add a per-PR severity-count (+
  tooltip detail) query alongside the existing score/cost aggregation (same
  IN-query + JS-fold pattern used for `latestReviewByPr`/`costByPr`),
  replacing the comment that currently disclaims this.
- `client/src/app/repos/[repoId]/pulls/`: `constants.ts` (`COLUMN_KEYS`,
  `GRID` — new track between score and status), `styles.ts`, new
  `_components/FindingsCell` + `_components/FindingsTooltip` (or a shared
  page-local tooltip reused by both surfaces — see below), `PRRow.tsx`
  wiring.
- `client/messages/en/prReview.json`: `list.columns.findings` + tooltip
  strings (e.g. "N findings").
- `RunSummary` (`server/src/vendor/shared/contracts/trace.ts:96`, + client
  mirror): add the same per-severity breakdown. Source it via a
  `reviews`→`findings` join keyed by `reviews.runId = agent_runs.id` at read
  time (consistent with the list's read-time aggregation pattern), or a
  denormalized column written at run completion (consistent with how
  `findings_count`/`blockers` are already denormalized on `agent_runs`) —
  the denormalized route is more consistent with this table's existing
  precedent and avoids adding a join to the trace/timeline read path;
  confirm during implementation which the run-completion write path
  (reviewer-core / wherever `agent_runs` rows get finalized) can populate
  most cheaply.
- `client/.../[number]/_components/RunHistory/RunHistory.tsx`: replace the
  plain-text `runStatus.findings`/`runStatus.blockers` line with severity
  badges (+ hover tooltip, reusing the component built for the list).
- Consider a single shared `FindingsTooltip`-equivalent component (page-local
  under `pulls/`, or promoted to `@devdigest/ui` if both the list and the PR
  detail page need it — per `CLAUDE.md`, only vendor it if it's a genuine
  cross-page primitive, not a one-off).
- Tests: `PRRow`/list page tests (new), `RunHistory.test.tsx` (currently
  asserts the plain-text counts — will need updating), any new
  `FindingsCell`/`FindingsTooltip` tests.
- Migration: only needed if the `RunSummary` breakdown is denormalized
  (new column(s) on `agent_runs` via `pnpm db:generate`); not needed if
  sourced via read-time join.
