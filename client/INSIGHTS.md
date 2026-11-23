# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. One line: `- YYYY-MM-DD — what — why/fix`.
If Claude keeps getting it wrong anyway, promote it to `client/CLAUDE.md`.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-11-23 — Task briefs may say a UI piece "already exists" when the starter stripped it (PR-list Findings column, timeline severity icons were missing) — grep/open the app before trusting it; both now come from `FindingsSummary` (src/components/findings-summary).
- 2026-11-23 — Hover popovers inside the PR table must use `position: fixed` from `getBoundingClientRect()` and stay DOM children of the trigger — the table card has `overflow: hidden` (clips absolute popovers) and a DOM-child popover keeps `mouseleave` from firing while hovering it (src/components/findings-summary/styles.ts › popover).
- 2026-11-23 — Per-run finding filters (hide-low, severity) live as state in FindingsPanel and go through `visibleFindings(findings, hideLow, severity)`; counts come from `countBySeverity` over the unfiltered run — `SeverityBadge` renders "icon Label count", so "N LABEL" pills read `SEV[sev].c/label` directly (_components/FindingsPanel/helpers.ts).
- 2026-11-22 — Show money via `formatCost` / `RunCostBadge` only — null means "no data" and renders `—` (never `$0.00`), a real 0 renders `$0.0000` (src/components/run-cost-badge).
- 2026-11-22 — Adding a PR-list column = `COLUMN_KEYS` + `GRID` in constants.ts + a cell in PRRow + `list.columns.<key>` in messages/en/prReview.json; header and rows share `GRID` (src/app/repos/[repoId]/pulls/constants.ts).

## Tool & Library Notes

## Recurring Errors & Fixes
- 2026-11-23 — SUPERSEDES 2026-11-23 borderColor entry — it was a real bug, not noise: `borderColor`/`borderWidth` are shorthands too, so changing `borderColor` next to `borderLeftColor` warns; use per-side longhands (`borderTopColor`… ) only (_components/FindingCard/styles.ts › card).
- 2026-11-23 — React "Updating a style property during rerender (borderColor)… (borderLeftColor)" stderr in FindingsPanel tests is pre-existing noise from FindingCard's focused-border style, not a test failure — ignore unless fixing FindingCard (_components/FindingCard).

## Session Notes
### 2026-11-23 — severity counters (Agent runs) + Findings column + timeline icons
- Built per-run severity pills + filter in FindingsPanel; then added the PR-list Findings column and timeline severity icons after the user pointed out the brief's "already exists" was wrong for this starter (needed a new server field `findings_by_severity`).
- `engineering-insights` was invoked by the model on its own (per CLAUDE.md "before finishing"), not by the user; later entries in this session were added by following the skill's rules without re-invoking it.
- Verified in the browser on a demo PR (#3, deliberately bad code): counts == cards per level, click filters, second click clears, zero levels hidden, no API request on click. Hide-low + severity combo is test-only — real findings were all ≥ 90% confidence.

## Open Questions
