# References — react-architecture

Sources behind every rule in [SKILL.md](SKILL.md) and [examples.md](examples.md). Rules cite these by ID (e.g. `[B1]`).

**Verification status** (checked 2026-11-25): ✅ page fetched and the cited claims confirmed against the text · ☑️ URL resolves (HTTP 200), cited for well-known content and not re-read this session · ⚠️ could not be fetched by automated client; cited from secondary sources, so a human should verify before relying on exact wording.

---

## Official documentation

| ID | Source | Status | What we take from it | Cited in |
|----|--------|--------|----------------------|----------|
| R1 | [React — Thinking in React](https://react.dev/learn/thinking-in-react) | ☑️ | Break UI into a component hierarchy by single responsibility; build static first; identify the *minimal* state. | §4, §6 |
| R2 | [React — Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | ☑️ | Render must be pure: same inputs → same JSX, no mutation of pre-existing values. | §5 |
| R3 | [React — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | ☑️ | Effects are for syncing with external systems; derive during render; user-event logic belongs in handlers. | §6 |
| R4 | [React — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | ☑️ | Custom hooks share *stateful logic*, not state; `use` prefix only for functions that call hooks. | §5 |
| R5 | [React — Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure) | ☑️ | Rules of React: no side effects during render. | §5 |
| R6 | [React — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | ☑️ | Avoid redundant/duplicate/deeply nested state; group related state. | §6 |
| R7 | [React (legacy) — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html) | ✅ | React has no opinion; group by feature or by type; max 3–4 nesting levels; "don't spend more than five minutes" choosing; colocate files that change together. | §1, §2 |
| N1 | [Next.js — Project Structure](https://nextjs.org/docs/app/getting-started/project-structure) | ✅ | App Router is unopinionated; only `page`/`route` files are public so colocation in `app/` is safe; `_private` folders opt out of routing; route groups `(x)`; three valid strategies — "be consistent". | §1, §10 |
| N2 | [Next.js — Colocation](https://nextjs.org/docs/app/building-your-application/routing/colocation) | ☑️ | Same content as N1 (older doc path, still served). | §10 |

## Architecture methodologies

| ID | Source | Status | What we take from it | Cited in |
|----|--------|--------|----------------------|----------|
| B1 | [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | ✅ | `src/{app,components,config,features,hooks,lib,stores,types,utils}`; per-feature `{api,components,hooks,stores,types,utils}` (only what's needed); flow **shared → features → app**; no cross-feature imports, compose at app level; enforce with `import/no-restricted-paths`; import files directly, not via barrels; env/config in `config/`. | §2, §3, §7, §8, §9 |
| F1 | [Feature-Sliced Design](https://feature-sliced.design/) | ☑️ | Layers → slices → segments (`ui`, `api`, `model`, `lib`, `config`); imports only downward; slice public API. Suited to large teams. | §2, §3 |
| F2 | [codecentric — FSD and good frontend architecture](https://www.codecentric.de/en/knowledge-hub/blog/feature-sliced-design-and-good-frontend-architecture) | ☑️ | Practitioner view of FSD trade-offs; overkill for small apps. | §2 |
| MF1 | [Martin Fowler / Juntao Qiu — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | ✅ | "Separate view from no-view logic"; fetching + reshaping inside a component is "a bad programming habit"; hooks own state/effects, view stays "a humble piece of HTML"; domain objects hold business rules and carry no UI info; view / model / data layering; strategy objects for variant rules. | §5, §8 |
| MF2 | [Martin Fowler / Juntao Qiu — Headless Component](https://martinfowler.com/articles/headless-component.html) | ✅ | Extract logic + state into a hook that prescribes no UI; sub-parts stay state-agnostic; logic testable with `renderHook`; prefers hooks over render props/HOCs. | §4, §5 |
| P1 | [Profy.dev (Johannes Kettmann) — Screaming Architecture: Evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) | ✅ | Structure should reveal the domain, not the framework; ends at `features/` + thin `pages/`; absolute aliases; kebab-case to avoid case-sensitive CI breaks; global `hooks/`/`contexts/` become dumping grounds. | §1, §2, §9 |

## Folder-structure guides

| ID | Source | Status | What we take from it | Cited in |
|----|--------|--------|----------------------|----------|
| W1 | [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) (updated 2026) | ✅ | Grow incrementally: file → files → folder per component → feature folders; "only reusable hooks" go to `hooks/`; `utils/` generic, `lib/` pre-configured 3rd-party wrappers; component-local `constants.ts`/`utils.ts`; features don't import each other; promote when 2+ features need it; avoid >2 nesting levels. | §2, §3, §7, §8 |
| J1 | [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) (updated 2025) | ✅ | Per-component folder with `X.tsx`, `X.helpers.ts`, `X.types.ts`, `index.ts`; **helpers = project-specific, utils = generic/copy-pasteable**; promote helpers when needed in multiple places; app-wide `constants.ts`; having *a* convention matters most. Counterpoint: tolerates per-folder `index.ts` forwarders. | §7, §8, §9 |
| A1 | [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) | ✅ | Group by route/module from the start; shared `common` module; move helpers without closures outside the component; pure functions for logic; module-level config constants for repeated markup; size by responsibility not LOC; >5 props → consider splitting; container/presentational "falls short"; use a data-fetching library. | §4, §5, §7 |

## Component design & logic placement

| ID | Source | Status | What we take from it | Cited in |
|----|--------|--------|----------------------|----------|
| K1 | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | ✅ | "Place code as close to where it's relevant as possible"; tests, styles, utils, docs next to their only consumer; orphaned shared utils outlive their callers. | §1, §4, §7 |
| K2 | [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | ✅ | Decision flow: keep state where used → push into the child → lift to closest common parent; providers as low as possible; colocation beats blanket memoization. | §6 |
| K3 | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | ✅ | Avoid Hasty Abstractions; "prefer duplication over the wrong abstraction"; abstract after the shape is clear (rule of three). | §1, §4 |
| K4 | [Kent C. Dodds — Don't Sync State. Derive It!](https://kentcdodds.com/blog/dont-sync-state-derive-it) | ☑️ | Compute derived values on render instead of storing/syncing them. | §6 |
| K5 | [Kent C. Dodds — Inversion of Control](https://kentcdodds.com/blog/inversion-of-control) | ☑️ | Make abstractions flexible by handing control back to the caller (callbacks, children, render props) instead of piling on config props. | §4 |
| K6 | [Kent C. Dodds — React Hooks: Compound Components](https://kentcdodds.com/blog/compound-components-with-react-hooks) | ☑️ | Compound components with context for related UI parts that share implicit state. | §4 |
| DA1 | [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | ⚠️ | 2019 update note: author no longer recommends splitting components this way; hooks provide the same separation without an arbitrary split. (Medium returns 403 to automated fetch — wording from secondary summaries.) | §5 |
| PD1 | [patterns.dev — Compound Pattern](https://www.patterns.dev/react/compound-pattern) | ⚠️ | Compound pattern for component-library-style widgets (Tabs, Select, Menu). (DNS failure during verification.) | §4 |
| PD2 | [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern) | ⚠️ | Historical pattern; hooks largely replace it. (DNS failure during verification.) | §5 |

## Data & state

| ID | Source | Status | What we take from it | Cited in |
|----|--------|--------|----------------------|----------|
| T1 | [TkDodo — Practical React Query (series index)](https://tkdodo.eu/blog/practical-react-query) | ☑️ | Server state ≠ client state; keep server data in the query cache, not copied into stores. | §6 |
| T2 | [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | ✅ | Co-locate key + fn + options in `queryOptions()`; organize as query factories (`todoQueries.detail(id)`); custom hooks that only wrap `useQuery` "seem a bit pointless". | §6 |
| T4 | [TkDodo — Deriving Client State from Server State](https://tkdodo.eu/blog/deriving-client-state-from-server-state) | ✅ | Never `useEffect`-sync server data into client state; derive at render (`selection ?? users?.[0]`); read through one hook that does the check. | §6 |

## Imports, boundaries & tooling

| ID | Source | Status | What we take from it | Cited in |
|----|--------|--------|----------------------|----------|
| T3 | [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | ✅ | Barrels cause circular imports and load every re-exported module (Next.js app: 11k → 3.5k modules after removal); import from the source file; enable `import/no-cycle`; fine only for library entry points. | §9 |
| AT1 | [Atlassian — 75% faster builds by removing barrel files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) | ✅ | Jira frontend: −75% build minutes/commit, −88% unit tests per build, ~50% faster local tests; trade-off: lose barrel "public API" encapsulation. | §9 |
| E1 | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | ☑️ | Declare architectural element types and allowed dependencies between them. | §3 |
| E2 | [eslint-plugin-import — `no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | ☑️ | Zone-based import restrictions (the Bulletproof React enforcement recipe). | §3 |

## Style & naming

| ID | Source | Status | What we take from it | Cited in |
|----|--------|--------|----------------------|----------|
| AB1 | [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) | ☑️ | PascalCase component names; filename matches component name; one component per file (small stateless helpers allowed). | §4, §9 |

---

## Where sources disagree (and what this skill picks)

| Topic | Positions | Skill's choice |
|-------|-----------|----------------|
| By feature vs. by type | Feature: B1, W1, P1, A1, R7 (either). Type/function: J1. | **By feature/route**, with a small shared layer. Next.js routes already act as feature boundaries. |
| Barrel / `index.ts` files | Against: T3, AT1, B1. Tolerant: J1, W1 (as public API), P1. | **One thin `index.ts` per component folder is OK** (repo convention). **No aggregate barrels** that re-export many modules in app code. |
| File naming case | kebab-case: W1, J1, P1. PascalCase: AB1. | **PascalCase for component files/folders, camelCase/kebab for non-component modules.** This follows the existing `client/` convention, and consistency beats either choice (J1, N1). |
| Custom hook per query | Wrap `useQuery` in a hook (common). TkDodo T2: prefer `queryOptions` factories. | Domain hooks in `lib/hooks/<domain>.ts` (repo convention). Adopt `queryOptions` factories when the same query is needed imperatively (prefetch, `getQueryData`). |
