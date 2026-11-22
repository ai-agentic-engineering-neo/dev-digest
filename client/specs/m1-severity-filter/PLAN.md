# M1 · Severity counters & filter — implementation plan

Spec: [SPEC.md](SPEC.md). Client only. All work is in
`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/` plus one
messages file. Each task ends with `pnpm typecheck` and `pnpm test` passing in
`client/`.

Before starting, read `client/CLAUDE.md` and `client/INSIGHTS.md`.
Branch: `homework-01/severity-counters`.

## Task 1 — Pure helpers (`helpers.ts`, `constants.ts`)

- `constants.ts`: add
  `SEVERITY_LEVELS: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"]`
  (type from `@devdigest/shared`). Leave `SEVERITY_ORDER` as it is (it keeps
  `INFO` for sorting).
- `helpers.ts`:
  - `applyConfidence(findings, hideLow)`: the existing confidence filter,
    extracted so counts and list share it.
  - `countBySeverity(findings): Record<Severity, number>`: all 3 keys, zeros
    included. Callers pass the confidence-filtered list.
  - `visibleFindings(findings, hideLow, severity: Severity | null = null)`:
    confidence filter → severity filter → sort. The default keeps the current
    call compatible.
  - `visibleLevels(counts, active): Severity[]`: the levels of
    `SEVERITY_LEVELS` where `count > 0 || lvl === active`, in that order
    (SPEC §3 zero rule).
- New `helpers.test.ts`:
  - `countBySeverity` on a mixed list (dismissed included), on an empty list,
    and with an unknown severity value, which is not counted;
  - `visibleFindings` with severity only, hideLow only, both, and null;
  - `visibleLevels` hides zeros, keeps an active zero, keeps the fixed order.

## Task 2 — i18n

- `messages/en/prReview.json` → `panel.severity`: `groupLabel`, `CRITICAL`,
  `WARNING`, `SUGGESTION`, exactly as in SPEC §4.3. The keys equal the enum
  values. No ICU plural.

## Task 3 — `SeverityCounters` (same folder)

- New `FindingsPanel/SeverityCounters.tsx`. It goes inside the `FindingsPanel`
  folder, so `FindingsPanel.test.tsx` covers it and no new `_components`
  folder is needed.
  - Props: `counts: Record<Severity, number>`, `active: Severity | null`,
    `onToggle(lvl: Severity)`.
  - Renders `null` when `visibleLevels(counts, active)` is empty.
  - Markup: `<div role="group" aria-label={t("panel.severity.groupLabel")}>`
    with one `<button type="button" aria-pressed={lvl === active}>` per
    visible level.
  - Button text: `t(\`panel.severity.${lvl}\`, { count })`, no icon.
  - Uses `useTranslations("prReview")`, the same namespace as the panel, so
    the existing test provider is enough.
- `styles.ts`:
  - `severityGroup`: flex, gap 8, wrap.
  - `severityChip(lvl, active)`: a function that returns the chip style.
    - Base: pill (`borderRadius: 999`), padding `4px 12px`, font 12, weight
      600, `letterSpacing: "0.04em"`, `tnum`, cursor pointer.
    - Inactive: `border: 1px solid SEV[lvl].c`, `color: SEV[lvl].c`,
      `background: transparent`.
    - Active: `background` and `borderColor` = `SEV[lvl].c`,
      `color: var(--bg-primary)`.
  - Only CSS variables from `SEV` and `--bg-primary`, no hard-coded colors.
  - No hover-only state.

## Task 4 — Wire into `FindingsPanel.tsx`

- State: `const [severity, setSeverity] = useState<Severity | null>(null)`.
- Memos, all keyed on `findings`, so a refetch after accept or dismiss
  recomputes them:
  - `base = applyConfidence(findings, hideLow)`
  - `counts = countBySeverity(base)`
  - `shown = visibleFindings(findings, hideLow, severity)`
- `onToggle = (lvl) => setSeverity((cur) => (cur === lvl ? null : lvl))`.
- Toolbar: `<SeverityCounters …/>` on the left and the Hide low confidence
  group on the right. Set `s.toolbar` to `justifyContent: "space-between"`,
  `alignItems: "center"`, and put a spacer before the toggle so it stays
  right-aligned when no chips render.
- Reset `focusIdx` to 0 when `severity` or `hideLow` changes (SPEC §3,
  Keyboard focus).
- The existing empty state (`panel.noMatchTitle` / `noMatchBody`) covers B7
  and B11.

## Task 5 — Component tests (`FindingsPanel.test.tsx`)

Follow the existing pattern: `vi.mock` of `useFindingAction`, and
`NextIntlClientProvider` with `prReview.json`. Add a fixture builder
`mk(id, severity, { confidence = 0.9, dismissed = false })`. Use
`@testing-library/user-event` if it's installed, otherwise `fireEvent`.

The cases (scenario ids from SPEC §4.2):

- B1: a mixed run renders `1 CRITICAL`, `3 WARNING`, `1 SUGGESTION` in that
  DOM order. A dismissed finding is included in the count.
- B5: a level with 0 findings has no button.
- B2: click WARNING → only WARNING titles are in the list, and the button has
  `aria-pressed="true"`.
- B3: click WARNING again → all titles are back, `aria-pressed="false"`.
- B4: click WARNING, then CRITICAL → only CRITICAL is pressed.
- B6: turn Hide low on → the counts drop by the low-confidence findings.
- B7: CRITICAL active, then Hide low makes it 0 → `0 CRITICAL` is still
  visible and pressed, and the empty state shows.
- B8: click `0 CRITICAL` → the filter is off and the chip is gone.
- B9: an inactive level that drops to 0 is not rendered.
- B10 / P3-14: `rerender` with the same findings where one has `dismissed_at`
  set → the counts are unchanged and still equal the cards. Then `rerender`
  with one finding fewer → its count drops. Together this covers "counts follow
  the refetched `findings`".
- B11: an empty run → no group with role `group`, and the empty state shows
  (keep the existing test).
- No-network check: the panel adds no hook other than the mocked
  `useFindingAction`, so a render that needs no `QueryClient` proves it.

## Task 6 — Verification & wrap-up

- `cd client && pnpm typecheck && pnpm test`.
- Manual check with `./scripts/dev.sh`:
  - open a PR with findings → Agent runs → expand a run;
  - compare the chips with the reference screenshots (layout, order,
    outline/fill);
  - check B1–B11 by hand, in both the dark and the light theme;
  - the Network tab shows no new requests on a chip click.
- Run the `engineering-insights` wrap-up for `client`. Candidates:
  - `SEV` has an extra `INFO` level compared with the contract;
  - `SeverityBadge` has no inactive/active pair;
  - there is no text-on-color token, so filled chips use `--bg-primary`.

## Size & risk

| Task | Size | Risk |
|---|---|---|
| 1 helpers | S | counts and list use different confidence logic → numbers ≠ cards; fixed by the shared `applyConfidence` |
| 2 i18n | S | a key that doesn't match the enum values → the raw key is shown |
| 3 chips | S | iterating `SEV` instead of `SEVERITY_LEVELS` → an `INFO` chip; filled text contrast in the light theme |
| 4 wiring | S | stale `focusIdx` after filtering → a/d acts on nothing; toggle drifts left when no chips render |
| 5 tests | S | `user-event` may be missing → use `fireEvent` |
| 6 verify | S | — |
