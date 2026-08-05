# client — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

- **2026-08-01** — `position: absolute` popovers inside a PR-list row get clipped by the list container's overflow, so hover cards there must use `position: fixed` anchored via `getBoundingClientRect()` on mouseenter. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts` (`findingsPreview`).
  - **2026-08-01** — The style moved: the card was extracted into the shared `FindingsPreviewCard` (used by the PR list and the timeline), so the evidence now lives at `client/src/components/findings-preview/styles.ts:8` — `pulls/styles.ts` no longer has a `findingsPreview`.

- **2026-08-05** — There is no error boundary anywhere in the client — no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` under `src/app/`, and no `react-error-boundary` usage — so a render-time throw blanks the whole studio even though `providers.tsx` already toasts every query/mutation error and makes the app look defended. Evidence: `client/src/lib/providers.tsx:33-45`.
  - **2026-08-05** — Resolved for throws: `src/app/error.tsx`, `src/app/global-error.tsx` and `src/app/not-found.tsx` now exist, covered by `src/app/error.test.tsx`. `loading.tsx` was deliberately NOT added — 5 of the 8 route entries are client components that own their skeletons through TanStack Query, so a segment-level loading state would only add a flash before those mount.

- **2026-08-01** — The "all-longhand" border trick in FindingCard does not fully silence React's style warning: `borderColor` is itself a shorthand for the four `border-*-color` longhands, so a rerender that changes `borderColor` while `borderLeftColor` is set still logs "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" — any test that re-renders FindingCard (focus moves, list filters) emits this stderr noise despite the comment claiming otherwise. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:7-13`.

## Codebase Patterns

- **2026-08-01** — In `FindingsTab`, the prop named `runs` holds `ReviewRecord[]` and the actual run rows are `prRuns`, so `<RunHistory runs={prRuns ?? []} reviews={runs}>` is correct despite reading like a swapped-props bug — don't "fix" it. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:18` vs `:132-134`.

- **2026-08-05** — `CLAUDE.md` documents "relative paths, not `@/`" but the codebase is split roughly 2:1 against it — 41 imports climb four or more levels (deepest is eight: `"../../../../../../../../messages/en/prReview.json"`) versus 25 `@/` imports — so "match the surrounding file" is the only rule that actually holds today. Evidence: `grep -rhoE 'from "(\.\./){4,}[^"]*"' client/src/app client/src/components | wc -l`.

- **2026-08-05** — Sidebar entries are data in `src/vendor/ui/nav.ts` (`NAV`, `SETTINGS_ITEM`, `SHORTCUTS`), which `CLAUDE.md` marks do-not-touch, while `activeKeyFor()` in app code already resolves nine route keys of which only three have a nav item — so adding a page to the sidebar is necessarily a vendor edit, not an app-level one. Evidence: `client/src/vendor/ui/nav.ts:21-29,51-59`, `client/src/components/app-shell/helpers.ts:26-39`, `client/src/vendor/ui/shell/Sidebar.tsx:3`.

- **2026-08-05** — Whole i18n namespaces ship ahead of the screens that use them: `messages/en/skills.json` (~100 keys for a Skills page, import drawer, preview and version label) and the `skills` / `editor.tabs` blocks of `agents.json` exist while neither `src/app/skills/` nor a SkillsTab does — grep `messages/en/` before writing new copy for any unbuilt screen. Evidence: `client/messages/en/skills.json`, `client/messages/en/agents.json` (`editor.tabs.skills`, `skills.enabledCount`); `ls client/src/app` → no `skills`.

- **2026-08-05** — The pre-shipped i18n strings encode the intended LAYOUT, not just wording: `skills.json` carried `page.selectPrompt` ("Pick a skill on the left…") and a `detail.*` block, which only make sense for a rail-plus-detail screen — a card grid was built first and had to be reworked into `/skills` + `/skills/[id]` to match the design. Read the namespace before choosing a layout for an unbuilt screen. Evidence: `client/messages/en/skills.json` (`page.selectPrompt`, `detail.crumbSkill`, `detail.back`).

- **2026-08-05** — The App Router is used as an SPA router: 61 files carry `"use client"` and 5 of the 8 route entry files are client components at the root, so only `agents/page.tsx` and `settings/[section]/page.tsx` render on the server at all. Evidence: `grep -rl '"use client"' client/src | wc -l`; `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:6`.

## Tool & Library Notes

- **2026-08-05** — `global-error.tsx` is the one file here that may use neither the design tokens nor `next-intl`: it REPLACES the root layout, and `globals.css` is imported by that layout, so every `var(--bg-primary)`-style token resolves to nothing and `useTranslations` throws for a missing provider — inside the error boundary itself. It must inline literal hex colours and literal copy. Evidence: `client/src/app/layout.tsx:5`, `client/src/app/global-error.tsx`.

- **2026-08-05** — `FormField` renders a bare `<label>` with no `htmlFor` and gives its child no `id`, so no field rendered through it is reachable by `getByLabelText` — the query fails with "found a label … however no form control was found associated to that label". Query the control by role, by display value, or off the container instead. Evidence: `client/src/vendor/ui/kit/FormField.tsx:18-22`.

- **2026-08-05** — `@testing-library/user-event` is NOT a dependency of this package despite `@testing-library/react` and `jest-dom` both being present, so a test written with `userEvent.click` fails at import with `Failed to resolve import "@testing-library/user-event"` — the established interaction helper here is RTL's `fireEvent`. Evidence: `client/package.json` devDependencies; `grep -rn fireEvent client/src --include=*.test.tsx`.

- **2026-08-05** — `EmptyState` from `@devdigest/ui` hardcodes `icon="Plus"` on its CTA button, so it silently reads as "create something" and cannot be reused for a retry or navigate-home action — error/404 states need their own component rather than a prop override. Evidence: `client/src/vendor/ui/primitives/EmptyState.tsx:58`.

- **2026-08-05** — Tailwind is installed and compiled but no utility class is used anywhere: it exists purely for the `@theme` token layer that `vendor/ui/styles.css` defines, and app styling goes through `styles.ts` `CSSProperties` objects — the only classNames in `src/` are `mono`, `tnum`, `skeleton`, `dd-md`. Evidence: `client/src/app/globals.css:1-5`, `grep -rhoE 'className="[^"]*"' client/src | sort | uniq -c`.

- **2026-07-29** — Path aliases are declared twice and neither file reads the other: adding one to `tsconfig.json` without also adding it to `vitest.config.ts` type-checks and builds fine but fails at test time with an unresolved import. Evidence: `client/vitest.config.ts:8-13` vs `client/tsconfig.json` `paths`.

- **2026-07-29** — Vitest only collects `src/**/*.test.{ts,tsx}`, so a test file placed outside `src/` is silently never run rather than reported as missing. Evidence: `client/vitest.config.ts:18`.

- **2026-08-01** — `SeverityBadge` renders its label as `Critical`/`Warning`/`Suggestion` and only uppercases via CSS `textTransform`, so RTL assertions on `textContent` (e.g. `getByText("CRITICAL")`) fail even though the UI shows "CRITICAL". Evidence: `client/src/vendor/ui/primitives/tokens.ts:10-13`, `client/src/vendor/ui/primitives/Badge.tsx:76`.

## Recurring Errors & Fixes

## Session Notes

- **2026-08-01** — Added severity counter chips + click-to-filter to `FindingsPanel` (feat/severity-findings-counters); counts derive from already-fetched findings, no new API/LLM calls. Verified with vitest and agent-browser against the live app.

## Open Questions
