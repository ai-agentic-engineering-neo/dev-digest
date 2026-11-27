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

### 2026-11-26 — Test optimistic rollback with a never-resolving refetch
**Insight:** After an optimistic mutation fails, `onSettled` refetches and restores server state, so a rollback test passes even if `onError` restores nothing.
**Rule:** ALWAYS make `api.get` after the first load return a never-resolving promise in rollback tests — because otherwise the refetch masks a broken `onError`.
**Evidence:** `AgentEditor/_components/SkillsTab/SkillsTab.test.tsx` → "rolls back the optimistic attach…" | `client/src/lib/hooks/agents.ts` → `useSetAgentSkills()`

## What Doesn't Work

### 2026-11-21 — toFixed after 2-significant-digit rounding pads the design's USD values
**Insight:** Rounding a cost to 2 significant digits and printing with `toFixed(decimals)` yields `$0.060` for 0.06, while the design shows `$0.06` (and `$0.0013`, `$0.014`); `0.0999` also carries into `$0.10`.
**Rule:** ALWAYS format run cost only through `formatUsd()` in `client/src/lib/format.ts` (`toPrecision(2)` then trim zeros past the 2nd decimal) — because ad-hoc `toFixed` breaks the agreed table in `docs/specs/m1-run-cost/SPEC.md` §5.1.
**Evidence:** `client/src/lib/format.ts` → `formatUsd()`; test `src/lib/format.test.ts` "0.06 → $0.06"

### 2026-11-25 — Awaiting mutateAsync in a click handler without catch
**Insight:** `CreateAgentModal.submit` awaited `create.mutateAsync` with no `catch`, so a failed create raised an unhandled promise rejection (vitest fails the run on it) even though the global `MutationCache` toast already reports the error.
**Rule:** ALWAYS wrap `await mutation.mutateAsync(...)` in event handlers with `try/catch` and return early — because the error is shown by `lib/providers.tsx` and the rejection otherwise escapes.
**Evidence:** `CreateAgentModal.tsx` → `submit` | test `CreateAgentModal.test.tsx` "does not navigate when creation fails"

### 2026-11-26 — Per-query retry overrides on hooks
**Insight:** Adding `retry: (n, e) => …` to `useSkill` (skip retry on 404) overrode the test QueryClient's `retry: false`, so the 500 case waited a real ~1 s backoff and `SkillDetail.test.tsx` "load error with retry" timed out.
**Rule:** NEVER set `retry` on an individual hook — because it beats the test client's default and makes error-state tests slow/flaky; change retry policy centrally in `lib/providers.tsx` if needed.
**Evidence:** `client/src/lib/hooks/skills.ts` → `useSkill()` | test `SkillDetail > shows a load error with retry for other failures`

### 2026-11-26 — A plain-object route in mockFetch cannot fail
**Insight:** In `app/skills/_components/test-utils.tsx` `mockFetch`, a route given as an object is sent as the BODY with status 200; `{ status: 409, body: … }` therefore "succeeds" and the component receives `{status, body}` as data (here: `name` undefined → crash in `isValidSkillName`).
**Rule:** ALWAYS give error (and non-200) routes as functions: `"POST /x": () => ({ status: 409, body: {...} })` — because only the function form is read for `status`.
**Evidence:** `client/src/app/skills/_components/test-utils.tsx` → `mockFetch()` | `CreateSkillFromConventionsModal.test.tsx` "on 409 says the name is taken"

### 2026-11-26 — Invalidating the suggestions list after each link empties the open dialog
**Insight:** `useLinkAgentSkill` first invalidated `queryKeys.agentSuggestions(skillId)` normally; the active dialog refetched after every successful POST and the server (which excludes already-linked agents) returned a shorter list, so on a partial failure the "Linked" rows vanished. The RTL test missed it because a plain-object `mockFetch` route returns the same list forever.
**Rule:** ALWAYS invalidate a list that an open dialog iterates with `refetchType: "none"` and mock it as a stateful function that drops linked items like the server — because a normal invalidate refetches active observers at once and a static mock cannot reveal it.
**Evidence:** `client/src/lib/hooks/agents.ts` → `useLinkAgentSkill()` | test `AgentSuggestionsDialog.test.tsx` "a failed link keeps the dialog…" (fails without `refetchType: "none"`)

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

