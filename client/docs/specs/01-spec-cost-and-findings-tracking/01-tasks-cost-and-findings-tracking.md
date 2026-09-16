# 01-tasks-cost-and-findings-tracking.md

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|---|---|---|---|
| root `CLAUDE.md`, `client/CLAUDE.md` | yes | Colocated `_components/<Name>/` with `styles.ts`/`helpers.ts`/`constants.ts`/`index.ts`; pages stay thin; `src/vendor/*` do-not-touch | none |
| `client/INSIGHTS.md` | yes | `SeverityBadge` already supports a `count` prop (`Badge.tsx:52-88`); one shared cost formatter (`formatRunCost`) reused across all cost surfaces | none |

## Tasks

### [x] 1.0 Shared cost badge across all run-cost surfaces
Pre-existing (`RunCostBadge`/`formatRunCost`); confirmed still the single
formatter used by PR list, Timeline, VerdictBanner, and TraceBody — no
changes needed this round.

### [x] 2.0 Review-runs severity pill panel (count + filter)

#### 2.0 Tasks
- [x] 2.1 Extract `severityCounts`/`FILTERABLE_SEVERITIES`/`SEVERITY_ORDER`/`lineLabel` to `client/src/lib/findings.ts`.
- [x] 2.2 Re-export from `FindingsPanel/{helpers,constants}.ts` and `FindingCard/helpers.ts` so existing imports keep working.
- [x] 2.3 Fix `FindingsPanel.tsx` pill row to filter out zero-count severities (keeping the active filter's own pill visible).
- [x] 2.4 Update `RunHistory.tsx` to import the shared helpers directly (`../FindingsPanel/*` → `@/lib/findings`).
- [x] 2.5 Add regression test: "only renders pills for severities that actually have findings."

### [x] 3.0 PR-list FINDINGS column + hover popover

#### 3.0 Tasks
- [x] 3.1 Add `findings` to `COLUMN_KEYS`, widen `GRID`, add `list.columns.findings` + `list.findingsPopover.title` i18n keys.
- [x] 3.2 Build `FindingsSummary` component (trigger icons + hover popover + read-only preview cards).
- [x] 3.3 Build `shortDescription`/`sortedFindings` helpers (markdown-stripped description, severity-first ordering).
- [x] 3.4 Wire `FindingsSummary` into `PRRow.tsx`.
- [x] 3.5 Remove dead `PrRowView` type from `client/src/lib/types.ts`.
- [x] 3.6 Write `FindingsSummary.test.tsx` (empty state, closed-by-default, hover content + no buttons, preview field rendering).

### [x] 4.0 Verification
- [x] 4.1 `pnpm typecheck` clean.
- [x] 4.2 `pnpm test` — 14 files / 65 tests green.
- [x] 4.3 Manual browser check via `./scripts/dev.sh` + Playwright against seeded PR #482.
