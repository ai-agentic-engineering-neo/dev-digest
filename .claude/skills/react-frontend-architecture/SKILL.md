---
name: react-frontend-architecture
description: "Architecture rules for React 19 + Next.js App Router code: where a component, hook, helper, constant, type or piece of business logic belongs, when to split a component, how to layer view / hooks / plain modules / api, who owns each kind of state, and how to keep the Server/Client boundary and import direction sane. Use this whenever you create, move, or review files under client/src, add a route or _components folder, extract logic out of a component, decide between a hook and a plain function, place a constant or helper, or are asked about folder structure, colocation, feature folders, barrels, or 'where should this go'. Apply it even when the user only asks to add a small feature, because placement decisions are made implicitly on every edit. Complements react-best-practices (anti-patterns) and next-best-practices (file conventions); this skill decides placement and layering."
paths:
  - "client/**"
metadata:
  tags: react, nextjs, architecture, folder-structure, colocation, layering, state, boundaries
---

# React frontend architecture

Placement and layering rules for a React + Next.js App Router codebase. Every
rule here is a decision that sources disagree on somewhere; `README.md` in this
folder records the decision, the rejected alternative, and the sources.
`examples.md` shows each rule as a before/after taken from this repo.

Read this skill top to bottom once, then use the **Placement table** and the
**Review checklist** on every edit.

## The one idea

Put code as close as possible to the only thing that uses it, and move it
outward only when a second user appears. Everything else below is that rule
applied to components, hooks, helpers, constants, types, state and routes.

Why: colocated code changes together, is discoverable by opening the folder,
and can be deleted by deleting the folder. Code promoted "just in case" becomes
an orphan nobody dares remove.

## Layers (what kind of file am I writing?)

```
view      JSX, stateless where possible. Receives data + callbacks, renders. No fetch, no formatting math.
hooks     Stateful or effectful logic, named by use case (useRunTrace, useActiveRepo). Orchestrate; do not decide.
domain    Plain TypeScript modules: validation, calculation, formatting, mapping. No React import. Unit-tested alone.
api       One shared client (`src/lib/api.ts`) + per-domain query/mutation hooks. Maps server shapes to what the view needs.
```

Dependencies point inward: view → hooks → domain, and hooks → api. A domain
module never imports React or the api client. A view never calls `api.*`.

Decide the layer with two questions:

1. **Does it call a hook?** No → it is a plain function, not a hook. Put it in
   `helpers.ts` beside its consumer or in a topic module under `src/lib/`.
   A `useSortedRuns()` that only sorts is a `sortRuns()` in disguise.
2. **Does it touch the network, timers, or browser APIs?** Yes → a hook (or the
   api layer). The view should read as intent, not as implementation.

A hook that returns a dozen values is hiding either a component that should be
split or logic that should be a plain module.

## Placement table

| Thing | Used by one component | Used by several components on one route | Used by several routes |
|---|---|---|---|
| Sub-component | same folder, `_components/<Name>/` under the parent | route `_components/<Name>/` | `src/components/<kebab-name>/` |
| Helper (pure) | `helpers.ts` beside the component | route-level `helpers.ts` | `src/lib/<topic>.ts` (named by topic: `format-cost.ts`, `github-urls.ts`) |
| Constant | `constants.ts` beside the component | route-level `constants.ts` | `src/lib/<topic>.ts` next to the helper that uses it, or the design-system tokens |
| Type | inline in the file, not exported | `types.ts` in the route folder | API shapes come from `@devdigest/shared`, imported directly and never redeclared; a UI-only type shared by routes sits next to the helper that produces it |
| Query / mutation hook | never (data hooks are always domain-level) | `src/lib/hooks/<domain>.ts` | `src/lib/hooks/<domain>.ts` |
| UI state | `useState` in the component | lift to the closest common parent | URL search params if it should survive reload; otherwise a scoped provider |
| Styles | `styles.ts` beside the component | same | design system (`@devdigest/ui`) only if the task is about the design system |