### 2026-11-25 — Use the @/ alias in new imports despite existing ../../../ chains
**Insight:** About 30 files under `client/src` import shared code via `../../../`+ chains although `tsconfig.json` maps `@/*` → `./src/*`; copying a neighbour's import spreads the debt.
**Rule:** ALWAYS write `@/lib/...` for imports leaving the component folder and import hooks from the domain file (`@/lib/hooks/agents`), not the `export *` barrel `src/lib/hooks/index.ts` — because deep chains break on moves and aggregate barrels invite cycles; fix chains only in files you touch.
**Evidence:** `src/app/agents/_components/AgentCard/AgentCard.tsx` → `useDeleteAgent` import | `grep -rlE 'from "(\.\./){3,}' client/src`

### 2026-11-25 — Client contract copy lacks openrouter and newer schemas
**Insight:** `client/src/vendor/shared` has drifted functionally from the server copy: `LLMProvider.id` and the `productionize.ts` provider enum lack `'openrouter'`, and `AgentVersionConfig`, `AgentManifest`, `CommitFile` are missing — while the UI already sends `provider: "openrouter"`.
**Rule:** ALWAYS run `diff -rq server/src/vendor/shared client/src/vendor/shared` after touching a contract and copy server → client — because typecheck passes on the stale copy, so drift is silent.
**Evidence:** `client/src/vendor/shared/adapters.ts` → `LLMProvider` | `SettingsModels.tsx` → `feature_models` | `docs/improvement-plan.md` P0-2

### 2026-11-25 — page.tsx is a server shell; the screen is a client *View
**Insight:** A `'use client'` page cannot export `metadata`, so every route now has a thin server `page.tsx` (`generateMetadata` from `messages/en/meta.json`) rendering one client `_components/<Name>View`; titles come from the URL only (no fetch).
**Rule:** ALWAYS add new routes as server `page.tsx` + client `<Name>View` and give them a `meta.json` title — because the root layout supplies the `%s · DevDigest` template and `noindex`, and a client page would silently drop both.
**Evidence:** `src/app/repos/[repoId]/pulls/[number]/page.tsx` → `generateMetadata` | `src/app/layout.tsx` → `generateMetadata`

### 2026-11-26 — Don't toast mutation errors in components
**Insight:** `lib/providers.tsx` `MutationCache.onError` already toasts every failed mutation; a per-caller `toast.error` shows two toasts.
**Rule:** ALWAYS rely on the global mutation error toast and only add success toasts locally — because a second error toast duplicates it; use mutation `meta` if a custom message is ever needed.
**Evidence:** `client/src/lib/providers.tsx` → `MutationCache` | `AgentEditor/_components/SkillsTab/useSkillsTab.ts`
> **Update 2026-11-27:** a mutation that shows its own error inline (e.g. `useImportSkillUrl`, the 422 reason under the URL field) sets `meta: { inlineError: true }`; `MutationCache.onError` in `lib/providers.tsx` then skips the global toast.

### 2026-11-26 — Status colour tokens are --ok / --warn / --crit
**Insight:** Specs say `--success` / `--warning` / `--danger`, but the theme defines none of them; the semantic tokens are `--ok`, `--warn`, `--crit` (+ `-bg` variants). An undefined var renders as inherited colour with no error.
**Rule:** ALWAYS map spec colour names to `--ok`/`--warn`/`--crit` — because the spec names don't exist and fail silently.
**Evidence:** `client/src/app/skills/_components/SkillDetail/_components/StatsTab/helpers.ts` → `acceptTone()`

### 2026-11-26 — Skills mirror the Agents list (card grid), not master-detail
**Insight:** The first Skills implementation reused `ListDetail` (list on the left, detail on the right) because the designs showed it, but the user wanted the same card-grid page as `/agents` and a full-width detail page, and the Versions tab to show per-version Diff against the PREVIOUS version, inline, with Diff on the current row too.
**Rule:** ALWAYS model a new list page on `AgentsListView` (header + search + Add menu + `repeat(auto-fill, minmax(280px, 1fr))` grid, click → `/<thing>/:id`) unless the user asks for a side list — because the user corrected the layout once already; `ListDetail` stays only for the Agent Editor.
**Evidence:** `client/src/app/skills/_components/SkillsView/SkillsView.tsx`, `SkillDetailView/SkillDetailView.tsx`, `VersionsTab/_components/VersionRow/VersionRow.tsx`; spec `docs/specs/m2-skills/SPEC.md` §3.5, §5.6

