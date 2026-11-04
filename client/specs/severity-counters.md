# Severity counters — findings filter on the PR page

## Goal

On the PR page, each review run shows how many findings it has per severity —
`CRITICAL 3 · WARNING 5 · SUGGESTION 2` — and clicking a level shows only that level's findings.
Pure client-side over data already loaded: **no new requests, no model calls**.

## Scope

### Where
`FindingsPanel` toolbar (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`), i.e. once per
review run (`ReviewRunAccordion`), at the left of the toolbar; "Hide low confidence" stays right-aligned.
Hidden when the run has no findings at all.
Counters and list come from the same array, so they always agree.

### `SeverityCounters` component (new)
Location: `FindingsPanel/_components/SeverityCounters/` — standard folder shape
(`SeverityCounters.tsx`, `index.ts`, `styles.ts`, `SeverityCounters.test.tsx`).
**i18n-free by design** (rendered in `/showcase` without an intl provider): callers pass `labels`.
Props: `{ counts: Record<Severity, number>; active: Severity | null; onSelect: (s: Severity | null) => void; labels: { group: string; showOnly: (sev: string) => string } }`.
- One `<button type="button" aria-pressed>` per severity (CRITICAL, WARNING, SUGGESTION — the contract's
  `Severity` enum, in that order), each rendering `SeverityBadge` with `count` (icon + label + number;
  never color alone).
- Wrapped in `role="group"` with `aria-label={labels.group}`; each button `title`/`aria-label` = `labels.showOnly(...)`.
- ~~Count `0` → button `disabled` (still shown, so the three levels never jump around).~~
  **Changed 2026-11-04 (mentor review, see [pr-list-findings.md](pr-list-findings.md)):** levels with count `0`
  are hidden, so the toolbar shows at a glance what the run found.
- Active button gets an accent outline; inactive buttons are dimmed only while a filter is active.
- Inline style objects off CSS variables, no hard-coded colors.

### Filtering (`FindingsPanel/helpers.ts`)
- `countBySeverity(findings)` → `{ CRITICAL, WARNING, SUGGESTION }` (zeros included).
- `visibleFindings(findings, hideLow, severity = null)` — existing confidence filter + sort, plus severity filter.
- Counts are computed **after** the "Hide low confidence" filter, so turning it on lowers the numbers
  together with the list.

### `FindingsPanel` behavior
- State `severity: Severity | null` (default `null` = all).
- Click a level → only its findings. Click the active level again → back to all.
- If the active level drops to 0 (e.g. hide-low-confidence hides them all) → filter resets to all.
- Changing the filter resets j/k focus to the first finding.

### i18n (`messages/en/prReview.json`, under `panel`)
- `severityFilter`: "Filter findings by severity"
- `showOnly`: "Show only {severity} findings"

### Showcase
Add `SeverityCounters` (one with an active level, one with a zero level) to `src/components/showcase/Showcase.tsx`.

## Out of scope
- Aggregated counters across all runs of a PR.
- Persisting the filter in the URL.
- Server changes, contract changes.

## Acceptance criteria
1. Each review run with findings shows `CRITICAL n · WARNING n · SUGGESTION n`; numbers equal the cards in its list.
2. Clicking a level shows only that level; clicking it again shows all; zero levels are hidden (was: disabled).
3. "Hide low confidence" updates counters and list together.
4. Buttons are keyboard-operable, expose `aria-pressed`, and the group has an accessible name.
5. No new network requests or LLM calls when using the counters.
6. Tests: `helpers` unit (count, filter, zero/empty), `SeverityCounters` render/press/disabled,
   `FindingsPanel` click-to-filter + toggle reset + hide-low interaction; showcase smoke passes.
   `tsc --noEmit` and `vitest run` green.
