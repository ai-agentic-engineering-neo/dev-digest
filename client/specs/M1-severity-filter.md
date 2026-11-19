# M1 — Severity counters + filter (client)

Client only. No server spec: no API or contract changes.

## Goal
Inside an expanded review run on the **Agent runs** tab, show how many findings that run has per
severity (`1 CRITICAL · 3 WARNING · 1 SUGGESTION`). Clicking a level narrows the run's list to that
level. Clicking it again brings back the full list.

## Design
**Use the project's existing UI. No new visual styles.** The filter chips are the same `Chip`
primitive from `@devdigest/ui` that the PR-list status filter already uses
(`src/app/repos/[repoId]/pulls/_components/FilterBar/FilterBar.tsx`). Severity colour and icon come
from `SEV` (`@devdigest/ui`). No custom palette, pill styles or new tokens.

Per level:

```tsx
<Chip
  icon={SEV[level].icon}
  color={SEV[level].c}
  active={severity === level}
  onClick={() => setSeverity((s) => (s === level ? null : level))}
>
  {counts[level]} {level}
</Chip>
```

- Text: `{count} {level}`, where `level` is the contract value (`3 WARNING`). It matches the required
  format with no extra uppercase handling. The count goes in `children`, not in `count`, because
  `Chip` renders `count` **after** the label.
- Active state comes from `Chip` itself: accent border, background and text. Only the icon keeps the
  severity colour.
- Chips sit in a row with the toolbar's existing `gap` and no `·` separators, like `FilterBar`.
- `SeverityBadge` is not used here. It is a non-interactive `<span>`.

### Behaviour mockups
The user supplied them in chat on 2026-11-19. They define **behaviour only**: what is shown and how
the filter combines with Hide low confidence. The visual design comes from the existing components
above, not from the mockups' styling. The PNGs are not in the repo yet; save them as
`specs/assets/M1-severity-filter-*.png` if they need keeping.

1. **Security Reviewer, filter active + Hide low confidence on.** The header reads
   `5 findings · 1 blocker`. Chips `1 CRITICAL`, `3 WARNING` (active), `1 SUGGESTION` on the left,
   `Hide low confidence` on the right. The list shows only the 3 WARNING cards that pass both conditions.
2. **General Reviewer, no filter, Hide low confidence off.** It has no CRITICAL findings, so only
   `2 WARNING` and `2 SUGGESTION` are shown. The list shows all 4 cards.

What the mockups decide:
- A level with 0 findings is **not rendered**.
- There is no separate "Show all" button. Clicking the active chip again clears the filter.
- The run header (`N findings · N blocker(s)`) and `VerdictBanner` stay unchanged.

## Scope
**In**: the `FindingsPanel` toolbar of each run (`ReviewRunAccordion` body).

**Out**:
- The run header's `N blockers` (`ReviewRunAccordion.tsx`). It stays as is: undismissed `CRITICAL` only.
- `VerdictBanner` counts, the PR-level count in the tab label, the lethal-trifecta banner.
- **Timeline per-severity icons.** The PR-page mockup shows rows like `⊙2 ⚠1 · 2 blockers`. Today
  `RunHistory` shows `N findings · N blockers`, and `RunSummary` has only `findings_count` and
  `blockers`. Adding them needs per-severity counts from the server, so it gets its own spec.
- Multi-select, filter by category or status, persisting the filter in the URL or across runs.
- `FindingCard` and every `@devdigest/ui` primitive (`Chip`, `SeverityBadge`, `SEV`). None is changed.

## API / data changes
None. Data is already loaded:
`GET /pulls/:id/reviews` → `usePrReviews(prId)` (`src/lib/hooks/reviews.ts`) → `page.tsx` `runs`
→ `FindingsTab` → `ReviewRunAccordion` (`review.findings`) → `FindingsPanel findings`.

Levels come from the contract `Severity` in `@devdigest/shared` (`contracts/findings.ts`):
`CRITICAL`, `WARNING`, `SUGGESTION`. No custom levels.

## Implementation
All in `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`.

