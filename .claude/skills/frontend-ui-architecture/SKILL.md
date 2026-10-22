---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React + Next.js App Router projects. Use when deciding where a component, constant, helper, util, type, hook, API call or business logic should live; how to split a component, page or feature into files and folders; when to move code to a shared folder; or how to draw import and server/client boundaries. Trigger terms: folder structure, project structure, where to put, colocation, _components, constants.ts, helpers.ts, utils, lib, business logic, feature folder, barrel, index.ts, 'use client' boundary. Not for performance, hooks or state rules (see react-best-practices) or Next.js file conventions (see next-best-practices)."
metadata:
  version: 1.0.0
  updated: 2026-10-15
  tags: react, nextjs, app-router, architecture, folder-structure, colocation, code-organization
---

# Frontend UI Architecture

Answers **"where does this code go, and how is it split?"** for React + Next.js App Router.
Sources and rationale: [README.md](README.md). Worked examples: [examples.md](examples.md).

Out of scope — use the sibling skill instead:
- Hooks rules, state, effects, memoization, rendering anti-patterns → `react-best-practices`
- Next.js file conventions, RSC data patterns, metadata, images, bundling → `next-best-practices`

**Project rules win.** If the repo has a `CLAUDE.md` / conventions doc, follow it first and use
this skill to fill the gaps. In DevDigest read `client/CLAUDE.md` — it already fixes
`_components/<Name>/`, `src/components/`, `src/lib/api.ts`, `src/lib/hooks/*` and `messages/en`.

## Core principles

1. **Colocate by default.** Code lives next to the only thing that uses it. Things that change
   together stay together (Kent C. Dodds, Robin Wieruch).
2. **Promote on the second consumer.** Move code up one level only when a second, unrelated
   consumer needs it — never "in case it gets reused".
3. **Dependencies point one way:** `app (routes) → features/route code → shared components → lib`.
   Lower levels never import from higher ones; siblings don't reach into each other (FSD).
4. **Components render; logic lives elsewhere.** Data access, domain rules and side-effects go
   into hooks, pure functions and the API layer — not into JSX bodies.
5. **Routes are thin.** `page.tsx` / `layout.tsx` read params, call hooks / data functions and
   compose components. They don't hold domain logic or big chunks of markup.
6. **Name by what it is, not where it sits.** No `misc/`, `common/`, `stuff/`, catch-all `utils.ts`.

## Placement ladder — "where does X go?"

Walk the ladder from the top; stop at the first level that fits. Details: [references/placement.md](references/placement.md).

| Level | Location (Next.js App Router) | Holds code used by… |
|---|---|---|
| 1. Component-local | `…/_components/<Name>/` files, or above the component in the same file | one component |
| 2. Route-local | `app/<route>/` next to `page.tsx` (`constants.ts`, `helpers.ts`, `_components/`) | one route (and its child segments) |
| 3. Shared UI | `src/components/<kebab-name>/` | ≥ 2 routes |
| 4. App infrastructure | `src/lib/` (`api.ts`, `hooks/`, providers, contexts, integrations) | the whole app |
| 5. Design system / contracts | external package (`@devdigest/ui`, `@devdigest/shared`) | many apps / packages |

Quick decisions:

