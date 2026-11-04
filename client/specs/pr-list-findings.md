# PR list FINDINGS column + Timeline severity icons

Server half: [../../server/specs/pr-list-findings.md](../../server/specs/pr-list-findings.md).

## Goal

See what a PR's latest review found **before opening it**, and see at a glance what each agent run
found on the PR page. Source: mentor review (2026-11-04). Pure presentation over data the list / PR
page already loads — **no extra requests, no model calls**.

## Scope

### Shared `SeverityTally` (`src/components/severity-tally/`)
- Icon + count per severity via `SeverityBadge compact` — **only levels with count > 0**, in contract
  order (CRITICAL, WARNING, SUGGESTION). All zero → renders nothing (caller decides what "clean" is).
- Each chip `role="img"` with an accessible name from the caller's `label(severity, count)`.
- i18n-free (mounted in `/showcase`). Helpers: `countSeverities(findings)`, `nonZeroLevels(counts)`.

### PR list — `FINDINGS` column (`pulls/_components/FindingsCell/`)
- New column between SCORE and STATUS (`COLUMN_KEYS`, `GRID` in `pulls/constants.ts`).
- Data: `PrMeta.findings` (latest review; `null` = never reviewed).
  - `null` → `—` · all zero → "Clean" (`--ok`) · otherwise `SeverityTally`.
- Hover **or keyboard focus** → popover `FINDINGS IN THIS RUN` (`role="tooltip"`, linked via
  `aria-describedby`) with short cards: severity icon · title · `file:line` (mono), max 5 (server-capped,
  most severe first); footer `+N more on the PR page` when total > cards. Escape / mouse-leave / blur close it.
- Popover is `position: fixed`, placed by `placePopover()` from the cell rect: the table card has
  `overflow: hidden`, an absolutely positioned popover would be clipped. Flips upward near the
  viewport bottom; clamped horizontally.
- i18n (`messages/en/prReview.json`): `list.columns.findings`, `list.findings.{heading,none,more,chip}`.

### PR page — Timeline run tiles (`RunHistory`)
- New optional prop `severityByRun: Record<runId, Record<Severity, number>>`; a settled run with an
  entry shows `SeverityTally` before "N finding(s) · M blockers".
- `FindingsTab` builds it with `useMemo` from the already-loaded reviews (`review.run_id` →
  `countSeverities(review.findings)` excluding dismissed). Runs without a linked review show no icons.

### Severity counters (change to [severity-counters.md](severity-counters.md))
- Zero levels are **hidden**, not disabled — what the run found is readable at a glance.

### Showcase
`SeverityTally` (two variants) and `FindingsCell` (with findings, clean) in `Showcase.tsx`.

## Out of scope
- Aggregating findings across all runs of a PR in the list (latest review only, same as SCORE).
- Clicking a popover card to deep-link to the finding.
- Translating `SeverityBadge` labels (see `client/INSIGHTS.md` Open Questions).

## Acceptance criteria
1. PR list shows FINDINGS: `—` (never reviewed), "Clean", or only non-zero severity chips with counts.
2. Hover / focus opens `FINDINGS IN THIS RUN` with ≤5 cards (severity, title, file:line) and `+N more`;
   it is not clipped on the last row.
3. Timeline run tiles show severity icons with counts for exactly the levels that run found.
4. Severity counters hide zero levels; filtering still works and resets when the active level empties.
5. No new requests from the client. Tests: `SeverityTally`, `FindingsCell` (states, hover, focus/Escape,
   placement), `RunHistory` icons, updated `SeverityCounters`/`FindingsPanel`; showcase smoke passes.
   `tsc --noEmit` and `vitest run` green.