### 2026-11-26 — Merge conflicts travel to the Config tab through a never-fetched query
**Insight:** Conflicts from `POST /repos/:id/conventions/skill` (merge) are not stored on the server (plan decision F5); `useCreateSkillFromConventions` puts them at `queryKeys.mergeConflicts(skillId)` and `ConfigTab` reads them with `useMergeConflicts()` (`enabled: false`, `staleTime: Infinity`) after the redirect; clearing writes `[]` so the mounted observer re-renders.
**Rule:** ALWAYS seed that key in tests via `renderWithProviders(ui, qc)` from `app/skills/_components/test-utils` — because the hook never fetches and an empty cache shows no dialog.
**Evidence:** `client/src/lib/hooks/conventions.ts` → `useMergeConflicts()`, `useClearMergeConflicts()` | test `ConfigTab.test.tsx` "after a merge, the conflicts dialog fills the form on Apply"

### 2026-11-26 — Skill delete and rename must invalidate every conventions page
**Insight:** The "in <skill>" badges on `/repos/:id/conventions` come from server-resolved `skill_names` cached under `["conventions", repoId]` (staleTime 30 s); `useDeleteSkill` / `useUpdateSkill` invalidated only skill keys, so a deleted or renamed skill kept its badge after navigating back.
**Rule:** ALWAYS invalidate `queryKeys.conventionsAll()` in a skill mutation that changes a name or removes a skill — because the dependency crosses features (skills → conventions) and no key in the skills hooks mentions it.
**Evidence:** `client/src/lib/hooks/skills.ts` → `useDeleteSkill()`, `useUpdateSkill()` | `lib/hooks/keys.ts` → `conventionsAll` | test `DeleteSkillDialog.test.tsx` "a delete marks every conventions page stale…"

### 2026-11-26 — A dialog opened by a URL flag must clear the flag when it shows nothing
**Insight:** `AgentSuggestionsDialog` returned `null` for an empty list or a failed request, so `?suggest=1` stayed and a reload / Back reopened the dialog outside the create flow; its `onClose` is an inline `router.replace` arrow, new on every render.
**Rule:** ALWAYS call `onClose` once (ref guard + latest-callback ref, effect keyed on the "nothing to show" flag) when a URL-triggered dialog decides not to render, and ignore X / backdrop while its mutation is in flight — because otherwise the flag outlives the flow and a mid-flight close loses the per-row outcomes.
**Evidence:** `client/src/app/skills/_components/AgentSuggestionsDialog/useAgentSuggestionsDialog.ts` → `nothingToShow`, `dismiss` | tests `AgentSuggestionsDialog.test.tsx` "no agent fits…", "while links are in flight…"

## Tool & Library Notes

### 2026-11-22 — @testing-library/user-event is not installed in client
**Insight:** `client/package.json` has `@testing-library/react` and `jest-dom` only; importing `user-event` fails.
**Rule:** ALWAYS use `fireEvent` from `@testing-library/react` for clicks in client tests — because adding a dev dependency for it is out of scope for feature work.
**Evidence:** `FindingsPanel/FindingsPanel.test.tsx` → `toggleHideLow()`, `chip()`

### 2026-11-22 — pnpm 12 refuses client scripts with ERR_PNPM_VERIFY_DEPS_BEFORE_RUN
**Insight:** pnpm ≥11 no longer reads the `pnpm.overrides` field of `client/package.json`, so its pre-run deps check fails and `pnpm test` / `pnpm typecheck` / `pnpm dev` exit before running; a piped `| tail` hides the non-zero exit.
**Rule:** ALWAYS use pnpm 10 (`npm i -g pnpm@10`), or set `pnpm_config_verify_deps_before_run=false` for a one-off run, and NEVER run `pnpm install` under pnpm 12 here — because it would drop the overrides from the lockfile.
**Evidence:** `client/package.json` → `pnpm.overrides`; command `pnpm_config_verify_deps_before_run=false pnpm typecheck`

### 2026-11-25 — eslint-disable comments in client suppress nothing
**Insight:** No package has an ESLint config or `lint` script, so `// eslint-disable-line react-hooks/exhaustive-deps` in `ConfigTab.tsx` and `ReviewRunAccordion.tsx` is decorative and hook-rule violations go unchecked.
**Rule:** NEVER treat an eslint-disable comment as proof a rule was considered — because no linter runs; verify hook deps by hand until P0-1 in `docs/improvement-plan.md` lands.
**Evidence:** `client/package.json` (no lint script) | `ConfigTab.tsx` → reset `useEffect`
> **Superseded 2026-11-25:** ESLint now runs (`client/eslint.config.mjs`, `pnpm lint`, `client.yml`); disable comments are live again and an unused one is reported.

