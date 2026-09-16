# 01-spec-cost-and-findings-tracking.md

## Introduction/Overview

Client-side half of the L01 cost/findings-visibility feature (see the full
cross-package spec at
[`server/docs/specs/02-spec-cost-and-findings-tracking`](../../../../server/docs/specs/02-spec-cost-and-findings-tracking/02-spec-cost-and-findings-tracking.md)
for backend contracts and rationale). This spec covers the `client`-only
surfaces: the shared cost badge, the Review-runs severity pill panel, the
PR-detail Timeline's severity chips, and the new PR-list FINDINGS column with
its hover popover.

## Goals

1. One shared `RunCostBadge` component/formatter renders cost consistently
   across the PR list, the run timeline, the verdict banner, and the trace
   drawer — no surface reimplements cost formatting.
2. One shared severity helper (`client/src/lib/findings.ts`) drives every
   severity-count/filter UI, so "only render severities that actually exist"
   and file:line formatting stay consistent everywhere.
3. The Review-runs findings panel lets a user filter by severity by clicking
   a pill, and clear the filter by clicking it again.
4. The PR-list FINDINGS column previews a PR's latest-review findings on
   hover, read-only, without navigating away from the list.

## User Stories

(See the cross-package spec's User Stories — this document does not
duplicate them; all four apply to client-owned surfaces.)

## Demoable Units of Work

### Unit 1: Shared cost badge across all run-cost surfaces

**Purpose:** Avoid a fourth cost-formatting implementation by reusing the
existing `RunCostBadge`/`formatRunCost` component.

**Functional Requirements:**
- The system shall render `pr.cost_usd` in the PR list via
  `RunCostBadge` (`client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`).
- The system shall render each run's own cost in the PR-detail Timeline via
  `RunCostBadge` (`variant="timeline"`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`).
- The system shall render a run's cost in its `VerdictBanner`
  (`variant="detail"`) and in the Trace drawer's `TraceBody` Stats section,
  both reusing `formatRunCost` rather than a local formatter.

**Proof Artifacts:**
- `client/src/components/run-cost-badge/RunCostBadge.test.tsx` (19 cases,
  pre-existing) covers formatting across all three variants.

---

### Unit 2: Review-runs severity pill panel (count + filter)

**Purpose:** Let a user see and filter a run's findings by severity, computed
purely by grouping already-loaded data.

**Functional Requirements:**
- The system shall render one pill per severity **present** in the current
  run's findings (count > 0), or the active filter's own severity even at
  0 (so it stays clickable to clear), in
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`.
- The system shall filter the findings list to the clicked severity on
  click, and clear the filter on a second click of the same pill.
- The system shall compute counts via `severityCounts()` from
  `client/src/lib/findings.ts` — a pure `filter`/grouping over the already-
  fetched `findings` array, with no additional network/LLM call.

**Proof Artifacts:**
- `FindingsPanel.test.tsx`: "only renders pills for severities that
  actually have findings" (regression test for the zero-count bug fixed in
  this unit) + existing filter/clear-filter tests.

---

### Unit 3: PR-list FINDINGS column + hover popover

**Purpose:** Preview a PR's latest-review findings from the list, read-only.

**Functional Requirements:**
- The system shall add a FINDINGS column to the PR list
  (`client/src/app/repos/[repoId]/pulls/constants.ts`: `COLUMN_KEYS`, `GRID`),
  rendering compact severity icons for `pr.findings`, or "—" when empty.
- The system shall show, on hover, a popover titled "N FINDINGS IN THIS RUN"
  (ICU-pluralized) listing each finding as a read-only card: severity icon,
  title, category, `file:line`, confidence percentage, and a short
  (markdown-stripped, ~140-char) description — no Accept/Reject controls.
- The system shall close the popover on mouse-leave and stop click
  propagation inside it, so interacting with the popover never triggers the
  row's PR-navigation click handler.

**Proof Artifacts:**
- New component: `client/src/app/repos/[repoId]/pulls/_components/FindingsSummary/`
  (`FindingsSummary.tsx`, `helpers.ts`, `styles.ts`, `index.ts`,
  `FindingsSummary.test.tsx` — 4 cases: empty dash, closed-by-default,
  hover-opens-with-correct-title-and-no-buttons, preview-field-rendering).
- Manual browser check (see cross-package spec's Success Metrics).

## Non-Goals (Out of Scope)

Same as the cross-package spec. Additionally, out of scope for the client
specifically:
1. **A generic reusable `Popover` primitive in `@devdigest/ui`:** the vendor
   package is Do-not-touch; the hover panel is a one-off colocated
   component, not a new design-system primitive.
2. **Clickable file:line deep-links in the list popover:** the PR-list
   endpoint doesn't carry repo owner/provider/head-sha per row, so the
   popover's file:line is plain text, unlike `FindingCard`'s clickable
   `MonoLink`.

## Design Considerations

The popover's visual language (position/border/shadow) mirrors the existing
`Dropdown` kit component without reusing it directly — see the cross-package
spec's Technical Considerations for why.

## Technical Considerations

- `client/src/lib/findings.ts` is the single source of truth for
  `severityCounts`/`FILTERABLE_SEVERITIES`/`lineLabel`; `FindingsPanel`,
  `RunHistory`, `FindingCard`, and `FindingsSummary` all import from it
  (some via re-exporting shims left in place so existing import paths didn't
  need touching).
- `pr.findings` on `PrMeta` is `nullish` (not defaulted server-side), so
  every consumer reads it as `pr.findings ?? []`.

## Security Considerations

Not applicable — read-only rendering of already-authorized data already
fetched for the page.

## Success Metrics

See the cross-package spec — verification is joint across `server`+`client`.

## Open Questions

None — documents already-implemented work (see
[`server/docs/specs/02-spec-cost-and-findings-tracking`](../../../../server/docs/specs/02-spec-cost-and-findings-tracking/02-spec-cost-and-findings-tracking.md)).
