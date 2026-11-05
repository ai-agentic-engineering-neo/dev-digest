---
name: frontend-ui-architecture
description: >-
  Frontend UI architecture and code organization for the DevDigest `client/` (Next.js 15 App Router,
  React 19, TanStack Query): where a new component, hook, helper, constant, type or piece of business
  logic goes; how to split a component; how routes, `_components/`, `src/components/` and `src/lib/`
  depend on each other; where state lives; where the `'use client'` boundary sits. Use this skill
  whenever you add or move files in `client/`, build a new screen, route or feature, extract code
  out of a growing component, review a PR for structure, or the user asks "where should this go?",
  "how to structure this?", "split this component", "де це покласти", "як розбити компонент",
  "архітектура фронтенду" — even if they don't say "architecture". Organization only: hook
  anti-patterns, performance and testing live in react-best-practices, next-best-practices and
  react-testing-library.
metadata:
  version: "1.1.0"
  updated: "2026-11-05"
---

# Frontend UI architecture

This skill decides **where code lives and which way dependencies point** in `client/`. It does not
cover how to write a hook well, how to make it fast, or how to test it. For those, use
`react-best-practices`, `next-best-practices` and `react-testing-library`.

The one idea behind everything below: **put code as close as possible to where it is used, and
promote it only when a second, unrelated owner needs it.** Code that changes together stays
together, so a feature can be read, changed and deleted in one folder.

## 1. The layers and the import direction

```
src/app/<route>/page.tsx            routing: params → hooks → compose          (thinnest)
src/app/<route>/_components/<Name>/ screen/feature UI owned by ONE route
src/components/<kebab>/             UI shared by 2+ routes (app-shell, run-cost-badge…)
src/lib/hooks/<domain>.ts           server state: every API call = TanStack Query hook
src/lib/*.ts                        app-wide non-UI: api.ts, providers, pure modules
@devdigest/ui · @devdigest/shared   design system · Zod contracts (vendored, read-only)
```

Imports go **down this list only**:

- A route may import its own `_components`, `src/components`, `src/lib`, `@devdigest/*`.
- `src/components` and `src/lib` never import from `src/app/**`. Shared code must not depend on a
  screen, or it stops being shared.
- Never import from a **sibling route's** `_components`. If two routes need the same component,
  promote it to `src/components/` (see §3).
- From another component's folder, import only its `index.ts`. Never import its `helpers.ts`,
  `styles.ts` or private `_components/`. Those are its internals.

## 2. Where does this piece of code go?

Ask these questions in order and stop at the first "yes":

| # | The code… | Goes to |
|---|---|---|
| 1 | calls the server (read or write) | a hook in `src/lib/hooks/<domain>.ts` that calls `api.*`. Never `fetch` in a component. |
| 2 | is a pure function of data (no React, no hooks) | `helpers.ts` of the component that owns it |
| 3 | is a fixed value: threshold, sort order, key map, option list, skeleton count | `constants.ts` of the owner |
| 4 | is user-visible text | `messages/en/<namespace>.json` via next-intl. Not `constants.ts`, not literals. |
| 5 | is a color, spacing or other visual token | CSS variables / `@devdigest/ui` tokens. Not constants. |
| 6 | is stateful UI logic that is reused, or that clutters the component (3+ hooks working together) | `hooks/use<Name>.ts` next to the component |
| 7 | is a type that mirrors the API | already in `@devdigest/shared` (via `src/lib/types.ts`). Don't redefine it. |
| 8 | is a local view type (props, view model) | the component file, or `types.ts` in the folder if shared by its siblings |
| 9 | renders JSX | a component (see §4 for when to split) |

"The owner" is the closest component or route that uses the code. Start there, and move the code
only through §3.

## 3. Promotion: when code moves up

Code starts private and moves **one step at a time**, only when a second consumer actually exists.
Don't promote for a hypothetical consumer, because shared code outlives its users and gets harder
to change.

| Consumers | Location |
|---|---|
| one component | inside that component's folder (`helpers.ts`, `constants.ts`, `_components/<Child>/`) |
| several components of one route | the route folder (`app/.../pulls/helpers.ts`, `constants.ts`) or the nearest common parent component |
| 2+ routes, UI | `src/components/<kebab-name>/<PascalName>.tsx` (+ add it to `/showcase`) |
| 2+ routes, non-UI | `src/lib/<kebab-name>.ts` |
| would be useful in the design system | stop and ask. `src/vendor/ui` is vendored. |

When you promote, move the tests with the code and update every import. Don't leave a re-export
shim behind.

## 4. Splitting components

Split when a part has **its own reason to change**. Line count is only a hint. Signals:

- It owns state that the rest of the component doesn't need ("push state down").
- It is the body of a `.map()`. A list item becomes `<ItemName>`.
- It is a nested `renderSomething()` function or a large conditional block of JSX.
- The component passes 5–7+ props through, or mixes data loading, interaction and layout.
- The file grows past ~200 lines.

Where the child goes: `<Parent>/_components/<Child>/<Child>.tsx`, with the same folder shape as any
component. Prefer composition (`children`, slot props) over threading props through layers that
don't use them.