### 2026-11-25 — no-restricted-imports group negation ignores ../ paths
**Insight:** In `no-restricted-imports`, a `group` like `["../../../*", "!**/messages/**"]` still flags `../../../../messages/en/x.json`, because the gitignore-style matcher doesn't apply `**` negations to paths starting with `../`.
**Rule:** ALWAYS express "deep relative except X" with the `regex` option (`^(?:\.\./){3,}(?!\.\./)(?!messages/)`) — because `group` negation silently keeps the false positives.
**Evidence:** `client/eslint.config.mjs` → `no-restricted-imports` pattern | `pnpm lint` (0 `messages/` hits after the switch)

### 2026-11-25 — Next 15 lints during next build once ESLint is installed
**Insight:** Adding `eslint` + `eslint-config-next` makes `next build` run ESLint and fail on lint errors, which silently couples the production build (and e2e, which builds the web app) to lint.
**Rule:** ALWAYS keep `eslint: { ignoreDuringBuilds: true }` in `next.config.mjs` and run `pnpm lint` as its own CI step — because a new lint error must not break the build or the e2e stack.
**Evidence:** `client/next.config.mjs` → `eslint.ignoreDuringBuilds` | `.github/workflows/client.yml` → `pnpm lint`

### 2026-11-26 — vendor/ui Markdown drops raw HTML instead of escaping it
**Insight:** `<Markdown>` from `@devdigest/ui` removes raw HTML blocks entirely (`<script>…</script>` disappears), so a "shown as text" acceptance check is not literally met — it is safe, but invisible.
**Rule:** ALWAYS phrase XSS acceptance checks as "no element created" for `<Markdown>` — because escaping-as-text would need a change to the shared component.
**Evidence:** `client/src/app/skills/_components/SkillDetail/_components/PreviewTab/PreviewTab.test.tsx`

### 2026-11-26 — vendor/ui Modal closes only through onClose (backdrop + X), never on Esc
**Insight:** `Modal` in `@devdigest/ui` wires `onClose` to the backdrop click AND renders the X only when `onClose` is set; it has no Escape handler. Omitting `onClose` therefore makes a dialog closable only by its own footer buttons.
**Rule:** ALWAYS omit `onClose` for a dialog whose state would be lost on close (e.g. MergeConflictsDialog, conflicts live only in the client cache) — because a stray backdrop click otherwise discards it with no confirmation.
**Evidence:** `client/src/vendor/ui/kit/Modal.tsx` → `Modal` | test `MergeConflictsDialog.test.tsx` "has no X / backdrop close"

### 2026-11-27 — jsdom has no Blob.text(): read files with FileReader
**Insight:** `File.text()` works in browsers but is missing in the client's jsdom, so `await file.text()` throws in tests and an import helper silently returns its "readFailed" branch.
**Rule:** ALWAYS read a picked / dropped file through `FileReader.readAsText` — because it works in browsers and in jsdom, so the same code path is tested.
**Evidence:** `client/src/app/skills/_components/CreateSkillModal/helpers.ts` → `readAsText()`, `readSkillFile()` | test `helpers.test.ts` "readSkillFile reads a Markdown file"

## Recurring Errors & Fixes

### 2026-11-22 — "borderColor … conflicting borderLeftColor" warning in FindingsPanel tests is pre-existing
**Insight:** React warns "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" whenever a card's `focused` flips; the cause is `FindingCard/styles.ts` mixing `borderColor` with `borderLeftColor`, not the panel or its filters.
**Rule:** NEVER chase this warning in FindingsPanel changes — because it comes from FindingCard, which the severity-filter spec leaves untouched; fix it only in a FindingCard task (split `borderColor` into per-side colors).
**Evidence:** `FindingCard/styles.ts` → card style (`borderColor`, `borderLeftColor`); test `FindingsPanel severity counters` stderr

### 2026-11-25 — "Super expression must either be null or a function" on every route in next dev
**Insight:** Importing the `@devdigest/ui` barrel from a Server Component (here the root `not-found` view) pulls its client-only class components into the RSC graph; `next dev` then 500s on every page, while `next build` + `next start` still pass, so only e2e catches it.
**Rule:** ALWAYS keep any component that imports `@devdigest/ui` a `"use client"` file (server `page.tsx`/`not-found.tsx` render it) and run `e2e:hermetic` after making a component server-only — because the production build does not reproduce the dev-mode crash.
**Evidence:** `src/app/_components/NotFoundView/NotFoundView.tsx` → `"use client"` | `./scripts/e2e.sh` ("web never became reachable" + the TypeError in the web log)

