---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for the Next.js App Router + React + TanStack Query client. Decides where components, constants, helpers, utils, hooks, types, business logic and API calls live; how to split a component into a folder; layering and import-direction rules; where the server/client boundary goes; when to promote code to shared. Use when adding a page, screen, feature or component in client/, moving or splitting files, asking 'where should this go', or reviewing a PR for structure. Not for hook correctness, rendering performance or Next.js API details (use react-best-practices / next-best-practices)."
metadata:
  version: "1.0.0"
  scope: "client/"
---

# Frontend UI Architecture

Where code lives and how it is split in `client/`. Rules are ordered by impact.
Detailed trees: [references/layout.md](references/layout.md). Before/after code:
[references/examples.md](references/examples.md). Sources and changelog: [README.md](README.md).

Out of scope (don't repeat here): hooks rules, memoization, RSC serialization
errors → `react-best-practices`, `next-best-practices`.

## 1. Principles

1. **Colocate by default.** Code starts next to the only thing that uses it
   (component folder → route segment → shared). Move it *up* only when a second
   consumer appears; move it *down* when the last other consumer disappears.
2. **Promote on real reuse, not on guess.** Duplicate once; extract on the
   second/third real use (AHA). A shared abstraction with a flag per caller is worse
   than two copies.
3. **Dependencies point one way:** route → feature → shared → primitives/lib.
   Never import upward or sideways into another feature's internals.
4. **Routes are thin.** `page.tsx`/`layout.tsx` wire params and render a View.
5. **Logic out of JSX.** Pure rules in `helpers.ts`, stateful orchestration in a
   custom hook, server state in `lib/hooks`, markup in the component.
6. **Every folder has a public API** (`index.ts`); everything else is private.

## 2. Layer map

| Layer | Location | Contains | May import |
|---|---|---|---|
| Route | `src/app/**/page.tsx`, `layout.tsx` | params → View, metadata | Feature, Shared, lib |
| Feature | `src/app/**/_components/<Name>/` | screen-specific UI, its hooks/helpers/constants | Shared, primitives, lib |
| Shared UI | `src/components/<kebab-name>/` | UI used by ≥2 routes (app-shell, diff-viewer) | primitives, lib |
| Primitives | `src/vendor/ui` (`@devdigest/ui`) | design-system kit — compose, never edit | — |
| Data | `src/lib/hooks/<domain>.ts` → `src/lib/api.ts` | TanStack Query hooks, fetch client | contracts |
| Lib | `src/lib/*.ts` | domain-agnostic pure utils, app-wide providers/context | contracts |
| Contracts | `src/vendor/shared` (`@devdigest/shared`) | Zod schemas + types shared with server | — |
| Copy | `messages/en/<namespace>.json` | every user-facing string | — |

Forbidden: `src/components` → `src/app`; `lib` → any component; feature A →
`feature-B/_components/...` or `feature-B/helpers`; any component → `fetch`/`api` directly.

## 3. Where does it go?

| You have… | Put it in |
|---|---|
| New route | `src/app/<segment>/page.tsx` rendering `<XxxView/>` from `./_components/XxxView` |
| UI used by one screen | that screen's `_components/<Name>/` |
| Sub-part used only inside `<Name>` | `<Name>/_components/<Sub>/` |
| UI used by ≥2 routes | `src/components/<kebab-name>/` (promote, update imports, move tests) |
| Generic button/modal/badge | already in `@devdigest/ui` — compose it; don't re-create |
| Constant used by one component | `<Name>/constants.ts` |
| Constant used across features / env config | `src/lib/<topic>.ts` (e.g. `API_BASE` in `api.ts`) |
| Pure function about this component's data | `<Name>/helpers.ts` (+ `helpers.test.ts`) |
| Pure, domain-agnostic function used ≥2 places | `src/lib/<purpose>.ts` (`format-usage.ts`, `github-urls.ts`) |
| Stateful UI logic (state + effects + handlers) | `use<Thing>` in `<Name>/hooks/` or `<Name>/use<Thing>.ts` |
| Server data read/write | hook in `src/lib/hooks/<domain>.ts`, re-exported from `lib/hooks/index.ts` |
| Request/response types | `@devdigest/shared` contracts (update **both** vendor copies) |
| UI-only prop/view types | in the component file; `types.ts` in the folder only when shared by siblings |
| Styles | `<Name>/styles.ts` (`export const s = {...}`) |
| User-facing text | `messages/en/<feature>.json` + `useTranslations("<feature>")` |
| Cross-cutting client state (active repo, theme, toast) | provider in `src/lib/*.tsx`, mounted in `lib/providers.tsx` |
| Shareable view state (tab, filter, page) | URL search params, not React state |

## 4. Component folder anatomy

```
<Name>/
├── index.ts          # public API: export { Name }; nothing else leaks
├── <Name>.tsx        # the component: composition + markup only
├── <Name>.test.tsx   # behaviour test, next to the code
├── constants.ts      # SCREAMING_SNAKE module constants, lookup maps
├── helpers.ts        # pure functions (no React, no I/O) + helpers.test.ts
├── styles.ts         # colocated style objects
├── hooks/ | use<X>.ts  # stateful logic of this component only
└── _components/      # private children, same anatomy, recursively
```

- Create only the files you need; an empty `constants.ts` is noise.
- File order inside `<Name>.tsx`: imports → types → component → small private
  subcomponents. Constants/helpers live in their files, not above the component.
- One exported component per file. Tiny private atoms may share a file
  (e.g. `_components/atoms.tsx`).
- `PascalCase` for component folders and files; `kebab-case` for shared
  `src/components/<name>` folders and `lib/*.ts` modules; hooks `useCamelCase`.
- `use` prefix only if the function calls hooks; name hooks by purpose
  (`useCreateAgentForm`), not lifecycle (`useMount`).
- Named exports; `default` only where Next.js requires it (`page`, `layout`, …).

## 5. When and how to split

Split a component when any holds:
- it renders two+ independent regions (header / list / drawer) → one child each;
- the file passes ~200 lines or the props pass ~7;
- a block of JSX needs its own state or its own test;
- the same markup repeats in a `.map` with non-trivial body → row component.

How: extract to `_components/<Child>/`, pass data down, callbacks up. Prefer
`children`/slots over forwarding many props. Don't split into "container" and
"presentational" twins by reflex — a custom hook now plays the container role.

## 6. Business logic placement

| Kind of logic | Home | Why |
|---|---|---|
| Derivation, mapping, sorting, formatting, validation rules | `helpers.ts` / `lib/*.ts` pure functions | testable without React |
| Server state: fetch, cache, invalidate, optimistic update | `lib/hooks/<domain>.ts` (TanStack) | one cache, one key scheme |
| UI orchestration: form state, wizard steps, keyboard, SSE wiring | `use<Thing>` custom hook | component stays declarative |
| Input/contract validation | Zod schema in `@devdigest/shared` | same rules as server |
| Access to secrets / server-only work | server (API or `server-only` module) | never ship to the browser |

Component body keeps: calling hooks, choosing what to render, binding handlers.
If a handler has more than ~5 lines of logic, move the logic out.

## 7. Constants, helpers, utils

- **Constants:** module-level, `SCREAMING_SNAKE_CASE`, typed (`as const` or
  `Record<K, V>`). No magic numbers/strings in JSX. UI copy is **not** a constant —
  it goes to `messages/`. Query keys belong to the data hooks, not to components.
- **helpers vs utils:** a *helper* knows this feature's domain and lives beside it;
  a *util* is domain-agnostic and lives in `src/lib/`. Promote a helper to `lib/`
  only after it is generic and reused.
- Name modules by purpose (`format-usage.ts`), never `utils.ts`/`misc.ts` grab-bags.
- Helpers/utils are pure: no hooks, no `fetch`, no DOM, no module state.
  Everything pure gets a colocated `*.test.ts`.

## 8. Data layer

- Components never call `fetch` or `api.*`. They call `useXxx()` from `@/lib/hooks`.
- One file per API domain in `lib/hooks/`; each hook owns its `queryKey` and
  mutations invalidate the keys they affect. Keep keys hierarchical
  (`["agents"]`, `["agent", id]`) so invalidation by prefix works.
- Types come from `@devdigest/shared`; don't redeclare response shapes locally.
- Map API data to view data in a helper or `select`, not inline in JSX.
- When one key is reused (prefetch, `useQueries`, `setQueryData`), define a
  `queryOptions({ queryKey, queryFn })` factory next to the hook and reuse it
  instead of repeating the key literal.
- One API client (`lib/api.ts`); don't create per-feature fetch wrappers.

## 9. Server / client boundary

- `page.tsx`/`layout.tsx` stay Server Components when possible: read params,
  render a `"use client"` View. Put `"use client"` on the smallest subtree that
  needs state, effects or browser APIs, not on the route.
- Pass serializable props across the boundary; compose server content into client
  wrappers via `children`.
- Modules that must never reach the browser import `server-only`.
- Providers are separate client components that take `children`
  (`lib/providers.tsx`); add new ones there, not inside feature screens.
- Prefer translating in the server part and passing strings/`children` into client
  leaves; `useTranslations` inside client components is fine when they own the copy.
- The existing `"use client"` pages are legacy — don't copy that pattern into new routes.

## 10. Imports and public API

- Cross-tree imports use aliases: `@/lib/hooks`, `@/components/diff-viewer`,
  `@devdigest/ui`, `@devdigest/shared`. Relative paths only inside one folder tree
  (`./helpers`, `../constants`). No `../../../../../`.
- Import a folder through its `index.ts`; never deep-import another folder's
  `helpers`, `styles` or `_components`.
- `index.ts` exports only the public surface, one level deep: one per component
  folder or shared module. Never nest barrels, never import your own `index.ts` from
  inside the folder (cycles), no `export *` roll-ups except the existing
  `lib/hooks/index.ts` — don't add new ones.
- Private route-local folders use the `_` prefix so Next.js never routes them;
  group routes with `(group)` folders when they share a layout, not for tidiness.

## 11. Workflow: adding a screen or feature

```
- [ ] 1. Read client/INSIGHTS.md and the feature spec in client/specs/
- [ ] 2. Route: page.tsx (thin) → _components/<Feature>View/
- [ ] 3. Data: add/extend hooks in lib/hooks/<domain>.ts (+ contract in both vendor/shared copies)
- [ ] 4. Split View into _components/ children per region (section 5)
- [ ] 5. Move rules to helpers.ts, stateful flows to use<Thing>, strings to messages/en
- [ ] 6. Colocated tests: <Name>.test.tsx, helpers.test.ts
- [ ] 7. Run the review checklist below; fix; `pnpm typecheck && pnpm test`
```

## 12. Review checklist

- [ ] No `fetch`/`api` calls outside `lib/hooks` + `lib/api.ts`
- [ ] No imports from another feature's private files or upward into `src/app`
- [ ] Route files are thin; new routes are not `"use client"`
- [ ] No hardcoded user-facing strings; no magic values in JSX
- [ ] Pure logic sits in helpers/lib with tests; handlers are short
- [ ] Nothing promoted to `src/components` / `lib` with a single consumer
- [ ] No duplicated primitive that already exists in `@devdigest/ui`
- [ ] Aliases instead of deep relative paths; imports go through `index.ts`
- [ ] Contract changes are in both `vendor/shared` copies

## 13. Anti-patterns

- `utils/`, `helpers/`, `types/`, `constants/` at the app root collecting
  everything by file type — organize by feature instead.
- "Just in case" shared components with boolean props per caller.
- Logic-heavy `page.tsx` that fetches, filters and renders a whole screen.
- Business rules inside `onClick` or JSX ternary chains.
- Copying server response types into the client by hand.
- Context as a global store for server data (TanStack Query already is one).
- Barrel files that re-export everything and create import cycles.
- Custom hooks that only rename `useEffect` lifecycles or wrap one call without
  adding logic.

Rules are enforced by review today; if they start drifting, encode layers with
`eslint-plugin-boundaries` / `import/no-restricted-paths` (see README sources).
