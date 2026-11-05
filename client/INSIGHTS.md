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
- 2026-11-05 — Closing a hover popover on the trigger's `onMouseLeave` breaks it even when the popover is a DOM child: the 6px gap between cell and popover leaves both, so it vanished before the cursor reached it (DevDigest flagged it, but blamed "not a descendant" — wrong cause) → close after a short delay (`CLOSE_DELAY_MS` 150) that `mouseenter` cancels; blur/Escape close immediately; also cap `maxHeight` to the space in the chosen direction (src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx:59 → scheduleClose; helpers.ts:24 → placePopover).

## Codebase Patterns
<!-- Conventions and architecture decisions, with the reason -->
- 2026-11-04 — `Severity` in `src/vendor/ui/primitives/tokens.ts` includes `INFO`, but the Zod contract (`@devdigest/shared` findings) has only CRITICAL/WARNING/SUGGESTION → don't assume UI tokens match the contract (src/vendor/ui/primitives/tokens.ts:3 → Severity).
- 2026-11-04 — `RepoIntelState` in `src/lib/hooks/repo-intel.ts` is a deliberate local type (repo-intel types aren't in shared) → check it against server `modules/repo-intel/types.ts` when the index-state route changes (src/lib/hooks/repo-intel.ts:14 → RepoIntelState).
- 2026-11-04 — SSE uses `new EventSource(API_BASE + '/runs/:id/events')` in `hooks/reviews.ts` — the one sanctioned bypass of `api.ts` (fetch wrapper can't stream SSE) (src/lib/hooks/reviews.ts:181 → new EventSource).
- 2026-11-04 — `Gallery` (`src/components/showcase/Showcase.tsx`) is rendered by `src/test/smoke.test.tsx` with NO `NextIntlClientProvider` → components added to `/showcase` must not call `useTranslations`; take translated strings as props (src/test/smoke.test.tsx:4 → Gallery; example: src/components/run-cost-badge/RunCostBadge.tsx:21 → RunCostBadge `tokenUnit`).
- 2026-11-05 — The PR-list table card has `overflow: hidden` (rounded corners), so an absolutely positioned popover inside a row is clipped on the last rows → render it `position: fixed` from the trigger's `getBoundingClientRect()` and flip upward near the viewport bottom (src/app/repos/[repoId]/pulls/styles.ts:86 → s.tableCard; src/app/repos/[repoId]/pulls/_components/FindingsCell/helpers.ts:20 → placePopover).
- 2026-11-05 — Kit `Checkbox` is a `<button role="checkbox">` inside a `<label>` and `Toggle` is a `role="switch"` button with NO label prop → in RTL query `getByRole('checkbox')` scoped `within(row)` / `getByRole('switch')`; give a Toggle an accessible hint via a wrapping `title` (src/vendor/ui/kit/Checkbox.tsx → Checkbox; src/app/skills/_components/SkillsListView/_components/SkillCard/SkillCard.tsx:49 → Toggle).
- 2026-11-05 — Agent-card skill counts use `useQueries` with the SAME key `["agent-skills", id]` as the Skills tab, so linking in the tab updates the cards for free → invalidate exactly that key after any link change (src/lib/hooks/skills.ts:98 → useAgentSkillCounts).
- 2026-11-05 — `/pr-self-review` blocks ANY edit in `src/vendor/shared/**` as a non-waivable critical (its "approve it yourself" hint doesn't unblock) → API types missing from `@devdigest/shared` go into `src/lib/types.ts` as local mirrors of the server module type (src/lib/types.ts:67 → SkillImportPreview; mirrors server/src/modules/skills/domain.ts).
- 2026-11-05 — Master-detail pages keep selection + tab in the URL (`/skills?id&tab`, `?new=1`) and wrap the page in `<Suspense>` (useSearchParams on a static route); unsaved Config edits are tracked in a ref and guarded with `window.confirm` on navigation (src/app/skills/_components/SkillsLab/SkillsLab.tsx).
- 2026-11-05 — Every `Toggle` needs an accessible name: pass `label` (→ aria-label) when there is no visible <label>; every mutate from a toggle needs `onError` → toast (src/vendor/ui/primitives/Toggle.tsx).
- 2026-11-05 — CORRECTION of 2026-11-05 Toggle entry: `MutationCache.onError` in providers already toasts EVERY failed mutation, so a call-site `onError` toast showed two identical toasts → a hook whose callers all show their own contextual error sets `meta: OWN_ERROR_TOAST` (global toast skipped); without it, don't add a call-site toast (src/lib/providers.tsx:39 → mutationCache onError; src/lib/error-message.ts:13 → OWN_ERROR_TOAST).

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — On this Windows box `pnpm typecheck`/`pnpm test` fail with "Access is denied" (pnpm 12 shim) → run the bins directly: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, `node node_modules/vitest/vitest.mjs run` (same in server/) (package.json:10 → scripts.typecheck).
- 2026-11-05 — next-intl `t.rich`: a tag name must not equal a value name (`<repo>{repo}</repo>` collides) — use `<r>{repo}</r>` (messages/en/conventions.json → modal.banner).
- 2026-11-05 — Categorical chart colors live in `--viz-1..6` (styles.css, dark + light steps, validated with the dataviz validator); never reuse status colors (`--crit/--warn/--ok`) for series. `Donut` gained `formatValue` (counts instead of $) and `gap` (src/vendor/ui/charts/Donut.tsx).
- 2026-11-05 — `/pr-self-review` caches findings per file+skill content, so fixing a hook does NOT clear findings cached on its unchanged caller files (`OWN_ERROR_TOAST` highs stayed on the modals after the hooks were fixed); also any `client/INSIGHTS.md` edit invalidates every client pair (~10 agents) → verify such findings against the hook, clear them with `--no-cache`, and finish INSIGHTS edits before the final review (.claude/skills/pr-self-review/scripts/collect-diff.mjs → cache lookup).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->
- 2026-11-04 — New UI missing on an already-open PR page although `next dev` had recompiled (`grep countBySeverity .next/static/chunks/app/repos/[repoId]/pulls/[number]/page.js` found it): Fast Refresh didn't patch the stale tab → hard-reload (Ctrl+Shift+R) before debugging code; grep the compiled chunk to tell "not built" from "not reloaded" (src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:26 → countBySeverity).
- 2026-11-05 — `messages/en/prReview.json` repeats key names across namespaces (`filesCount` in `smartDiff` AND `list`; `findings` in `runStatus`, `list.columns`, `list`), so a text edit anchored on a key (first match) put a block into `smartDiff` and the test failed with `MISSING_MESSAGE prReview.list.findings.chip` → anchor on the namespace's unique neighbour key and verify with `node -e "console.log(require('./messages/en/prReview.json').list.findings)"` (messages/en/prReview.json:61, :107 → filesCount).
- 2026-11-05 — Modals rendered at the top of a view come BEFORE the page in the DOM, so `getAllByRole(...)[last]` picks the page button; scope with `within(getByRole("dialog"))` (ConventionsView.test.tsx).
- 2026-11-05 — Skills Lab Config: after Save the editor diffs the form against the `skill` prop taken from the `["skills"]` list cache; with only `invalidateQueries` that prop stays stale until the refetch, so Save re-enabled and a second click stored a duplicate version → in mutations whose result an editor diffs against, `setQueryData` the returned entity BEFORE invalidating (src/lib/hooks/skills.ts:89 → useUpdateSkill onSuccess).
- 2026-11-05 — Skills Lab picks the selected skill as `all.find(id) ?? all[0]` from the `["skills"]` cache, so ANY mutation that adds/removes a skill and then navigates to `?id=` showed a different skill (or kept a deleted one) until the refetch — hit twice (delete, then create/import) → every create/import/delete hook updates `["skills"]` with `setQueryData` before invalidating (src/app/skills/_components/SkillsLab/SkillsLab.tsx:48 → selected; src/lib/hooks/skills.ts:14 → addToSkillList).

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Shipped Run Cost Badge UI (PR-list COST column, timeline tokens·cost, trace COST tile) → specs/run-cost-badge.md.
- 2026-11-04 — Fixed DevDigest review finding on PR #1: RunTraceDrawer tests no longer mutate the shared TRACE fixture.
- 2026-11-04 — Severity counters/filter on the PR page via plan mode → spec → impl → tests → manual check on demo PR #5 → specs/severity-counters.md.
- 2026-11-05 — Mentor follow-ups: PR-list FINDINGS column + "Findings in this run" popover, Timeline severity icons, zero severity levels hidden → specs/pr-list-findings.md.
- 2026-11-05 — Skills UI: `/skills` (cards, preview drawer, create/edit, .md/.zip import preview→confirm), agent Skills tab (link/order/drag), Skills Lab nav, trace skills token estimate → specs/skills.md.
- 2026-11-05 — pr-self-review BLOCK fix: `SkillImportPreview`/`SkillImportFile` moved from vendor/shared to `src/lib/types.ts`.
- 2026-11-05 — Conventions page (`/repos/:repoId/conventions`: cards with verified evidence, accept/reject/inline edit, Accept/Deselect all) + "Create skill from conventions" modal with optional agent attach → specs/conventions.md.
- 2026-11-05 — Skills Lab v2 UI: master-detail `/skills` (cards with source + "agents · pull · accept"), tabs Config (line-numbered editor, note, discard/save, create mode) · Preview · Evals placeholder · Stats (tiles, agents, category donut) · Versions (diff, restore) → specs/skills.md.
- 2026-11-05 — pr-self-review follow-ups: useCreateSkill/useImportSkill write the new skill into `["skills"]` before invalidating (+ hook tests).

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — `SeverityBadge` labels ("Critical", "Warning", …) come from the hard-coded English `SEV` map in `src/vendor/ui/primitives/tokens.ts`, not next-intl → severity counters/badges won't translate; decide whether `SeverityBadge` should accept a `label` prop (src/vendor/ui/primitives/tokens.ts:6 → SEV).
