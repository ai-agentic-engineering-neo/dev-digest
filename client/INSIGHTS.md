# client — insights

What the code of this module does not show: lasting facts about it, and the
lessons of past work sessions. Read it before working here. It is the one place
for this knowledge: the `engineering-insights` skill appends to it, and people
edit it.

- **Key Facts** is curated. Edit or remove an entry when it stops being true.
  Format: `### YYYY-MM-DD — short title`, then **What happened**, **Why** and
  **Rule**.
- Every other section is append-only. Add entries, never rewrite or delete
  them; correct one by appending a new dated entry that names it. Format:
  `- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## Key Facts

<!-- Lasting facts about the module, promoted from the sections below. -->

### 2026-11-21 — The client's contract copy differs from the server's

**What happened:** `src/vendor/shared` differs from
`../server/src/vendor/shared` in five files (see `../server/INSIGHTS.md`).

**Why:** the contracts are vendored per package with no sync check, and client
tests mock `fetch`, so a mismatch does not fail any client test.

**Rule:** before building on a contract here, diff it against the server copy;
treat the server copy as the one the API actually validates against.

### 2026-11-22 — A findings counter must equal what a click on it shows

**What happened:** the severity filter on a review run (`SeverityFilter` inside
`FindingsPanel`) shows a counter per level next to `Hide low confidence`. The
counters are computed after the confidence filter and before the severity
filter, and both filters live in the panel's local state, so nothing is
requested when a counter is clicked.

**Why:** the list a reviewer sees is the result of both filters. A counter taken
from the unfiltered run stops matching the list as soon as the toggle is on, and
an empty level that is also the active filter would leave no way to clear it.

**Rule:** derive every count and every list in `FindingsPanel` from the findings
already loaded, through the helpers in `FindingsPanel/helpers.ts`; count before
the filter the counter itself applies and after every other filter; never
disable the control that clears the active filter.

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

- 2026-11-21 — Never run a second `next dev` in `client/` (any port) while `pnpm dev` is up: both share `client/.next`, and the original server then 404s its chunks (`ChunkLoadError: Loading chunk app/agents/page failed`). Recovery: stop it, `rm -rf .next`, `pnpm dev`. Evidence: scripts/e2e.sh:148

- 2026-11-22 — Do not set `borderColor` next to `borderLeftColor` in an inline style: `borderColor` is itself a shorthand, so React warns ("Updating a style property during rerender (borderColor) when a conflicting property is set") and can drop the left colour whenever the value changes, e.g. when the focused finding card moves. Use the four per-side longhands for both colour and width. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:11

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — Failed runs carry `tokens_in/out = 0` (not null) in `RunSummary`; gate any token/cost display on `status === "done"` or a failed run renders `0→0`. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:204

- 2026-11-22 — `Chip` (active style fixed to the accent colour, count after the label) and `SeverityBadge` (a `span`, not a button) cannot be a severity-coloured toggle, and `src/vendor/ui` is off limits for feature work. Build such a control locally under `_components/` as a `<button aria-pressed>` and take colours from the `SEV` tokens of `@devdigest/ui`; put the label text in `messages/en`, not `SEV[x].label`. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilter/SeverityFilter.tsx:39

- 2026-11-23 — An overlay opened from a PR list row must be `position: fixed`: the table card has `overflow: hidden`, so an absolutely positioned child is clipped at the card's edge. Keep it a DOM child of the element that opens it, with padding instead of a gap between the two, so the pointer can move onto it without a `mouseleave`; stop the click inside it, because the whole row is clickable; and close it on scroll, since a fixed overlay does not follow its row. `@devdigest/ui` has no popover, and `Dropdown` opens on click with a fixed item list. Evidence: client/src/app/repos/[repoId]/pulls/_components/FindingsCell/styles.ts:31

- 2026-11-23 — To load data only when a control is opened, pass `null` as the id to the existing query hook (`usePrReviews(open ? pr.id : null)`): every hook here is `enabled: !!id`, so no `enabled` parameter is needed, and the result is cached for the next open. Evidence: client/src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx:43

- 2026-11-26 — Code added to a `.tsx` copies that file's habits: in a folder that already has `constants.ts` / `helpers.ts`, an agent put new thresholds and rules there unprompted, while in a `.tsx` with an inline constant it added two more inline, wrote the rule into JSX and hardcoded English labels "like the rest of this header's strings". 19 such declarations exist (grep 1 of the skill lists them). When you edit one of those files, create the sibling `constants.ts` / `helpers.ts` / `styles.ts` and the message key for what you add, move only the declarations you change, and name what you left. Evidence: .claude/skills/frontend-architecture/SKILL.md:79

- 2026-11-28 — Component tests that need data go through `renderWithProviders` + `mockApi` (`src/test/render.tsx`), never `vi.mock` of `@/lib/hooks/*`. `renderWithProviders` passes the providers as RTL's `wrapper`, so `view.rerender(<X … />)` keeps them and the query cache; `mockApi` answers an error status when `respond` returns `new ApiErrorReply(status, body)`; `vitest.config.ts` sets `unstubGlobals: true`, so no test file calls `vi.unstubAllGlobals()`. Evidence: client/src/test/render.tsx:18

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

- 2026-11-28 — next-intl messages are ICU: a literal `<name>` in a string is parsed as an unclosed rich-text tag and the message fails at render (`INVALID_MESSAGE: UNCLOSED_TAG`, logged, not thrown), so tests still pass while the UI shows the key. Avoid `<…>` in `messages/en/*.json` text, or escape it. Evidence: client/messages/en/skills.json

- 2026-11-28 — React Query keys live only in `src/lib/hooks/query-keys.ts`, and a mutation that renders its own error must set `meta: { errorUi: "inline" }` (typed via the `Register` augmentation in `src/lib/error-policy.ts`), or the global MutationCache toasts it a second time. Prefer `mutate(vars, { onSuccess })` over `mutateAsync` in a component: an un-caught `mutateAsync` rejection is an unhandled promise on top of the toast. Evidence: client/src/lib/error-policy.ts:36

- 2026-11-22 — A vitest path filter that contains the route folders `[repoId]` / `[number]` matches nothing ("No test files found"), with or without escaping the brackets. Filter by a plain name fragment instead: `pnpm exec vitest run FindingsPanel SeverityFilter`. Evidence: client/vitest.config.ts:18

## Decisions

<!-- A decision and the reason for it. -->

- 2026-11-21 — Review-run headers get their cost from the already-loaded `usePrRuns` (map `run_id → cost_usd`, done runs only) rather than widening the `ReviewRecord` contract; reuse that map for any other per-review run metric. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:50

- 2026-11-22 — Severity counters are computed after `Hide low confidence` and before the severity filter, so a counter always equals the number of cards a click on it shows; counting the unfiltered run would break "the number matches the list" as soon as the toggle is on. A level with 0 findings is disabled, except when it is the active filter, because the toggle can empty the active level and the filter must still be clearable. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:36

- 2026-11-23 — The PR list's findings preview does not trust the list's numbers for its heading: it applies the server's rule itself (`latestFindingsPerAgent`: each agent's latest `kind = "review"` review) to the loaded reviews and heads the list with the number of findings it shows. The chips come from `PrMeta.findings_counts`, which refreshes every 60 s, so the two can differ for a moment after a new run; a heading taken from the chips would then disagree with the list under it. If the server rule changes, change this helper with it. Evidence: client/src/app/repos/[repoId]/pulls/helpers.ts:16

- 2026-11-26 — Where code goes in `client/src` is decided by its kind, not its size or reuse: every constant leaves the `.tsx` for `constants.ts` and every pure rule for `helpers.ts`, however small. Several published sources would keep small single-use code inline, and others reject the names `helpers.ts` and a per-component `index.ts`; the repo keeps all three because the convention already covered most folders and a rule without a judgement call can be checked with a grep. Do not relax it to "extract when reused" or rename the files without reading the trade-off first. Evidence: .claude/skills/frontend-architecture/references.md:28

- 2026-11-28 — An unsaved-edits guard for in-app navigation needs no router hook: `SkillDetail/useUnsavedGuard.ts` adds a capture-phase `click` listener on `document` while dirty, which runs before React's root listener, so `preventDefault()` + `stopPropagation()` stops a `next/link` before it navigates (sidebar, breadcrumb, cards). For a whole-card click, forward it to the card's own `<Link>` (`linkRef.current.click()`) instead of calling `router.push`, so it passes through the same guard. `router.push` calls and `g`-key shortcuts are not guarded. Evidence: client/src/app/skills/_components/SkillDetail/useUnsavedGuard.ts:22

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and specs/ for the package; no source code changed.

- 2026-11-21 — Built M1 run cost badge (client): `RunCostBadge` (compact/detailed) in PR list, timeline, review-run header and trace COST tile; spec client/specs/M1-cost-badge.md.

- 2026-11-22 — Built the M1 severity filter (client only): `SeverityFilter` counters above each run's findings, `countBySeverity` / `visibleFindings({ hideLow, severity })`; spec client/specs/M1-severity-filter.md. Checked live on seeded PR #482; the combination with `Hide low confidence` is covered by tests only, because no stored finding is below 0.65 confidence.

- 2026-11-23 — Built the M1 findings column (client): `FindingsCell` with severity chips and a hover preview headed `N findings in this run` on the PR list; spec client/specs/M1-findings-column.md. Checked live on seeded PR #482 (two agents, 5 findings), including the severity counters and `Hide low confidence` on the Performance Reviewer run, which now has a finding below 0.65 confidence. Merged `LEARNINGS.md` into this file.

- 2026-11-26 — Added the `frontend-architecture` skill (placement rules for `client/src`, with its source catalogue in `references.md`) and pointed `AGENTS.md` at it; removed the Axios, Vite, react-router and Tailwind-class advice from `react-best-practices`. No source code under `client/src` changed; the 19 inline declarations and 3 imports into another component folder's internals that the skill's greps list are still there.

- 2026-11-28 — Built M2 Skills (client): `/skills` list + detail (Config, Preview, Versions; Context/Evals/Stats empty states), create and two-step import modals, agent editor Skills tab (linked skills only, optimistic `POST /agents/:id/skills`), trace skills tokens/chips; e2e flow 08. `src/test/render.tsx` (`renderWithProviders`, `mockApi`) lets a component test run the real hooks against a stubbed `fetch` and assert the exact method/path/body. Built against the server spec while the server was in progress; not checked live.

- 2026-11-28 — M2 Skills review fixes (client): rules moved to helpers (SkillsTab, SkillDetail, PreviewTab, SkillsLayout, `parseAgentTab`), agent `TABS` moved to the route folder, import step held as one union in `useImportFlow`, `formatBytes`/read error translated, CreateSkillModal tests, e2e 08 made read-only. Not checked live.

## Open Questions

<!-- What is still unresolved. -->
