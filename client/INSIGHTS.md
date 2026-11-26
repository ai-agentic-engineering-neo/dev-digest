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

- 2026-11-19 — Findings hover is a shared component rendered in a portal with fixed position (the PR list `tableCard` is `overflow: hidden` and would clip an absolutely-positioned popover); PR list data comes from `PrMeta.findings` (also changed in `server/`) (`pulls/_components/FindingsHover`).

- 2026-11-23 — `SkillEditorModal` now lives in `src/components/skill-editor-modal/` (used by Skills and Conventions) and takes `initial/source/evidenceFiles/submitLabel/banner`; it sends `enabled` only when toggled off because `SkillEditorModal.test.tsx` pins the exact create payload.
- 2026-11-23 — The `@devdigest/ui` `Icon` map has no `Pencil`; use `Edit` (alias) or `tsc` fails with TS2322 on `icon=` (`vendor/ui/icons.tsx`).

- 2026-11-23 — Skill Config/Preview/Versioning live in the right-hand `SkillPanel` on `/skills`, NOT a `/skills/:id` page (deliberately removed): the panel is re-keyed per skill (`key={selected.id}`) so tab and form state reset on selection (`app/skills/_components/SkillsView/_components/SkillPanel`).

- 2026-11-26 — `ConfigTab` resets its form by remounting on `key={skill.version}`, not by a prop-sync effect (which wiped drafts when the card toggle refetched the list); name/description/type edits made elsewhere don't bump the version, so an open form won't follow them (`SkillPanel/_components/ConfigTab`).

## Tool & Library Notes
<!-- Dependency / CLI quirks, versions. -->

- 2026-11-19 — `pnpm test` / `pnpm typecheck` can fail with `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` (pnpm ignores the `pnpm` field in `package.json`; env `npm_config_verify_deps_before_run=false` does not help) — run `./node_modules/.bin/vitest run` and `./node_modules/.bin/tsc --noEmit` directly, with node on PATH (nvm node is not on the agent shell PATH) (`client/package.json`).

- 2026-11-23 — In tests `FormField` labels are not linked to inputs (find by placeholder/display value, not `getByLabelText`) and `Toggle` is `role="switch"` with no accessible name; native DnD works under jsdom with `fireEvent.dragStart/dragOver/drop` if code uses `e.dataTransfer?.` (`SkillsTab`, `SkillCard`).
- 2026-11-23 — `@devdigest/ui` `Tabs` renders plain `<button>`s (no `role="tab"`) and draws its own bottom border: query tabs with `getByRole("button")` and don't add a second border around it (`vendor/ui/kit/Tabs.tsx`).

## Recurring Errors & Fixes
<!-- `exact error text` — cause — fix. -->
- 2026-11-23 — `tsc` reports `.next/types/validator.ts: TS2344 '"/skills/[id]"' does not satisfy the constraint 'AppRoutes'` right after adding a route while `next dev` runs — cause: generated route types lag behind — fix: wait a few seconds and re-run `tsc --noEmit`; after DELETING a route, `next dev` keeps `.next/types/app/<route>/page.ts` and tsc fails with TS2307 — remove that generated folder.

## Session Notes
<!-- ### YYYY-MM-DD — task, then 1–3 bullets of what was added. -->

### 2026-11-19 — Severity counters + filter in FindingsPanel
- Added the pnpm verify-deps / PATH workaround for running client tests.
- Added where per-run filters live and that Timeline/PR-list findings hovers are not pre-built.

### 2026-11-19 — Run Cost Badge UI
- Added the `runs` vs `prReview` i18n namespace split (the drawer COST label lives in `runs.json`).

### 2026-11-23 — Skills UI (M2)
- Added test quirks for FormField/Toggle and jsdom drag-and-drop; the RunTraceDrawer "Prompt assembly" section is collapsed by default, so click it before asserting token counts.

### 2026-11-23 — Conventions page
- Added the SkillEditorModal move/extension and the `Edit` icon name.

### 2026-11-23 — Skill page `/skills/:id`
- Added `Tabs` test/markup quirk and the stale `.next/types` tsc error.

### 2026-11-23 — Skill tabs moved into the side panel
- Removed `/skills/:id`; noted the re-key behaviour and the stale generated route types after deleting a route.

### 2026-11-26 — ConfigTab prop-sync fix
- Added how the form resets and what it deliberately does not follow.

## Open Questions
<!-- - [ ] YYYY-MM-DD — question — look at: … -->
