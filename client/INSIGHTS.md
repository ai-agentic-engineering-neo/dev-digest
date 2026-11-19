# client — INSIGHTS

Append-only log of non-obvious things learned. Read before working, write only what is new.
Entry: `YYYY-MM-DD — claim — why / what to do (`path` · `symbol`)`. No line numbers.

## What Works
<!-- Approaches that succeeded after alternatives were weighed or tried. -->

## What Doesn't Work
<!-- Dead ends and antipatterns, with the reason. Most valuable section. -->

## Codebase Patterns
<!-- Conventions and architecture decisions not obvious from a single file. -->

- 2026-11-19 — Per-run finding filters live in `FindingsPanel` (state + `visibleFindings` in `helpers.ts`), not in `ReviewRunAccordion`; accept/dismiss invalidates `["reviews", prId]`, so counts derived via `useMemo` from the `findings` prop stay in sync with no extra wiring (`FindingsPanel/helpers.ts` · `countBySeverity`).

- 2026-11-19 — `src/vendor/shared` has drifted from `server/src/vendor/shared` — diff both before editing contracts.
- 2026-11-19 — `/onboarding` route is only "add repo"; the real Onboarding generator is milestone M5.
- 2026-11-19 — Run-trace drawer strings use next-intl namespace `runs` (`messages/en/runs.json`), while the PR list, timeline and verdict banner use `prReview` — check `useTranslations(...)` in the component before adding a key (`RunTraceDrawer/_components/TraceBody`).

- 2026-11-19 — The brief says the PR-list findings icons/popover and Timeline severity icons already exist, but this branch has neither (`RunHistory.tsx` printed only "N finding(s)"); `RunSummary` carries totals only, so per-severity data must come from `ReviewRecord.findings` matched by `run_id` (`FindingsTab` · `findingsByRun`, `RunHistory/RunFindingsHover.tsx`).

## Tool & Library Notes
<!-- Dependency / CLI quirks, versions. -->

- 2026-11-19 — `pnpm test` / `pnpm typecheck` can fail with `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` (pnpm ignores the `pnpm` field in `package.json`; env `npm_config_verify_deps_before_run=false` does not help) — run `./node_modules/.bin/vitest run` and `./node_modules/.bin/tsc --noEmit` directly, with node on PATH (nvm node is not on the agent shell PATH) (`client/package.json`).

## Recurring Errors & Fixes
<!-- `exact error text` — cause — fix. -->

## Session Notes
<!-- ### YYYY-MM-DD — task, then 1–3 bullets of what was added. -->

### 2026-11-19 — Severity counters + filter in FindingsPanel
- Added the pnpm verify-deps / PATH workaround for running client tests.
- Added where per-run filters live and that Timeline/PR-list findings hovers are not pre-built.

### 2026-11-19 — Run Cost Badge UI
- Added the `runs` vs `prReview` i18n namespace split (the drawer COST label lives in `runs.json`).

## Open Questions
<!-- - [ ] YYYY-MM-DD — question — look at: … -->
