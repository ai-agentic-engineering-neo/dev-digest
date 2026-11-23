# DevDigest profile (`client/`)

How the generic rules map onto this repo, with real paths. Facts below were checked against `client/src` on 2026-11-23; re-verify with `ls` before relying on a path. Repo conventions win over the textbook (see `client/CLAUDE.md`).

Contents: [Conventions](#conventions-already-in-the-repo) · [Exemplars](#exemplars-copy-these) · [Known deviations](#known-deviations-dont-copy-dont-fix-unasked) · [Repo-specific placement](#repo-specific-placement-rules) · [Review checklist](#review-checklist-for-this-repo)

## Conventions already in the repo

| Rule (from `client/CLAUDE.md`) | What it means for placement |
|---|---|
| Pages stay thin; feature logic lives in colocated `_components/<Name>/` folders, each with a `*.test.tsx` | Route-private UI → `app/**/_components/<Name>/`; every component folder gets a test |
| All data access through `src/lib/hooks/*` → `src/lib/api.ts` (TanStack Query); no ad-hoc `fetch` | Server data → a hook in `lib/hooks/<domain>.ts` |
| User-facing strings in `messages/<locale>/*.json` (next-intl) | Never hard-code user-visible text in components or `constants.ts` |
| `src/vendor/shared` (contracts) and `src/vendor/ui` (`@devdigest/ui`) are shared, not local | Import via `@devdigest/shared` / `@devdigest/ui`; don't edit casually |
| Tests: vitest + jsdom, `fetch` mocked | Pure helpers get plain `*.test.ts`; components get `*.test.tsx` |

## Exemplars (copy these)

**`app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`** — the reference shape:
```
FindingsPanel/
├── FindingsPanel.tsx        component (state + composition)
├── SeverityCounters.tsx     child used only here
├── index.ts                 `export { FindingsPanel, FindingsPanel as default } from "./FindingsPanel"`
├── constants.ts             SEVERITY_LEVELS, SEVERITY_ORDER, LOW_CONFIDENCE_THRESHOLD, KEY_TO_ACTION (documented)
├── helpers.ts               visibleFindings(), countBySeverity() — pure, take data in, return data out
├── helpers.test.ts          unit tests for the pure part
├── styles.ts
└── FindingsPanel.test.tsx
```
Takeaways: constants are named by meaning and doc-commented; pure derivation lives in `helpers.ts` and is tested without rendering; counts are derived from props rather than stored (`useMemo` over the `findings` prop), so accept/dismiss refetching keeps them in sync with no extra wiring.

**`app/repos/[repoId]/pulls/page.tsx`** — a good page: `@/` imports, route-level `constants.ts` / `styles.ts` / `helpers.ts` beside it, children in `_components/{PRRow,FilterBar,FindingsHover,RunCostBadge}`, filters kept in URL query (`?status&sort`).

**`components/diff-viewer/`** — a shared (multi-route) component family: `index.ts` public API, `constants.ts`, `helpers.ts`, `styles.ts`, and sub-components each in their own folder (`FileCard/`, `CodeLine/`, `CommentCard/`, …).

**`lib/hooks/`** — one module per domain (`agents.ts`, `reviews.ts`, `trace.ts`, `repo-intel.ts`, `core.ts`) plus an `index.ts` re-exporting them. Components import from `@/lib/hooks` or a domain file (`@/lib/hooks/reviews`).

## Known deviations (don't copy, don't fix unasked)

These exist today. Mention them if relevant to the task; refactor only inside the task's scope.

- **`app/repos/[repoId]/pulls/[number]/page.tsx` is not thin** (~185 lines): about nine data hooks, derived `allFindings`, tab and drawer wiring in the page body. A natural future cut: an orchestration hook (e.g. `usePrDetail(prId)`) and a view component, leaving `page.tsx` to read params and render. It's `"use client"`, as most pages here are.
- **Mixed import styles in that same page**: `../../../../../lib/hooks` and `../../../../../components/app-shell` alongside `@/components/repo-not-found`. New code uses `@/`.
- **Query keys are inline literals** (`["agents"]`, `["agent", id]`, `["pr-active-runs", prId]` in `lib/hooks/*.ts`), not a key factory. Fine while each key lives beside its hook; if you add a key used in 3+ places (query + invalidation + removal), introduce a small factory in that domain's hook module rather than another literal. Don't convert existing keys unasked.
- **`_components/RunHistory/`** has no `index.ts` (just `RunHistory.tsx` + test), unlike its siblings. New folders should have one; adding it is a safe drive-by only when you're already editing imports there.
- **`lib/hooks/index.ts` is a wide re-export barrel.** It's the documented single entry point; keep it, but don't copy the pattern for components.
- **Hook modules can hold small types** (e.g. `ActiveRun` in `lib/hooks/reviews.ts`). Acceptable; contracts still come from `@devdigest/shared`.

## Repo-specific placement rules

- **Contracts:** `@devdigest/shared` = `client/src/vendor/shared`, which has **drifted** from `server/src/vendor/shared`. If a task needs a contract change, diff both copies first; never "fix" a client type by redeclaring it locally.
- **i18n namespaces:** the run-trace drawer uses `runs` (`messages/en/runs.json`); the PR list, timeline and verdict banner use `prReview`. Check the component's `useTranslations(...)` before adding a key; new strings go in `messages/en/*.json`, not in constants.
- **Shared UI primitives:** reach for `@devdigest/ui` (vendored) before writing a new primitive in `src/components/`.
- **Route-vs-shared:** `pulls/_components/FindingsHover` serves the PR list; when a second route needs it, promote it to `src/components/` instead of importing across routes.
- **Where shared route-level constants go:** if siblings under `pulls/[number]/_components/` both need a value (e.g. severity order for `FindingCard` *and* `FindingsPanel`), create `pulls/[number]/constants.ts` — not `src/lib`, not a copy in each.
- **Do-not-touch areas (project-wide):** don't hand-edit `server/src/db/migrations/**`; unrelated to UI placement but easy to hit when a UI change needs a column.

## Review checklist for this repo

Everything in SKILL.md Step 3, plus:
- [ ] New route component folder has `index.ts` and a `*.test.tsx`.
- [ ] No new `fetch(` in `client/src/app/**` or `client/src/components/**`.
- [ ] New strings are in `messages/en/*.json` under the right namespace.
- [ ] Imports use `@/`, `@devdigest/shared`, `@devdigest/ui` — no new `../../../` chains.
- [ ] No contract redeclared; if `vendor/shared` changed, both copies were diffed.
- [ ] Shared-between-routes code moved to `src/components/`; shared-between-siblings code is at route level.
