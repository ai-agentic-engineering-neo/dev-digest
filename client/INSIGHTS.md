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

### 2026-11-25 — Awaiting mutateAsync in a click handler without catch
**Insight:** `CreateAgentModal.submit` awaited `create.mutateAsync` with no `catch`, so a failed create raised an unhandled promise rejection (vitest fails the run on it) even though the global `MutationCache` toast already reports the error.
**Rule:** ALWAYS wrap `await mutation.mutateAsync(...)` in event handlers with `try/catch` and return early — because the error is shown by `lib/providers.tsx` and the rejection otherwise escapes.
**Evidence:** `CreateAgentModal.tsx` → `submit` | test `CreateAgentModal.test.tsx` "does not navigate when creation fails"

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

## Recurring Errors & Fixes

### 2026-11-22 — "borderColor … conflicting borderLeftColor" warning in FindingsPanel tests is pre-existing
**Insight:** React warns "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" whenever a card's `focused` flips; the cause is `FindingCard/styles.ts` mixing `borderColor` with `borderLeftColor`, not the panel or its filters.
**Rule:** NEVER chase this warning in FindingsPanel changes — because it comes from FindingCard, which the severity-filter spec leaves untouched; fix it only in a FindingCard task (split `borderColor` into per-side colors).
**Evidence:** `FindingCard/styles.ts` → card style (`borderColor`, `borderLeftColor`); test `FindingsPanel severity counters` stderr

### 2026-11-25 — "Super expression must either be null or a function" on every route in next dev
**Insight:** Importing the `@devdigest/ui` barrel from a Server Component (here the root `not-found` view) pulls its client-only class components into the RSC graph; `next dev` then 500s on every page, while `next build` + `next start` still pass, so only e2e catches it.
**Rule:** ALWAYS keep any component that imports `@devdigest/ui` a `"use client"` file (server `page.tsx`/`not-found.tsx` render it) and run `e2e:hermetic` after making a component server-only — because the production build does not reproduce the dev-mode crash.
**Evidence:** `src/app/_components/NotFoundView/NotFoundView.tsx` → `"use client"` | `./scripts/e2e.sh` ("web never became reachable" + the TypeError in the web log)

## Session Notes

- 2026-11-21 — M1 run cost (client: RunCostBadge in PR list, timeline, trace drawer, verdict banner): done, 68 tests green; see "Keep shared src/components free of their own i18n namespace"

- 2026-11-22 — M1 severity counters & filter (client: FindingsPanel chips + filter, 21 panel/helper tests, 87 client tests green): done; see "Iterate severity levels from the contract, not from SEV"

- 2026-11-25 — Researched React/Next.js architecture practices and added `.claude/skills/frontend-architecture` (SKILL, examples, references): done; see "Use the @/ alias in new imports despite existing ../../../ chains"

## Open Questions

- 2026-11-25 — Is the hard-coded hex `MODEL_COLOR` map an accepted exception to "no hard-coded colors / CSS variables only"? (context: `src/app/agents/_components/AgentCard/constants.ts` → `MODEL_COLOR`)

- 2026-11-25 — Will the client ever be deployed publicly? It decides SEO scope: today only root `metadata` exists, there is no `robots.ts`/`sitemap.ts`, and repo/PR/settings screens would need `noindex` (context: `src/app/layout.tsx` → `metadata`; `.claude/skills/frontend-architecture/SKILL.md` §12–13)