Rules the table implies:

- **No `utils/` or `helpers/` folder.** A junk drawer named by file type
  attracts everything and explains nothing. A promoted helper gets a topic
  name and lives in `src/lib/<topic>.ts` with its own test.
- **A sub-component starts as one file and earns a folder.** Under
  `_components/`, a component is either `<Name>.tsx` (one component per file,
  PascalCase) or `<Name>/` once it has siblings: `<Name>.tsx`, `index.ts`,
  `styles.ts`, `constants.ts`, `helpers.ts`, `<Name>.test.tsx`. Create a
  sibling file only when there is content for it. No lowercase grab-bag files
  holding several components (`atoms.tsx`).
- **Files beside `page.tsx` are fine; folders are not.** Route-level
  `constants.ts`, `helpers.ts`, `styles.ts`, `types.ts` can sit next to
  `page.tsx`: Next.js only reserves fixed file names (`page`, `layout`,
  `loading`, `error`, `not-found`, `route`, `template`, `default`). Any
  sub-folder that is not a route segment must be `_private` (`_components/`,
  `_lib/`), otherwise a future `page.tsx` inside it becomes a URL.
- **Depth budget: two `_components` levels, counted from the route
  folder.** `route/_components/A/_components/B` is the maximum. A third level
  (`route/_components/A/_components/B/_components/C`) means B is a
  screen-sized piece; promote B to the route's `_components/` and let C sit
  beside it.
- **When a domain accrues components, hooks and helpers that two or more
  routes share, group them.** Create `src/features/<domain>/` with `api/`,
  `components/`, `helpers.ts` instead of scattering them across
  `src/components/` and `src/lib/`. Do not create `features/` speculatively;
  today no domain has crossed that line.

## Splitting a component

Split when one of these triggers fires, and not for symmetry:

- It has a second responsibility (fetches and formats and lays out).
- Markup contains a loop or a multi-branch conditional: extract a named
  component with props. Never a `renderRow()` function inside the component.
- It owns state its parent does not care about (an open/closed flag, a draft).
- Part of it re-renders on every keystroke and the rest should not.
- It no longer fits on one screen.

A component either **implements** something or **composes** other components.
When it does both, the implementing part is the thing to extract.

Keep the withdrawn pattern withdrawn: no `containers/` vs `components/` split.
The concern it served (isolate stateful logic) is met by a hook plus a
stateless view in the same folder.

Prefer composition to memoization. Move state down into the component that
uses it, or lift static content up as `children`, before reaching for `memo`.

## State: five kinds, five owners

| Kind | Owner | Never |
|---|---|---|
| Server data | React Query hook in `src/lib/hooks/<domain>.ts` | copied into `useState`, stored in context |
| URL state (filters, tab, selected id) | `useSearchParams` + `router.replace` | duplicated in `useState` |
| Component UI state | `useState` / `useReducer` in the component | lifted "just in case" |
| Cross-cutting app state (theme, active repo, toasts) | a scoped provider in `src/lib/*.tsx` exposing `useX()` that throws outside the provider | a general-purpose global store |
| Form state | the form component or a form library | React Query |

- Derive, do not sync. Anything computable from props, state, or query data is
  computed in render. `useMemo` only after measuring.
- Context is dependency injection and scoping, not a state manager. Add a
  provider when a subtree needs the same resolved value (current repo, theme),
  never to avoid passing two props.
- `useReducer` when several handlers touch the same state or update bugs
  cluster; reducers are pure and tested in isolation. Otherwise `useState`.

## Business logic and server shapes

- Validation, calculation, formatting and sorting live in plain modules the
  view imports. They are tested without rendering anything.
- The view never sees raw transport concerns. The hook (or the api module)
  returns what the view needs; date parsing, status derivation and cost
  formatting happen once, in one place, not in three components.
- Contracts from `@devdigest/shared` are the API shape. Derive view types from
  them (`Pick`, `Omit`, mapping functions); never redeclare them.

## Next.js App Router

