# 02-spec-cost-and-findings-tracking.md

## Introduction/Overview

The starter template runs agent reviews and persists findings, but exposes no
run-cost visibility and no severity breakdown anywhere a PR is browsed at a
glance. This feature (course lesson L01) adds two things across `server` and
`client`: (1) **run cost tracking** — every agent run's USD cost is computed,
persisted, and surfaced on the PR list, the run timeline, the verdict banner,
and the trace drawer; and (2) **severity-aware findings visibility** — a
per-severity count/filter on the Review-runs findings panel, matching
count-chips on the timeline, and a hover popover on the PR list that previews
a PR's latest-review findings without leaving the list.

## Goals

1. A user can see, without opening a PR, roughly how much a review cost and
   how many CRITICAL/WARNING/SUGGESTION findings it produced.
2. Run cost is computed once (in `reviewer-core`) and threaded through
   persistence to every UI surface that shows a run, with one shared
   formatter — no surface reimplements cost math or formatting.
3. A PR's findings can be filtered by severity in the Review-runs accordion,
   and the pill counts shown there are always a simple count over the
   findings already loaded (no extra LLM/API round-trip).
4. The PR list's FINDINGS column offers a read-only preview of a PR's most
   recent review's findings via hover, without needing to open the PR.

## User Stories

- **As a reviewer scanning the PR list**, I want to see each PR's total
  review spend and finding counts by severity, so I can triage without
  opening every PR.
- **As a reviewer inside a PR**, I want the Review-runs findings panel to
  show me counts per severity and let me click one to filter, so I can focus
  on CRITICAL findings first.
- **As a reviewer inspecting a run's trace**, I want to see that run's exact
  cost next to its duration/tokens, so I can judge whether a model choice is
  worth its price.
- **As someone budgeting LLM spend**, I want the PR list's Cost column to
  reflect total spend on a PR across every review it's had, not just the
  most recent one, so nothing is hidden.

## Demoable Units of Work

### Unit 1: Run cost computation & persistence

**Purpose:** Make cost a first-class, persisted field on every agent run
instead of a value computed-then-discarded.

**Functional Requirements:**
- The system shall compute `costUsd` per LLM call in `reviewer-core`
  (`ReviewOutcome.costUsd`, map-reduce aware — `null` if any chunk's cost is
  unknown) from provider usage × the model's `PriceBook` entry.
- The system shall persist `costUsd` on the `agent_runs` row for every run
  (`server/src/db/schema/runs.ts`), populated by `run-executor.ts` from the
  `ReviewOutcome` it already receives (not recomputed).
- The system shall expose `cost_usd`/`tokens_in`/`tokens_out` on the
  `RunSummary`/run-trace API shapes already returned to the client.

**Proof Artifacts:**
- Unit test: a stubbed `LLMProvider` returning known usage produces the
  expected `costUsd` via `PriceBook` (`server/test/price-book.test.ts`).
- Integration check: running a review persists a non-null `agent_runs.cost_usd`
  for a `status='done'` run (verified via `run-executor`/repository tests).

---

### Unit 2: PR-list COST column (total spend per PR)

**Purpose:** Surface an at-a-glance cost figure on the PR list without an
N+1 query per row.

**Functional Requirements:**
- The system shall add `cost_usd: number | null` to the shared `PrMeta`
  contract (`server/src/vendor/shared/contracts/platform.ts`, mirrored into
  `client/src/vendor/shared`).
- The system shall compute, in `GET /repos/:id/pulls`, the sum of `cost_usd`
  over every `status='done'` `agent_runs` row for the PR — its **entire**
  review history, not scoped to any single review batch — via one
  `IN (prIds)` query plus in-process grouping (`total-cost.ts`,
  `totalCostByPr`).
- The system shall return `null` (not `0`) for a PR with zero completed
  runs, so the client can render "—" instead of a misleading `$0.00`.

**Proof Artifacts:**
- Unit test: `total-cost.test.ts` covers single-run, multi-run summation
  across a PR's whole history, failed-runs-excluded, all-failed → `null`,
  and PR isolation.
- API test: `GET /repos/:id/pulls` response's `cost_usd` matches a manually
  summed fixture of `agent_runs` rows spanning more than one review batch.

---

### Unit 3: Findings-by-severity — Review-runs panel, Timeline, and PR-list popover

**Purpose:** Let a severity breakdown be seen and filtered wherever findings
already are, computed purely by grouping already-loaded data.