**Page / View split.** A `page.tsx` reads route params and search params, calls hooks and composes
`_components`. Filtering, sorting, counting and formatting belong in `helpers.ts`, not in the page
body. When a screen has real UI logic, put it in a `<Name>View` component in `_components/`
(e.g. `AgentsListView`) and keep `page.tsx` a few lines long.

## 5. Component folder shape

```
<Name>/
  <Name>.tsx         component (named export + default)
  index.ts           export { Name, Name as default } from "./Name"   ← the only public entry
  styles.ts          one object `s`, inline styles keyed off CSS variables
  constants.ts       SCREAMING_SNAKE module constants
  helpers.ts         camelCase pure functions (data in → data out)
  hooks/use<X>.ts    component-private hooks, one per file
  _components/<Child>/   private sub-components, same shape
  <Name>.test.tsx · helpers.test.ts
```

Create only the files you need. An empty `constants.ts` is noise.

## 6. Business logic: three layers

Based on Fowler/Qiu, "Modularizing React apps":

1. **Domain rules: pure TypeScript** in `helpers.ts` (or `src/lib/<kebab>.ts` once shared).
   Filtering, sorting, grouping, counting, thresholds and status derivation live here.
   No React imports, so they are trivially unit-tested (`helpers.test.ts`).
2. **Hooks orchestrate.** They fetch (TanStack Query), hold UI state and call domain helpers.
   They don't contain the rules themselves.
3. **Components render.** They receive ready-to-show data and call handlers.

Derive, don't store. Values computable from props, query data or URL params are computed during
render (via a helper), not copied into `useState` or synchronized with `useEffect`.

## 7. Where state lives

Choose the lowest level that works:

1. **Local `useState`** in the component that uses it.
2. **Lifted** to the nearest common parent when siblings need it.
3. **URL search params** when the state should survive reload or be shareable (filters, sort,
   active tab). The PR list `?status=` is the reference.
4. **Scoped context provider** (`src/lib/*-context.tsx`) for app-wide client state such as the
   active repo or theme. Wrap as deep in the tree as possible.

**Server data lives only in TanStack Query.** Never copy query results into `useState`, context
or a store. Read them through the hook and derive. Query keys are `[<kebab-string>, id]`; reuse
the exact string when invalidating.

## 8. Next.js App Router rules

- **Data model: "HTTP APIs".** The backend is the Fastify server; `client/` talks to it only
  through `api.ts` + hooks. There are no Server Actions, Route Handlers or DB access in `client/`.
  Don't introduce them silently: mixing data models is the thing the Next.js security guide warns
  against. If the user wants a server layer, read `references/nextjs-app-router.md` first.
- `app/` is for routing. Folders = URL segments, `_components/` = private (non-routable), and
  `(group)` organizes routes or shares a layout without changing the URL.
- **`'use client'` is a module-graph boundary**: everything the file imports ships to the browser.
  For new code, put it on the component that actually needs state, effects or browser APIs, not on
  a wrapper that could stay server-rendered. Existing pages are client components. Don't convert
  them as a side effect of an unrelated task.
- Providers live in `src/lib/providers.tsx` and wrap `{children}`.

Details, plus the server-layer rules (DAL, DTO, `server-only`): `references/nextjs-app-router.md`.

## 9. Imports and barrels

- Use the alias `@/…` for anything outside the current route subtree, and relative paths inside it.
- `index.ts` that re-exports **one** component is the allowed entry point.
- Don't add new **aggregate** barrels (index files re-exporting many modules). They cause import
  cycles and load every module behind them. The existing `@devdigest/ui` barrel and
  `src/lib/hooks/index.ts` are the sanctioned exceptions; import `@devdigest/ui` only from the barrel.

## 10. Anti-patterns to flag in review

- `fetch` / `api.*` called directly in a component → hook in `src/lib/hooks`.
- Business rules (filter/sort/count) inline in `page.tsx` or JSX → `helpers.ts`.
- A static array or object defined inside the component body → module-level constant.
- `utils.ts` or `common/` dumping grounds → name modules by what they do (`github-urls.ts`).
- Importing another route's `_components`, or `src/components` importing from `src/app`.
- Copying query data into `useState` or context.
- Promoting to `src/components` or `src/lib` with only one consumer.
- A new aggregate barrel, or a deep import into another component's internals.
- `'use client'` added high in the tree just to make one child interactive.
- User-visible strings in `constants.ts`, or hard-coded colors.

## 11. Scope: what you may change without asking

Architecture decisions are cheap to make and expensive to undo, so keep each change inside the
boundary the user asked for.

- **Missing data means stop and ask.** If the task needs data the client doesn't have yet (a new
  hook, endpoint, contract type, or field on a shared type), don't add it silently. The data model
  belongs to the server and to `@devdigest/shared`, so it is the user's call. Describe what is
  missing, offer 2–3 options (e.g. "derive from an existing endpoint", "add `GET …` on the
  server", "drop that part"), and implement only the part that needs no new data.
- **Existing code that predates these rules** (e.g. filtering inline in `pulls/page.tsx`): apply the
  rules to **code you add or touch**. Leave unrelated files, sibling components' internals, prop
  types and `INSIGHTS.md` alone. Also don't generalise existing helpers "while you're there".
  List the deviations as follow-ups and offer them as a separate change. A smaller diff is easier
  to review and keeps behaviour unchanged.

More examples (good/bad side by side, a worked "new feature" walkthrough):
`references/examples.md`.
