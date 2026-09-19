# Client Architecture — Next.js App Router & Data Flow

Architecture and deep-dive documentation for `@devdigest/web` (routing, data fetching, component layers). For setup, see [../README.md](../README.md).

## Overview

`@devdigest/web` is a Next.js 15 App Router application (React 19) that serves as the primary UI for DevDigest: importing repositories, browsing pull requests, running AI reviews, and reading findings. Data flows through **TanStack Query** hooks over the Fastify API (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`). Components are co-located with their tests, styles, and i18n messages.

## App Router Layout & Naming Convention

The app is organized under `src/app/repos/[repoId]/pulls/` with dynamic segments and colocated features.

### Directory Structure

**PR list page** (`src/app/repos/[repoId]/pulls/page.tsx` line 1–135):
- Route: `/repos/:repoId/pulls`
- Fetches `usePulls(repoId)` and renders a grid of PRs filtered/sorted by status, title, and size
- `_components/` folder holds `PRRow/` (one clickable table row) and `FilterBar/` (status filter tabs, search, sort dropdown, refresh)

**PR detail page** (`src/app/repos/[repoId]/pulls/[number]/page.tsx` line 1–185):
- Route: `/repos/:repoId/pulls/:number`
- Tabs: Overview, Findings, Diff
- Fetches PR metadata, reviews list, and live run status; invalidates cached runs when one completes
- `_components/` folder holds `FindingsTab/`, `ReviewRunAccordion/`, `FindingsPanel/`, `VerdictBanner/`, `DiffTab/`, `PrDetailHeader/`

### Component Folder Convention

Each feature under `_components/<PascalCase>/` follows this structure:

```
_components/FindingsPanel/
  ├── FindingsPanel.tsx         # Main component
  ├── index.ts                  # Named export
  ├── styles.ts                 # Inline CSSProperties (no CSS modules)
  ├── constants.ts              # Feature constants (filter order, thresholds)
  ├── helpers.ts                # Pure utilities (severityCounts, visibleFindings)
  ├── FindingsPanel.test.tsx    # Vitest + jsdom tests
  └── _components/              # Sub-components (if any)
      └── SeverityFilterChip/   # (follows same convention)
```

**Real examples:**
- `ReviewRunAccordion/` (`src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` line 26–167): collapsible agent run with verdict, findings, and metadata
- `FindingsPanel/` (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` line 16–106): severity filter pills, hide-low toggle, finding cards with j/k navigation
- `PRRow/` (`src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` line 16–107): one PR list row with findings severity preview

## Data Layer: TanStack Query

All data fetching is lazy and cached via TanStack Query hooks in `src/lib/hooks/reviews.ts`.

### Query Keys & Hooks

| Hook | Query Key | Returns | Citation |
|------|-----------|---------|----------|
| `usePulls(repoId)` | `["pulls", repoId]` | `GET /repos/:repoId/pulls` | `src/lib/hooks/reviews.ts` |
| `usePrReviews(prId, enabled)` | `["reviews", prId]` | `GET /pulls/:prId/reviews` | line 55–61 |
| `usePrRuns(prId)` | `["pr-runs", prId]` | `GET /pulls/:prId/runs` (cost/tokens) | line 40–47 |
| `usePrActiveRuns(prId)` | `["pr-active-runs", prId]` | `GET /pulls/:prId/runs/active` (self-polls every 4s) | line 28–34 |

**Global error handling** (`src/lib/providers.tsx` line 21–55): Mutation errors toast immediately. Query errors only toast on network/5xx (4xx stay silent for inline empty states).

## Styling Convention

**No CSS modules, no Tailwind classes in JSX.** All inline styles are `CSSProperties` objects in colocated `styles.ts` files.

Example: `src/app/repos/[repoId]/pulls/styles.ts` (line 6–14):
```typescript
row: (hover: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: GRID,
  gap: 14,
  padding: "12px 20px",
  background: hover ? "var(--bg-surface)" : "transparent",
}),
```

**Color tokens** (e.g., `--border`, `--text-primary`, `--bg-surface`, `--crit`, `--ok`, `--warn`) are CSS variables in the root theme and adapt to light/dark mode.

## i18n with next-intl

All UI strings are namespaced by feature under `messages/en/` (one file per page/feature area).

