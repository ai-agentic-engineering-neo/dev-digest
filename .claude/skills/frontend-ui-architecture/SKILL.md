---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React / Next.js apps: where components, hooks, constants, helpers/utils, types and business logic live; how to split components; feature-first folders, colocation, module boundaries and imports. Use whenever you create a new component, page, feature or hook, move or split files, add constants/helpers/utils, extract logic out of a component, restructure folders, or review a PR for structure — even if nobody says 'architecture' and the question is just 'where should this go?'. Not for hook/state anti-patterns or performance (use react-best-practices) or Next.js framework APIs (use next-best-practices)."
metadata:
  version: "1.0.0"
---

# Frontend UI Architecture

How to decide **where code lives** and **how it is split** in a React / Next.js codebase.
Goal: a reader can find any piece of code by guessing, and a feature can be changed or deleted by touching one folder.

**Precedence:** the repo's own conventions (package `AGENTS.md` / `CLAUDE.md`, existing patterns) beat this skill. Follow what the codebase already does; use these rules to fill gaps and to judge new structure.
In dev-digest `client/`, read [references/dev-digest-client.md](references/dev-digest-client.md) first — it maps every rule below to concrete paths.
Before/after trees and code: [references/examples.md](references/examples.md).

---

## 1. Principles

1. **Colocate first.** Put code next to the only thing that uses it — styles, constants, helpers, types, tests and sub-components sit inside the component or route folder. Things that change together stay together, so a change touches one folder and deleting a feature deletes one folder.
2. **Promote on real reuse, not on prediction.** Move code to a shared place when a *second* feature actually needs it (and the two uses really are the same thing). Early abstractions guess wrong and are expensive to undo (AHA — "prefer duplication over the wrong abstraction").
3. **Feature-first at the top, technical segments inside.** Top-level grouping follows the product (routes / features); inside a feature, split by role (`components`, `hooks`, `helpers`, `constants`, `types`). A top-level `components/ hooks/ utils/` split only works for small apps — as the app grows, one feature gets smeared across five folders.
4. **Dependencies flow one way.** `routes → features → shared → vendor/contracts`. Lower layers never import higher ones; features never import each other's internals. This keeps features deletable and avoids cycles.
5. **UI is thin; logic is plain TypeScript.** Components render; hooks orchestrate state and data; rules and transformations are pure functions with no React import. Pure functions are trivially unit-tested and reused, and they survive UI rewrites.

## 2. Layers

| Layer | Holds | May import |
|---|---|---|
| **Routes** (`app/**/page.tsx`, `layout.tsx`) | Thin entry: read params, pick the feature view, set metadata. No business logic, no markup beyond composition. | features, shared |
| **Features** (route-colocated `_components/`, or `features/<name>/`) | Feature UI, feature hooks, feature helpers/constants/types | shared, vendor/contracts — **not other features' internals** |
| **Shared UI** (`components/`) | Reusable, domain-light components used by ≥2 features (app shell, diff viewer, empty states) | shared lib, vendor |
| **Shared lib** (`lib/`) | API client, data hooks, providers/contexts, generic utilities | vendor/contracts |
| **Vendor / contracts** | Design-system primitives, shared schemas & types | nothing app-level |

If feature A needs something from feature B: move that thing down to a shared layer, or compose both at the route level. Don't reach sideways.

## 3. Where does this code go?

| You are adding… | Put it… |
|---|---|
| A component used by one parent | Inside the parent's folder (`_components/<Name>/` nested) |
| A component used by several routes/features | `components/<area>/` (promote it, update imports) |
| A design-system primitive (button, badge, modal) | The UI kit / vendor layer — not app `components/` |
| Data fetching / mutation | A hook in the data layer (`lib/hooks/<domain>.ts`), built on the single API client. Components never call `fetch` directly |
| Logic that uses state/effects/context | A custom hook: colocated `use<Thing>.ts` in the feature, or `lib/hooks` if shared |
| Pure transformation, formatting, a business rule for one feature | `helpers.ts` beside the component that uses it |
| A domain-agnostic pure function used app-wide (`clamp`, `formatBytes`) | `lib/<purpose>.ts`, named by purpose — not `utils.ts` |
| A constant used by one component/feature | `constants.ts` in that folder |
| A constant used across features | `lib/<domain>-constants.ts` or next to the shared module that owns the concept |
| Env/config values | One config module that reads env once (`lib/config.ts` or the API module) |
| User-facing text | i18n messages, never `constants.ts` |
| Types for one component | Same file or `types.ts` beside it |
| API / domain types | The shared contracts package — never redeclare them locally |
| Global state (theme, toasts, current repo) | A provider/context in `lib/` — only for truly cross-cutting state |

