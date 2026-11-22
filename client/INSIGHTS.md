# Insights

Lessons learned in this package: traps, non-obvious behaviour, approaches that
failed and why. Read before changing non-trivial code here. Maintained by the
`engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`).
Append-only: newest at the bottom of each section. Corrections go in as
`> **Superseded YYYY-MM-DD:** …`, never as deletions.

Entry format (Session Notes and Open Questions are `- YYYY-MM-DD — …` one-liners):

```
### YYYY-MM-DD — short imperative title
**Insight:** symptom + root cause — what is non-obvious
**Rule:** ALWAYS/NEVER <action> — because <reason>
**Evidence:** path/to/file.ts → symbolName() | test name | command
```

Only add an entry if it is non-obvious from reading the code, specific, and
actionable cold.

---

## What Works

## What Doesn't Work

### 2026-11-21 — toFixed after 2-significant-digit rounding pads the design's USD values
**Insight:** Rounding a cost to 2 significant digits and printing with `toFixed(decimals)` yields `$0.060` for 0.06, while the design shows `$0.06` (and `$0.0013`, `$0.014`); `0.0999` also carries into `$0.10`.
**Rule:** ALWAYS format run cost only through `formatUsd()` in `client/src/lib/format.ts` (`toPrecision(2)` then trim zeros past the 2nd decimal) — because ad-hoc `toFixed` breaks the agreed table in `docs/specs/m1-run-cost/SPEC.md` §5.1.
**Evidence:** `client/src/lib/format.ts` → `formatUsd()`; test `src/lib/format.test.ts` "0.06 → $0.06"

## Codebase Patterns

### 2026-11-21 — Keep shared src/components free of their own i18n namespace
**Insight:** Each component test mounts `NextIntlClientProvider` with only its feature's namespace (`RunHistory` and `VerdictBanner` → `prReview`, `RunTraceDrawer` → `runs`), so a shared child calling `useTranslations("x")` breaks every parent test that doesn't load `x`.
**Rule:** ALWAYS make components in `client/src/components/*` emit no words (or take strings as props) and put labels in the parent's namespace — because the shared `RunCostBadge` renders inside four features with different namespaces.
**Evidence:** `client/src/components/run-cost-badge/RunCostBadge.tsx` → `RunCostBadge`; `RunHistory.test.tsx` → `renderRuns()`; key `prReview.timeline.tokens`

### 2026-11-22 — Iterate severity levels from the contract, not from SEV
**Insight:** `SEV` in `@devdigest/ui` (`vendor/ui/primitives/tokens.ts`) has 4 keys incl. `INFO`, and `SEVERITY_ORDER` keeps `INFO` too, but the Zod `Severity` contract has only CRITICAL/WARNING/SUGGESTION — `Object.keys(SEV)` renders a phantom "INFO" level.
**Rule:** ALWAYS loop over `SEVERITY_LEVELS` and use `SEV[lvl]` only as a color lookup — because the contract, not the palette, defines which levels exist.
**Evidence:** `FindingsPanel/constants.ts` → `SEVERITY_LEVELS`; `FindingsPanel/helpers.ts` → `countBySeverity()`, `visibleLevels()`

### 2026-11-22 — Use var(--bg-primary) as text on a SEV-filled surface
**Insight:** The design system has no text-on-color token; `Button` primary hard-codes `#fff`, which `client/CLAUDE.md` forbids in components. The user chose `var(--bg-primary)` (dark in dark theme, white in light) for the filled active severity chip.
**Rule:** ALWAYS put `var(--bg-primary)` as text color on a background of `SEV[lvl].c` — because it is a theme token and was the agreed choice over `#fff`.
**Evidence:** `FindingsPanel/styles.ts` → `severityChip()`; `client/specs/m1-severity-filter/SPEC.md` §3 Look

## Tool & Library Notes

### 2026-11-22 — @testing-library/user-event is not installed in client
**Insight:** `client/package.json` has `@testing-library/react` and `jest-dom` only; importing `user-event` fails.
**Rule:** ALWAYS use `fireEvent` from `@testing-library/react` for clicks in client tests — because adding a dev dependency for it is out of scope for feature work.
**Evidence:** `FindingsPanel/FindingsPanel.test.tsx` → `toggleHideLow()`, `chip()`

### 2026-11-22 — pnpm 12 refuses client scripts with ERR_PNPM_VERIFY_DEPS_BEFORE_RUN
**Insight:** pnpm ≥11 no longer reads the `pnpm.overrides` field of `client/package.json`, so its pre-run deps check fails and `pnpm test` / `pnpm typecheck` / `pnpm dev` exit before running; a piped `| tail` hides the non-zero exit.
**Rule:** ALWAYS use pnpm 10 (`npm i -g pnpm@10`), or set `pnpm_config_verify_deps_before_run=false` for a one-off run, and NEVER run `pnpm install` under pnpm 12 here — because it would drop the overrides from the lockfile.
**Evidence:** `client/package.json` → `pnpm.overrides`; command `pnpm_config_verify_deps_before_run=false pnpm typecheck`

## Recurring Errors & Fixes

### 2026-11-22 — "borderColor … conflicting borderLeftColor" warning in FindingsPanel tests is pre-existing
**Insight:** React warns "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" whenever a card's `focused` flips; the cause is `FindingCard/styles.ts` mixing `borderColor` with `borderLeftColor`, not the panel or its filters.
**Rule:** NEVER chase this warning in FindingsPanel changes — because it comes from FindingCard, which the severity-filter spec leaves untouched; fix it only in a FindingCard task (split `borderColor` into per-side colors).
**Evidence:** `FindingCard/styles.ts` → card style (`borderColor`, `borderLeftColor`); test `FindingsPanel severity counters` stderr

## Session Notes

- 2026-11-21 — M1 run cost (client: RunCostBadge in PR list, timeline, trace drawer, verdict banner): done, 68 tests green; see "Keep shared src/components free of their own i18n namespace"

- 2026-11-22 — M1 severity counters & filter (client: FindingsPanel chips + filter, 21 panel/helper tests, 87 client tests green): done; see "Iterate severity levels from the contract, not from SEV"

## Open Questions