| You are adding… | Put it in |
|---|---|
| A sub-component used only by `FindingCard` | `FindingCard/` folder, or same file if tiny and tightly coupled |
| A component used by one route | `app/<route>/_components/<Name>/` |
| A component used by two routes | `src/components/<kebab-name>/` |
| A base primitive (button, badge, modal) | the design system (`@devdigest/ui`) — check it exists first |
| A constant (map, enum-like table, limit) for one component | `<Name>/constants.ts` |
| A constant for one route | `app/<route>/constants.ts` |
| An env value / runtime setting | one config module (`src/lib/…`), read env only there |
| A user-facing string | i18n messages (`messages/en/*.json`), never a constant |
| A pure function for one component / route | `helpers.ts` next to it |
| A pure, domain-free function used app-wide (format, parse) | `src/lib/<topic>.ts` (e.g. `format-cost.ts`) |
| A wrapper/config around a 3rd-party library or the HTTP client | `src/lib/` |
| An HTTP call | the API layer (`src/lib/api.ts`) — never `fetch` in a component |
| Server-state hook (query / mutation) | `src/lib/hooks/<domain>.ts` |
| A UI-only hook used by one component | `<Name>/hooks/useX.ts` or in the component file |
| A type for one component's props | inside the component file |
| A type shared across files of a route / feature | `types.ts` at that level |
| An API contract / DTO | shared contracts package (`@devdigest/shared`) |
| A test | next to the file it tests (`Name.test.tsx`) |
| Styles for one component | `<Name>/styles.ts` (or the project's styling convention) |

## Component folder anatomy

```
_components/FindingCard/
  FindingCard.tsx       # the component — named export, PascalCase file = component name
  index.ts              # public entry: re-exports only what outsiders may import
  constants.ts          # static values used by this component
  helpers.ts            # pure functions (no React, no I/O) — easy to unit-test
  styles.ts             # style objects / class maps
  hooks/useX.ts         # component-specific hooks (only if non-trivial)
  _components/Sub/      # private sub-components (max ~2 nesting levels)
  FindingCard.test.tsx  # colocated test
```

Create only the files you need — a 30-line component with no constants is a single file + `index.ts`.

## Splitting a component — signals

Split when **any** is true (each piece gets its own file in the same folder or `_components/`):
- It mixes data fetching / orchestration with markup → extract a hook; component only renders.
- It renders independent regions (header, list, footer) with their own state or handlers.
- A block of JSX is repeated or has its own loading/empty/error states.
- A pure computation is longer than a few lines → `helpers.ts`.
- File passes ~200 lines or the props list passes ~7 (smell, not a hard rule).

Don't split just to hit a size target: a tightly coupled `ListItem` can stay in `List.tsx`.

## Business logic — where it goes

Details and code: [references/business-logic.md](references/business-logic.md).

| Kind of logic | Home |
|---|---|
| Transport (URL, headers, errors, JSON) | API layer — `src/lib/api.ts` |
| Server state (cache keys, fetch, invalidate) | domain hook files — `src/lib/hooks/<domain>.ts` |
| Domain rules (derive status, compute score, group/sort) | pure functions in `helpers.ts` (route/component) or `src/lib/<domain>.ts` |
| UI orchestration (open/close, selection, form flow) | a custom hook beside the component |
| Rendering | the component |

A component should read like: *get data from a hook → derive with pure helpers → render*.

## Imports and boundaries

Details: [references/imports-boundaries.md](references/imports-boundaries.md).

- Use the path alias (`@/lib/...`, `@/components/...`) for anything outside the current folder
  tree; relative imports only within the same component/route folder (`./constants`).
- Import another component through its folder entry (`@/components/severity-counts`), never its
  internals (`@/components/severity-counts/helpers`).
- No cross-route imports: `app/agents/**` must not import from `app/repos/**/_components`.
  Need it in both? Promote it to `src/components/`.
- `index.ts` is allowed as a **folder's public entry** (component, hooks module). Don't create
  app-wide barrels that re-export everything (`src/components/index.ts`).
- Named exports for components, hooks and helpers; default export only where Next.js requires it
  (`page.tsx`, `layout.tsx`, `error.tsx`, …).

## Next.js App Router layer

Details: [references/nextjs-app-router.md](references/nextjs-app-router.md).

- `app/` = routing + composition. Route-private code goes in `_`-prefixed folders
  (`_components/`) so it is never routable and is visibly private.
- Use route groups `(group)` to share a layout or organise routes without changing the URL.
- Put `'use client'` at the **entry** of an interactive subtree, as low as possible. Pass server
  content into client components via `children` / props instead of importing it.
- Server-only modules (secrets, DB, server actions) start with `import 'server-only'`; keep
  server actions thin (validate → call service → revalidate).
- DevDigest's client talks to a separate Fastify API: no DB or secrets in the client, all
  data through `src/lib/api.ts` + `src/lib/hooks/*`.

## Anti-patterns

| Anti-pattern | Instead |
|---|---|
| Global `utils.ts` / `helpers/` dumping ground | Colocated `helpers.ts`; promote a named module (`format-cost.ts`) when shared |
| `fetch()` / API URLs inside components | API layer + hook |
| Business rules inside JSX or event handlers | Pure helper + hook; handler calls them |
| Promoting to `shared` on first use | Promote on the second consumer |
| Deep relative imports (`../../../../lib/x`) | Path alias `@/lib/x` |
| Reaching into another component's internals | Import via its `index.ts` |
| Cross-feature / cross-route imports | Promote to shared or compose at the route |
| Nesting folders > 2–3 levels of `_components` | Flatten or promote |
| Hard-coded UI strings in constants | i18n message files |
| `'use client'` on a whole layout "to be safe" | Push the boundary down to the interactive leaf |
| One file per type / constant (`types/user.ts`, `constants/colors.ts`) at root | Colocate; group by feature |

## Checklist before finishing a change

- [ ] Each new file sits at the lowest ladder level that has all its consumers.
- [ ] No component calls `fetch` or knows an API URL.
- [ ] Domain logic is in pure functions / hooks and has a test where non-trivial.
- [ ] Imports use the alias across folders and folder entries across components.
- [ ] No new cross-route import, no new catch-all utils file, no new global barrel.
- [ ] Project `CLAUDE.md` rules (strings, primitives, contracts) are respected.