## 4. Component folder anatomy

One component = one folder, named after the component (PascalCase):

```
FindingsPanel/
├── FindingsPanel.tsx        # the component (one exported component per file)
├── index.ts                 # public entry: re-exports ONLY this component
├── styles.ts                # styles for this component
├── constants.ts             # optional: values used only here
├── helpers.ts               # optional: pure functions used only here
├── helpers.test.ts          # tests for helpers
├── FindingsPanel.test.tsx   # component test
├── useFindingsFilter.ts     # optional: hook used only here
└── _components/             # children used only by FindingsPanel
    └── SeverityCounters/    # same anatomy, recursively
```

Why: the folder is the unit of ownership; `index.ts` is the only thing outsiders import, so internals can be renamed freely. Keep files optional — don't create empty `constants.ts` / `helpers.ts` "for symmetry".

Nesting depth: stop around 3–4 levels of `_components`. Deeper usually means a child is really its own feature section — lift it to a sibling or to the route's `_components/`.

## 5. Splitting components

Split when you see any of these signals (not just line count):
- The component does more than one job: fetches data **and** filters **and** renders a list **and** a modal.
- A block of JSX has its own state or its own name in conversation ("the severity counters").
- You need to scroll to see the whole return, or the file passes ~200 lines.
- More than ~7 props, or boolean props that switch between different layouts (`isCompact`, `showHeader`, `variant="modal"`): that's two components.
- Logic between `useState` and `return` is longer than the JSX.

How to split:
1. **Extract logic first**: pure computation → `helpers.ts`; state + effects + data → a `use<Feature>()` hook. Often this alone fixes the component.
2. **Extract named UI pieces** into nested `_components/`. Pass them data, not the whole parent state.
3. **Prefer composition over configuration**: `children` / slot props / compound components (`<Tabs><Tabs.Panel/></Tabs>`) instead of growing a flag list.
4. **Container/presentational is optional, not a rule.** Custom hooks already separate "how it works" from "how it looks". Split into a data wrapper + pure view only when the view is reused with different data or needs isolated tests/stories.
5. **Keep state as low as possible** — in the smallest component that needs it; lift only to the closest common parent.

Do not split into components that are used once *and* have no own name, state or logic — that just adds indirection.

## 6. Business logic

Three tiers, each with one job:

| Tier | Contains | Knows about React? | Lives in |
|---|---|---|---|
| **Domain / pure logic** | Rules, calculations, sorting/grouping, mapping DTO → view model, validation | No | `helpers.ts` (feature) or `lib/<domain>.ts` (shared) |
| **Hooks (orchestration)** | Server state (query/mutation), derived UI state, effects, subscriptions | Yes | colocated `use*.ts` or `lib/hooks/<domain>.ts` |
| **Components** | Rendering, wiring events to hooks/handlers | Yes | component folder |