### 2026-11-26 — Value import from @devdigest/shared breaks the Next build
**Insight:** `Module not found: Can't resolve './contracts/findings.js'` (page 500) when a component imports a runtime value (e.g. `SkillType.options`) from `@devdigest/shared`. The barrel re-exports with `.js` extensions, which Next's webpack does not map to `.ts`; `import type` works only because it is erased. Typecheck and vitest both pass, so only the dev server shows it.
**Rule:** ALWAYS import `@devdigest/shared` with `import type` in client code and keep enum value lists as local constants (`as const satisfies readonly X[]`) — because a value import compiles in tsc/vitest but crashes the page at runtime.
**Evidence:** `client/src/vendor/shared/index.ts` → `export * from './contracts/findings.js'`; fix in `client/src/app/skills/_components/constants.ts` → `SKILL_TYPES`

### 2026-11-26 — findByRole("status") returns the empty toast region
**Insight:** `ToastProvider` renders a `role="status"` live region, so in any test wrapped with it `findByRole("status")` matches the (empty) toast container instead of your own status banner.
**Rule:** ALWAYS find a status banner by its text and then `.closest("[role=status]")` — because the toast region is always mounted first.
**Evidence:** `client/src/lib/toast.tsx` → `role="status"` | test `ConventionsView.test.tsx` "a scan that keeps nothing keeps the header…"

### 2026-11-26 — Create-skill mocks without conflicts break the success path
**Insight:** Since stage 2, `useCreateSkillFromConventions` onSuccess reads `conflicts.length`; a mock body `{ skill }` (the stage-1 shape) throws inside onSuccess, so `router.push` is never called and the test fails on navigation, not on the data.
**Rule:** ALWAYS mock `ConventionSkillResult` in full: `{ skill, added, duplicates, conflicts: [] }` — because the contract fields are required and the hook trusts them.
**Evidence:** `CreateSkillFromConventionsModal.test.tsx` "prefills from the draft…" | `client/src/lib/hooks/conventions.ts` → `useCreateSkillFromConventions()`

## Session Notes

- 2026-11-21 — M1 run cost (client: RunCostBadge in PR list, timeline, trace drawer, verdict banner): done, 68 tests green; see "Keep shared src/components free of their own i18n namespace"

- 2026-11-22 — M1 severity counters & filter (client: FindingsPanel chips + filter, 21 panel/helper tests, 87 client tests green): done; see "Iterate severity levels from the contract, not from SEV"

- 2026-11-25 — Researched React/Next.js architecture practices and added `.claude/skills/frontend-architecture` (SKILL, examples, references): done; see "Use the @/ alias in new imports despite existing ../../../ chains"

- 2026-11-26 — M2 Skills client (Skills page 4 tabs, Agent Skills tab, SKILLS LAB nav, list-detail shell, Dropdown `disabled` items): 198 tests green; see "Per-query retry overrides on hooks"

- 2026-11-26 — Conventions Extractor stage 1 client (/repos/:repoId/conventions page, card, edit + create modals, nav g c, formatRelative moved to lib/format): 233 tests green; see "A plain-object route in mockFetch cannot fail"

- 2026-11-26 — Conventions Extractor stage 2 client (target SearchableSelect + MergeForm, MergeConflictsDialog → ConfigTab form, single-PATCH edit): 247 tests green; see "Merge conflicts travel to the Config tab through a never-fetched query"

- 2026-11-26 — Conventions Extractor stage 3 client (AgentSuggestionsDialog after create / merge via ?suggest=1, after MergeConflictsDialog; useLinkAgentSkill; skill delete/rename invalidate conventions): 262 tests green; see "Invalidating the suggestions list after each link empties the open dialog"

- 2026-11-27 — Skills safety UI + import tabs (card delete, rejected conventions hidden, SkillSafety banner/yellow highlight/Save gating, Add skill dialog Create · From file · Import from URL, agent suggestions act per row): client 299 green; see "jsdom has no Blob.text(): read files with FileReader"

## Open Questions

- 2026-11-25 — Is the hard-coded hex `MODEL_COLOR` map an accepted exception to "no hard-coded colors / CSS variables only"? (context: `src/app/agents/_components/AgentCard/constants.ts` → `MODEL_COLOR`)

- 2026-11-25 — Will the client ever be deployed publicly? It decides SEO scope: today only root `metadata` exists, there is no `robots.ts`/`sitemap.ts`, and repo/PR/settings screens would need `noindex` (context: `src/app/layout.tsx` → `metadata`; `.claude/skills/frontend-architecture/SKILL.md` §12–13)