- `page.tsx` and `layout.tsx` are thin composers: resolve params, render the
  view. A page that holds filtering, sorting and derived counts is a view
  wearing a route's name; move that into `_components/<RouteName>View/` and
  its `helpers.ts`.
- Push `"use client"` to the leaves. The directive marks a module-graph
  boundary: everything the file imports ships to the browser. Preferred route
  shape: a server `page.tsx` that returns `<XView />`, and `XView` carries the
  directive.
- Providers are `"use client"` wrappers that take `children`, rendered at the
  nearest layout that needs them.
- Client Components never import Server Components. Pass server-rendered JSX
  as `children` or props; props must be serializable.
- This app talks to a separate Fastify API, so it uses the HTTP-API model:
  every fetch goes hook → `api.*` → Fastify. No Server Actions, no Route
  Handlers, no in-process data access layer. Do not mix models.
- Data hooks stay client-side (`useQuery` with polling and focus refetch as
  the UI needs). Server prefetch + `HydrationBoundary` is an optimization to
  add only when a measured first-paint problem justifies the extra layer.
- Route-scoped UI lives in a private `_components/` beside its `page.tsx`.
  Cross-route UI lives in `src/components/`. Route groups `(name)` partition
  sections that need their own layout; they do not change URLs.

## Module boundaries

- Import direction: `src/vendor/*` → `src/lib/*` → `src/components/*` →
  `src/app/**`. Nothing imports upward. A route never imports another
  route's `_components/`; if two routes need it, promote it.
- **Barrels:** a component folder may have a one-line `index.ts` with a named
  re-export, because it keeps the import path stable while the folder grows.
  Nothing else gets a barrel. No `export *`, no aggregating `index.ts` over a
  layer or a domain, and never import a folder's own barrel from inside that
  folder (it creates cycles). New code imports domain hook files directly
  (`@/lib/hooks/reviews`), not the aggregate. Existing `index.ts` files that
  also re-export `X as default`, and the re-export aggregates
  `src/lib/hooks/index.ts` and `src/lib/types.ts`, are grandfathered: do not
  extend them, do not add a default export to a new one, and import
  `@devdigest/shared` directly instead of `@/lib/types`.
- Absolute imports via `@/` across folders; relative imports inside a folder.
- Naming: PascalCase files and folders under `_components/` (one component
  each), kebab-case for everything else, including
  `src/components/<kebab-name>/` and `src/lib/<topic>.ts`.
- Enforce, do not rely on review. `client/eslint.config.mjs` has no
  boundary rules yet. When adding them, mirror the server package: a
  `.dependency-cruiser.cjs` with the rules above as the source of truth behind
  `pnpm lint:arch` (with a known-violations baseline so legacy code does not
  block CI), plus core-ESLint `no-restricted-imports` patterns as warnings for
  editor feedback. Config in `examples.md` §11.

## Review checklist

Run through this on any PR that adds or moves files under `client/src`:

1. Is each new file in the innermost folder that covers all its consumers?
2. Does any `page.tsx` contain logic beyond wiring params to a view?
3. Is there a function prefixed `use` that calls no hooks, or a `renderX()`
   inside a component?
4. Does any component call `api.*`, parse dates, or format money itself?
5. Is any query result or URL param mirrored into `useState`?
6. Is a new provider or context carrying state that one subtree could own?
7. Did a new `utils/`, `helpers/`, `types/` or aggregate `index.ts` appear?
8. Did nesting exceed two `_components` levels?
9. Does a `"use client"` sit on a page or layout when a leaf would do?
10. Did anything import upward (lib from app, components from app)?

For each violation, name the rule and the target location; the fix is almost
always a move plus an import change, not a rewrite.

## Related skills

- `react-best-practices`: what not to write inside a component (effects,
  keys, memo, derived state). Apply together.
- `next-best-practices`: file conventions, async params, RSC boundary
  mechanics, metadata, error files.
- `react-testing-library`: how to test the hook / helper / view once split.