Rules:
- **No business rules in JSX or in component bodies.** `if (finding.severity === "CRITICAL" && !finding.dismissed && run.status === "done")` belongs in a named helper (`isBlocking(finding, run)`); the component calls it. Named rules are readable, testable and reused.
- **Derive, don't store.** Compute values from props/state during render (or in a helper); don't mirror them into state with effects.
- **Event logic goes in event handlers**, not effects. Effects are for syncing with external systems.
- **One data-access path.** All requests go through one API client; components use data hooks. This keeps caching, auth, errors and query keys in one place.
- **Map at the boundary.** If the API shape differs from what the UI wants, transform once (in the hook's `select` or a mapper helper), not in every component.
- **Query keys belong to the data layer.** Keep keys and query functions together (a key factory or `queryOptions()` per domain) so invalidation and reuse don't depend on string literals scattered across components.
- **Server-only access (Next.js)**: when fetching on the server, keep it in a server-only data access module (auth checks + minimal DTOs), never inline in components.

## 7. Constants

- **Scope decides location** (see table §3). Start in the component's `constants.ts`; promote when shared.
- **No magic values in logic or JSX**: thresholds, limits, intervals, enum-like option lists, storage keys, route segments get a name.
- **Naming:** module-level true constants in `CONSTANT_CASE` (`POLL_INTERVAL_MS`, `MAX_VISIBLE_FINDINGS`); include the unit in the name. Lookup maps can be `camelCase` or `CONSTANT_CASE` — follow the codebase.
- **Type them precisely:** `as const` / `satisfies` for option lists and maps so unions are derived from data (`type Tab = (typeof TABS)[number]`), not duplicated.
- **What is not a constant:** UI strings (→ i18n), env-dependent values (→ config module), design tokens (→ design system / CSS vars), API enums (→ shared contracts).
- **Avoid a global `constants.ts` dump.** It becomes an unowned grab-bag that every feature imports; group by domain instead.

## 8. Helpers vs utils

| | `helpers.ts` (feature helper) | `lib/<purpose>.ts` (shared util) |
|---|---|---|
| Knows the domain? | Yes (findings, runs, PRs) | No, or one well-defined domain concept |
| Used by | One component / feature | ≥2 features |
| Location | Beside the user | `lib/`, named by purpose |

Rules for both:
- **Pure functions, no React imports, no JSX.** A function that needs hooks is a hook; a function that returns JSX is a component.
- **Name the file by what it does** (`format-cost.ts`, `github-urls.ts`, `severity.ts`), not `utils.ts` / `common.ts` / `misc.ts`. A file you can't name has no single purpose — split it.
- **Defined outside the component body**, so they aren't recreated each render and can be tested directly.
- **Test them** with plain unit tests (`helpers.test.ts`) — they are the cheapest place to cover business rules.
- **Before writing one, search.** Reuse an existing helper or the standard library / an installed dependency first.

## 9. Types

- Colocate component prop types in the component file (`type Props = …`). Export them only if a parent needs them.
- API/domain types come from the shared contracts package. Redeclaring a "similar" local type drifts silently — and a local union with an extra member renders states the API never sends.
- Derive instead of duplicating: `Pick`, `Omit`, `z.infer`, `(typeof X)[number]`.

## 10. Imports, barrels and boundaries

- **Use path aliases** (`@/…`, package aliases) for anything outside the current feature folder; use `./` only within a folder. Never `../../../` across features.
- **Import a component through its folder's `index.ts`**, never its internal files from outside.
- **Per-component `index.ts` is fine** (re-exports one module). **Avoid aggregate barrels** that `export *` a whole tree (e.g. `components/index.ts` re-exporting everything): they bloat the module graph, slow builds/tests, cause circular imports and defeat tree-shaking. Keep an existing barrel the codebase mandates; don't create new ones.
- **No cross-feature internal imports.** If you need another feature's piece, promote it to shared.
- **Enforce with lint where possible** — `import/no-restricted-paths` zones or `eslint-plugin-boundaries` element types — so the rules don't depend on review.

## 11. Naming

| Thing | Convention |
|---|---|
| Component file & folder | `PascalCase` (`FindingCard/FindingCard.tsx`) |
| Hook | `useThing.ts`, exports `useThing` |
| Non-component modules | follow the repo (kebab-case `github-urls.ts` or role names `helpers.ts`, `constants.ts`, `styles.ts`) |
| Next.js private folders | `_components`, `_lib` — opt out of routing |
| Tests | `<file>.test.ts(x)` beside the file |

Exports: prefer **named exports** (greppable, rename-safe); add a default export only where a framework or the repo convention requires it.

## 12. Anti-patterns

- `utils.ts` / `helpers.ts` with 40 unrelated functions → split by purpose.
- Global `constants.ts` / `types.ts` / `hooks/` folder that every feature dumps into.
- Business rules inline in JSX conditions or `useEffect`.
- `fetch` inside components; query keys as string literals in components.
- A "shared" component with feature-specific props (`isFindingsPage`) → it isn't shared; move it back or split it.
- Promoting to `components/` after a single use "because it might be reused".
- Feature A importing `../../featureB/_components/X/X` → promote X.
- God component: data + filters + list + modal + keyboard shortcuts in one file.
- Deep relative imports and aggregate barrels.
- Empty boilerplate files created for symmetry.

## 13. Checklist (new code or review)

- [ ] Does each new file live next to its only user (or in shared, if ≥2 real users)?
- [ ] Is the route `page.tsx` thin?
- [ ] Is business logic in named pure functions, state/data in hooks, and only rendering in components?
- [ ] Does data go through the API client + data hooks (no `fetch` in components, no inline query keys)?
- [ ] Are magic values named in the right-scoped `constants.ts`, and UI strings in i18n?
- [ ] Are types imported from contracts rather than redeclared?
- [ ] Do imports go downward only, via aliases and folder `index.ts`, with no cross-feature internals and no new aggregate barrels?
- [ ] Are file names purposeful (no `utils.ts`, no `misc.ts`)?
- [ ] Are helpers covered by unit tests?

When reviewing, report structure issues with the file path and the concrete move ("move `isBlocking` from `FindingCard.tsx` to `FindingCard/helpers.ts`"), not just "improve structure".