Example: `messages/en/prReview.json` (line 1–50):
- `prReview.list.*` — PR list page (column headers, status labels, empty states)
- `prReview.panel.*` — Findings panel (hide-low toggle, filter help)
- `prReview.verdict.*` — Verdict banner (findings count, blockers, score)

Usage: `const t = useTranslations("prReview"); t("list.title")`

## End-to-End: Severity Findings Feature

The newest addition surfaces finding severity on two surfaces. Here's how data flows end to end:

### 1. PR List: Findings Column + Hover Preview

**PRRow** (`src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` line 16–107):
- Line 26: `presentFindingsSeverities(pr)` extracts severity pill labels from server-computed `pr.findings_counts`
- Line 82–86: Renders `SeverityBadge` chips (CRITICAL, WARNING, SUGGESTION) with counts
- Line 31: `usePrReviews(pr.id, preview != null)` lazy-fetches reviews only on first hover (the `enabled` prop gates the query)
- Line 32: `latestFindingsPerAgent(reviews ?? [])` filters to latest review per agent, ensuring preview counts match pill counts

**Helper functions** (`src/app/repos/[repoId]/pulls/helpers.ts` line 30–56):
- `presentFindingsSeverities(pr)` (line 30–36) orders severity pills CRITICAL → WARNING → SUGGESTION, skips zero-count severities
- `latestFindingsPerAgent(reviews)` (line 45–56) keeps only the latest review per agent, avoiding duplicate findings across re-runs

**FindingsPreviewCard** (`src/components/findings-preview/FindingsPreviewCard.tsx` line 10–44):
- Read-only popover (fixed position) with severity badge + title + category + file:line + confidence + rationale per finding
- Triggered by hover enter/leave on findings cell

### 2. PR Detail: Review Runs & Findings Panel

**ReviewRunAccordion** (`src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` line 26–167):
- One accordion per agent run; displays verdict badge, findings + blockers count, score, cost/tokens
- Line 157–162: Renders `<FindingsPanel findings={review.findings} ... />`

**FindingsPanel** (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` line 16–106):
- Line 29–30: State: `hideLow` toggle and `severity` filter (null = all)
- Line 35–40: Three memoized lists:
  - `counted` = findings with hideLow (no severity filter, so counts match what pills display)
  - `counts` = severity→count breakdown
  - `shown` = findings after both hideLow AND severity filter
- Line 69–77: Renders severity pills from `SEVERITY_FILTERS` order (CRITICAL → WARNING → SUGGESTION); click toggles filter
- Line 90–102: Renders `FindingCard` for each finding in `shown`

**Helpers** (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts` line 10–34):
- `visibleFindings(findings, hideLow, severity)` (line 10–21) applies hideLow first, then severity filter, sorts by `SEVERITY_ORDER`
- `severityCounts(findings)` (line 28–34) groups by severity, omits zeros

**Constants** (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts`):
- `SEVERITY_ORDER` (line 4–9) sort weight (CRITICAL=0, WARNING=1, SUGGESTION=2, INFO=3)
- `LOW_CONFIDENCE_THRESHOLD` (line 12) = 0.65
- `SEVERITY_FILTERS` (line 21–25) = display order array

**Styles** (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/styles.ts` line 4–33):
- `s.toolbar` flex row for pills + toggle
- `s.pillRow` wrapping flex for severity chips
- `s.list` column layout for finding cards

### 3. Keyboard Navigation & Actions

**FindingsPanel** line 48–60:
- j/k navigation moves focus up/down in the `shown` list
- a/d shortcuts trigger finding actions (accept/dismiss) on the focused card
- Focus index resets when hideLow or severity changes

**useFindingAction hook** (`src/lib/hooks/reviews.ts` line 143–165):
- Posts `POST /findings/:findingId/:action`
- Invalidates `["reviews", prId]` on success so UI updates immediately

## Testing

Component tests (`*.test.tsx`) run under **vitest + jsdom** (`vitest.config.ts` line 14–20). Fetch is mocked—tests need neither API nor browser. Real browser journeys (client + API + seeded DB) are covered by `../e2e/` suite and `e2e-web.yml` workflow.

## Quick Start

- **Dev:** `pnpm dev` (`:3000`)
- **Build:** `pnpm build`
- **Test:** `pnpm test` (vitest)
- **Typecheck:** `pnpm typecheck`
