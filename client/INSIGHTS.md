# client — insights

What the code of this module does not show: lasting facts about it, and the
lessons of past work sessions. Read it before working here. It is the one place
for this knowledge: the `engineering-insights` skill appends to it, and people
edit it.

- **Key Facts** is curated. Edit or remove an entry when it stops being true.
  Format: `### YYYY-MM-DD — short title`, then **What happened**, **Why** and
  **Rule**.
- Every other section is append-only. Add entries, never rewrite or delete
  them; correct one by appending a new dated entry that names it. Format:
  `- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## Key Facts

<!-- Lasting facts about the module, promoted from the sections below. -->

### 2026-11-21 — The client's contract copy differs from the server's

**What happened:** `src/vendor/shared` differs from
`../server/src/vendor/shared` in five files (see `../server/INSIGHTS.md`).

**Why:** the contracts are vendored per package with no sync check, and client
tests mock `fetch`, so a mismatch does not fail any client test.

**Rule:** before building on a contract here, diff it against the server copy;
treat the server copy as the one the API actually validates against.

### 2026-11-22 — A findings counter must equal what a click on it shows

**What happened:** the severity filter on a review run (`SeverityFilter` inside
`FindingsPanel`) shows a counter per level next to `Hide low confidence`. The
counters are computed after the confidence filter and before the severity
filter, and both filters live in the panel's local state, so nothing is
requested when a counter is clicked.

**Why:** the list a reviewer sees is the result of both filters. A counter taken
from the unfiltered run stops matching the list as soon as the toggle is on, and
an empty level that is also the active filter would leave no way to clear it.

**Rule:** derive every count and every list in `FindingsPanel` from the findings
already loaded, through the helpers in `FindingsPanel/helpers.ts`; count before
the filter the counter itself applies and after every other filter; never
disable the control that clears the active filter.

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

- 2026-11-21 — Never run a second `next dev` in `client/` (any port) while `pnpm dev` is up: both share `client/.next`, and the original server then 404s its chunks (`ChunkLoadError: Loading chunk app/agents/page failed`). Recovery: stop it, `rm -rf .next`, `pnpm dev`. Evidence: scripts/e2e.sh:148

- 2026-11-22 — Do not set `borderColor` next to `borderLeftColor` in an inline style: `borderColor` is itself a shorthand, so React warns ("Updating a style property during rerender (borderColor) when a conflicting property is set") and can drop the left colour whenever the value changes, e.g. when the focused finding card moves. Use the four per-side longhands for both colour and width. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:11

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — Failed runs carry `tokens_in/out = 0` (not null) in `RunSummary`; gate any token/cost display on `status === "done"` or a failed run renders `0→0`. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:204

- 2026-11-22 — `Chip` (active style fixed to the accent colour, count after the label) and `SeverityBadge` (a `span`, not a button) cannot be a severity-coloured toggle, and `src/vendor/ui` is off limits for feature work. Build such a control locally under `_components/` as a `<button aria-pressed>` and take colours from the `SEV` tokens of `@devdigest/ui`; put the label text in `messages/en`, not `SEV[x].label`. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilter/SeverityFilter.tsx:39

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

- 2026-11-22 — A vitest path filter that contains the route folders `[repoId]` / `[number]` matches nothing ("No test files found"), with or without escaping the brackets. Filter by a plain name fragment instead: `pnpm exec vitest run FindingsPanel SeverityFilter`. Evidence: client/vitest.config.ts:18

## Decisions

<!-- A decision and the reason for it. -->

- 2026-11-21 — Review-run headers get their cost from the already-loaded `usePrRuns` (map `run_id → cost_usd`, done runs only) rather than widening the `ReviewRecord` contract; reuse that map for any other per-review run metric. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:50

- 2026-11-22 — Severity counters are computed after `Hide low confidence` and before the severity filter, so a counter always equals the number of cards a click on it shows; counting the unfiltered run would break "the number matches the list" as soon as the toggle is on. A level with 0 findings is disabled, except when it is the active filter, because the toggle can empty the active level and the filter must still be clearable. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:36

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and specs/ for the package; no source code changed.

- 2026-11-21 — Built M1 run cost badge (client): `RunCostBadge` (compact/detailed) in PR list, timeline, review-run header and trace COST tile; spec client/specs/M1-cost-badge.md.

- 2026-11-22 — Built the M1 severity filter (client only): `SeverityFilter` counters above each run's findings, `countBySeverity` / `visibleFindings({ hideLow, severity })`; spec client/specs/M1-severity-filter.md. Checked live on seeded PR #482; the combination with `Hide low confidence` is covered by tests only, because no stored finding is below 0.65 confidence.

## Open Questions

<!-- What is still unresolved. -->