### `constants.ts`
- `SEVERITY_LEVELS`: the 3 contract levels in chip order, built from a
  `Record<Severity, true>` literal so tsc fails if the contract changes. Use a **type-only** import
  of `Severity`. A runtime import (`Severity.options`) breaks the Next build: webpack can't resolve
  the `.js` specifiers in `src/vendor/shared`. Do **not** iterate `Object.keys(SEV)` or
  `SEVERITY_ORDER`: both include `INFO`, which is not in the contract.

### `helpers.ts`
- `countBySeverity(findings): Record<Severity, number>`. Every level present, `0` when there are none.
- `visibleFindings(findings, hideLow, severity: Severity | null)`. Pipeline:
  1. `hideLow` drops `confidence < LOW_CONFIDENCE_THRESHOLD` (unchanged).
  2. `severity` (when not `null`) keeps only that level.
  3. Sort by `SEVERITY_ORDER` (unchanged).
- Counters are computed from the findings **after step 1, before step 2**. So each number equals
  what the list shows after clicking that level, with or without Hide low confidence.

### `FindingsPanel.tsx`
- New state `severity: Severity | null` (default `null`), next to `hideLow`. It is local to the run.
  Collapsing the accordion unmounts the body and resets it. That is fine.
- `counts = useMemo(() => countBySeverity(afterHideLow), …)`. `shown = visibleFindings(findings, hideLow, severity)`.
- Toolbar, left side (Hide low confidence stays on the right via the existing `toggleGroup` `marginLeft: auto`):
  - A wrapper with `role="group"` and `aria-label={t("panel.severityFilter")}`.
  - One `Chip` per level in `SEVERITY_LEVELS` (see **Design**), rendered only where
    `counts[level] > 0` **or** the level is active. That keeps an active chip visible as `0 WARNING`
    if Hide low confidence empties it, so the user can still clear it.
- Reset `focusIdx` to `0` whenever `severity` or `hideLow` changes. Otherwise j/k/a/d can target
  an index past the end of the shorter list.
- An empty result reuses the existing `noMatchTitle` / `noMatchBody` empty state.
- `styles.ts`: only a `severityGroup` row (`display: flex`, `gap` like `toolbar`). No chip styles.

### `messages/en/prReview.json` → `panel`
- `severityFilter`: `"Filter by severity"` (group aria-label).

Chip text is `{count} {level}` from contract values, so no new i18n per level.

## Rules
- Counts and filter cover one run only. Two expanded runs filter independently.
- Dismissed and accepted findings are counted like any other: they are in the list.
- A run with 0 findings renders no chips. The existing empty state stays.

## Acceptance criteria
- An expanded run shows one `Chip` per severity level that has findings, e.g. `1 CRITICAL`,
  `3 WARNING`, `1 SUGGESTION`. It looks the same as the PR-list status chips.
- Each number equals the count of that level in the run's list. This holds with Hide low
  confidence on as well as off.
- Clicking a level leaves only that level's findings in the list. The chip shows `Chip`'s active state.
- Clicking the active chip again brings back the full list.
- Filter and Hide low confidence combine: the list shows findings that pass both (mockup 1).
- The header `blockers` count does not change when the filter changes.
- No changes under `src/vendor/ui`. `pnpm test` and `pnpm typecheck` pass in `client/`.

## Tests
- `helpers.test.ts` (new):
  - `countBySeverity` returns zeros for missing levels and has no `INFO` key.
  - `visibleFindings` with `severity` set, combined with `hideLow`, keeps the sort order.
- `FindingsPanel.test.tsx` (extend, same `renderWithIntl` + mocked `useFindingAction` pattern).
  Use a fixture with 1 CRITICAL, 3 WARNING (one of them with confidence < 0.65) and 0 SUGGESTION.
  Find chips with `getByRole("button", { name: /3 WARNING/ })`:
  - It renders `1 CRITICAL` and `3 WARNING`, and no SUGGESTION chip.
  - Clicking `3 WARNING` leaves 3 cards, all WARNING.
  - Clicking it again brings back all 4 cards.
  - Hide low confidence on: the chip reads `2 WARNING`, and with the filter active the list shows 2 cards.
