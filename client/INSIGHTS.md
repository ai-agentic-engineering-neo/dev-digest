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

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-11-21 — M1 run cost (client: RunCostBadge in PR list, timeline, trace drawer, verdict banner): done, 68 tests green; see "Keep shared src/components free of their own i18n namespace"

## Open Questions
