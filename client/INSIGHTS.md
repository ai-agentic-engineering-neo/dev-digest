# client — insights

Non-obvious lessons learned while working in `client/`. Maintained by the `engineering-insights` skill.
Append-only: new lines go at the end of their section; corrections are new dated entries.
Format: `- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path:line → symbol)`.
Add an entry only if forgetting it would make an agent (or a human) repeat the mistake.

## What Works
<!-- Approaches that proved effective here -->
- 2026-11-04 — To vary data a `vi.mock`-ed hook returns per test, never mutate the module-level fixture (`TRACE.stats.cost_usd = …` / `delete …` made tests order-dependent; flagged by the General Reviewer) → hook reads a `let current = FIXTURE`, a test assigns a spread copy, `afterEach` resets it; verify with `vitest run --sequence.shuffle` (src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:24 → currentTrace).

## What Doesn't Work
<!-- Dead ends and antipatterns — the most valuable section -->

## Codebase Patterns
<!-- Conventions and architecture decisions, with the reason -->
- 2026-11-04 — `Severity` in `src/vendor/ui/primitives/tokens.ts` includes `INFO`, but the Zod contract (`@devdigest/shared` findings) has only CRITICAL/WARNING/SUGGESTION → don't assume UI tokens match the contract (src/vendor/ui/primitives/tokens.ts:3 → Severity).
- 2026-11-04 — `RepoIntelState` in `src/lib/hooks/repo-intel.ts` is a deliberate local type (repo-intel types aren't in shared) → check it against server `modules/repo-intel/types.ts` when the index-state route changes (src/lib/hooks/repo-intel.ts:14 → RepoIntelState).
- 2026-11-04 — SSE uses `new EventSource(API_BASE + '/runs/:id/events')` in `hooks/reviews.ts` — the one sanctioned bypass of `api.ts` (fetch wrapper can't stream SSE) (src/lib/hooks/reviews.ts:181 → new EventSource).
- 2026-11-04 — `Gallery` (`src/components/showcase/Showcase.tsx`) is rendered by `src/test/smoke.test.tsx` with NO `NextIntlClientProvider` → components added to `/showcase` must not call `useTranslations`; take translated strings as props (src/test/smoke.test.tsx:4 → Gallery; example: src/components/run-cost-badge/RunCostBadge.tsx:21 → RunCostBadge `tokenUnit`).
- 2026-11-05 — The PR-list table card has `overflow: hidden` (rounded corners), so an absolutely positioned popover inside a row is clipped on the last rows → render it `position: fixed` from the trigger's `getBoundingClientRect()` and flip upward near the viewport bottom (src/app/repos/[repoId]/pulls/styles.ts:86 → s.tableCard; src/app/repos/[repoId]/pulls/_components/FindingsCell/helpers.ts:20 → placePopover).

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — On this Windows box `pnpm typecheck`/`pnpm test` fail with "Access is denied" (pnpm 12 shim) → run the bins directly: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, `node node_modules/vitest/vitest.mjs run` (same in server/) (package.json:10 → scripts.typecheck).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->
- 2026-11-04 — New UI missing on an already-open PR page although `next dev` had recompiled (`grep countBySeverity .next/static/chunks/app/repos/[repoId]/pulls/[number]/page.js` found it): Fast Refresh didn't patch the stale tab → hard-reload (Ctrl+Shift+R) before debugging code; grep the compiled chunk to tell "not built" from "not reloaded" (src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:26 → countBySeverity).
- 2026-11-05 — `messages/en/prReview.json` repeats key names across namespaces (`filesCount` in `smartDiff` AND `list`; `findings` in `runStatus`, `list.columns`, `list`), so a text edit anchored on a key (first match) put a block into `smartDiff` and the test failed with `MISSING_MESSAGE prReview.list.findings.chip` → anchor on the namespace's unique neighbour key and verify with `node -e "console.log(require('./messages/en/prReview.json').list.findings)"` (messages/en/prReview.json:61, :107 → filesCount).

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Shipped Run Cost Badge UI (PR-list COST column, timeline tokens·cost, trace COST tile) → specs/run-cost-badge.md.
- 2026-11-04 — Fixed DevDigest review finding on PR #1: RunTraceDrawer tests no longer mutate the shared TRACE fixture.
- 2026-11-04 — Severity counters/filter on the PR page via plan mode → spec → impl → tests → manual check on demo PR #5 → specs/severity-counters.md.
- 2026-11-05 — Mentor follow-ups: PR-list FINDINGS column + "Findings in this run" popover, Timeline severity icons, zero severity levels hidden → specs/pr-list-findings.md.

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — `SeverityBadge` labels ("Critical", "Warning", …) come from the hard-coded English `SEV` map in `src/vendor/ui/primitives/tokens.ts`, not next-intl → severity counters/badges won't translate; decide whether `SeverityBadge` should accept a `label` prop (src/vendor/ui/primitives/tokens.ts:6 → SEV).