**Functional Requirements:**
- The system shall add `findings: Finding[] | null` to `PrMeta` (list
  endpoint only), populated from the PR's **latest review's** findings — the
  same review the `score` field is derived from — via one
  `IN (reviewIds)` query keyed off the already-computed latest-review map.
- The system shall provide a single shared client-side helper
  (`client/src/lib/findings.ts`: `severityCounts`, `FILTERABLE_SEVERITIES`,
  `lineLabel`) used by every severity-count/filter UI, so severity grouping
  logic and file:line formatting are defined once.
- The system shall render, in the Review-runs accordion's findings panel, a
  clickable pill per severity **actually present** in that run's findings
  (count > 0, or the currently active filter's own severity so it stays
  clickable to clear); clicking a pill filters the findings list to that
  severity, clicking the same pill again clears the filter.
- The system shall render, in the PR-detail Timeline, a compact (non-clickable)
  severity chip per severity present in that run's findings, next to its
  cost badge.
- The system shall render, in the PR-list FINDINGS column, compact severity
  icons for the PR's latest-review findings (or "—" when none), and on
  hover show a read-only popover titled "N FINDINGS IN THIS RUN" listing
  each finding's severity, title, category, file:line, confidence, and a
  short (non-markdown) description — no accept/reject actions here; those
  remain exclusive to the PR-detail Review-runs `FindingCard`.

**Proof Artifacts:**
- Component test: `FindingsPanel.test.tsx` — pill row only renders
  severities with count > 0; clicking filters and clicking again clears.
- Component test: `FindingsSummary.test.tsx` — dash on no findings, hover
  opens/closes a read-only popover with no `<button>` elements, correct
  title pluralization.
- Manual browser check: PR list hover popover and PR-detail severity-pill
  filter both verified against seeded data (see Success Metrics).

## Non-Goals (Out of Scope)

1. **Cost budgets/alerts:** no spend limits, warnings, or per-workspace
   budget tracking — this feature only displays already-computed cost.
2. **Historical cost trends/charts:** no time-series cost visualization;
   only current point-in-time totals per PR/run.
3. **Editing findings from the popover:** the PR-list popover is read-only
   by design — accept/dismiss stays on the PR-detail page.
4. **Cross-PR/workspace-wide cost rollups:** the COST column is per-PR only;
   no repo- or workspace-level aggregate view.

## Design Considerations

The FINDINGS column popover reuses the same visual language as the existing
`Dropdown` primitive's positioning (`position: relative` trigger +
`position: absolute` panel below it) without depending on `Dropdown` itself,
since its content (read-only finding preview cards) and trigger behavior
(hover, not click) don't fit that primitive's menu-item API. All new styling
is co-located per this repo's `styles.ts` convention, not added to the
vendored `@devdigest/ui` package.

## Technical Considerations

- `PrMeta.findings` and `PrMeta.cost_usd` are both list-endpoint-only
  enrichments computed on read (no denormalized columns on `pull_requests`)
  — consistent with the pre-existing `score` field's derivation pattern.
- The PR-list popover's findings are scoped to the PR's **single latest
  review** (matching `score`'s semantics — "this run"), while the COST
  column is scoped to **all** completed runs ever — these are intentionally
  different scopes for different questions ("what did the last review find"
  vs. "what have I spent on this PR total").
- Severity-count/grouping logic lives in one shared client helper
  (`client/src/lib/findings.ts`) rather than being duplicated per surface,
  to keep the "only real severities, in the same order" rule consistent
  everywhere it's rendered.

## Security Considerations

Not applicable — this feature surfaces already-computed, already-authorized
data (a workspace's own run costs and findings); no new external calls, no
new secrets, no new user input surface.

## Success Metrics

1. `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` green.
2. `cd client && pnpm typecheck && pnpm test` green.
3. Manual check against the seeded demo PR (`acme/payments-api` #482):
   the PR-list row shows FINDINGS severity icons and a hover popover titled
   "N FINDINGS IN THIS RUN" with read-only preview cards; the PR-detail
   Review-runs pill row shows only the severities actually present and
   filters correctly on click/click-again.
4. No cost or findings surface silently shows `$0.00`/an empty pill row for
   a PR that has never been reviewed — both render as "—"/no pills instead.

## Open Questions

None — this spec documents a feature already implemented on the `L01`
branch; open design questions were resolved during implementation (see
`server/INSIGHTS.md` and `client/INSIGHTS.md` Decision/Pattern entries dated
2026-09-14 through 2026-09-16 for the reasoning behind each choice).
