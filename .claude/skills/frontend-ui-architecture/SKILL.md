---
name: frontend-ui-architecture
description: Code-organization rules for the DevDigest frontend (client/ — Next.js 15 App Router, React 19, TanStack Query, next-intl 3) — where components live and how to split them, where constants, helpers, utils, lib code, types, hooks, business logic and API calls go, the import direction between folders, Server vs Client Component boundaries, and naming. Architecture, not performance. Use when creating or moving a page, component, hook, helper or constant in client/; when deciding "where does this code go" on the frontend; when a component grows too big to read; when reviewing a client PR. Triggers - "where should this component go", "split this component", "folder structure", "frontend architecture", "constants", "helpers vs utils", "business logic in component", "'use client'", "barrel file", "куди покласти компонент", "розбити компонент", "структура фронтенду", "де константи", "бізнес-логіка у компоненті".
---

# Frontend UI architecture — DevDigest client

**Scope:** `client/src/**`. Not `server/`, `reviewer-core/` (→ skill `onion-architecture`), not `e2e/`.
**Not covered here:** render performance, memoization, bundle size (→ `react-best-practices`,
`next-best-practices`), test style (→ `react-testing-library`).

**Two rules above all**
1. **Colocate, then promote.** Code lives next to its only consumer. It moves one level up only
   when a *second* consumer appears — never "in case someone needs it" [S41, S55].
2. **Imports point one way:** `vendor/` → `lib/` → `components/` → `app/`. A lower layer never
   imports a higher one; one route never imports another route's `_components` [S28, S34].

```
 app/<route>/page.tsx                    ← composes only (thin)
 app/<route>/_components/<Name>/         ← everything used by ONE route
 components/<kebab-name>/                ← app components used by 2+ routes (shell, diff-viewer…)
 lib/hooks/<domain>.ts                   ← ALL server data (TanStack Query + SSE)
 lib/api.ts · lib/<topic>.ts · lib/*.tsx ← API client, cross-route pure logic, providers
 vendor/ui  (@devdigest/ui)              ← generic UI primitives — the design system
 vendor/shared (@devdigest/shared)       ← Zod contracts, copied from server
 ─────────── import direction: bottom → top only ───────────
```

## Where does this code go?

| The code… | Place |
|---|---|
| is the route entry (`page.tsx`, `layout.tsx`) | Reads params, renders one view from `_components`. No logic, no styles, no data hooks beyond what the view can't own. |
| is a UI piece used by **one route** | `app/<route>/_components/<Name>/<Name>.tsx` |
| is a sub-part used only **inside one component** | same file if tiny and private; else `<Parent>/_components/<Child>/` |
| is a UI piece used by **2+ routes** | `components/<kebab-name>/<Name>.tsx` (promote it, keep its folder shape) |
| is a generic, domain-free primitive (button, modal, tabs) | `vendor/ui` — take it from there; don't add a new UI library |
| fetches, mutates or subscribes to server data | `lib/hooks/<domain>.ts` — a hook, never a `fetch`/`api.*` call in a component |
| is the HTTP client, base URL, error normalization | `lib/api.ts` (only place that reads `NEXT_PUBLIC_API_BASE`) |
| is a pure rule/derivation for **one component** (filter, sort, format, map) | `<Name>/helpers.ts` + `helpers.test.ts` |
| is a pure rule used by **2+ routes** | `lib/<topic>.ts` (e.g. `format-cost.ts`, `github-urls.ts`) + test |
| combines React state/effects into reusable behaviour | custom hook: `<Name>/hooks/useX.ts` → promote to `components/<x>/hooks` or `lib/` when shared |
| is a constant for one component (maps, limits, option lists) | `<Name>/constants.ts` |
| is a constant for one route | `app/<route>/constants.ts` |
| is a cross-route constant | `lib/<topic>.ts` next to the logic that uses it — no global `constants.ts` dump |
| is inline style objects | `<Name>/styles.ts` exporting `s` |
| is a type of one file | inline in that file |
| is a type shared inside one component folder | `<Name>/types.ts` |
| is an API contract type | `import type { … } from "@devdigest/shared"` — never redefine it |
| is a cross-app context provider (theme, toast, repo) | `lib/<name>.tsx` with `"use client"`, mounted in `lib/providers.tsx` |
| is user-visible text | `messages/en/<namespace>.json` + next-intl — never a literal in JSX |

Details and the reasoning: `references/structure.md`, `references/conventions.md`.

## Components — how to split

- One responsibility per component; the tree follows the data and the design mockup [S01].
  Extract when a part gets its own state, its own data, or its own name in the design.
- **Never define a component inside another component's body** — it remounts every render [S02].
- Render is pure; side effects go in event handlers; `useEffect` is the last resort and only
  for syncing with something outside React [S03, S07].
- No presentational/container split by folder — that pattern is retired [S65, S71]. The modern
  shape is: a hook owns data + state, the component renders, `helpers.ts` holds the rules.
- Prefer composition over configuration: `children`/slot props before boolean flags that pick a
  different subtree; a prop that is only passed through means a component is missing [S04, S46].
- Mutually exclusive states (loading / error / empty / data) → early returns with a shared
  layout, not nested ternaries; contradictory booleans → one `status` union [S06, S46].
- Multi-part widgets (tabs, accordions, menus) → compound components sharing context, not
  `cloneElement` [S44, S72].
- Shared components are **presentational about text**: they take already-translated strings as
  props; the caller owns the next-intl namespace (see client/INSIGHTS.md, RunCostBadge).
- Size is a smell, not a law: no authoritative source sets a line limit. If you can't name the
  component's one job, or the file needs scrolling to find the JSX, split it.

More: `references/components.md`.

## Logic, state and data

- **Server data is a cache, not state.** It lives in TanStack Query via `lib/hooks/*`; never copy
  query data into `useState` [S47, S43]. Derive values during render instead of storing them [S07].
- **New queries:** declare a `queryOptions` factory (key + fn together) in `lib/hooks/<domain>.ts`
  and build the hook from it; reuse the factory for invalidation/prefetch. Keys go general →
  specific: `["reviews", prId]` [S49, S50, S24].
- **Business rules are plain TS, no React imports** — in `helpers.ts` or `lib/<topic>.ts`, unit-
  tested with vitest without rendering [S60, S57]. Hooks are thin glue; components only render.
  Don't build use-case layers for a plain GET [S57].
- **State placement:** local → lifted to nearest common parent → composition → context.
  URL state (`?tab=`) belongs to the router. No global store library [S42, S43, S31].
- **API boundary:** `lib/api.ts` is the only HTTP client. Responses are typed with
  `@devdigest/shared` contracts; when a response must be trusted at runtime, parse it with the
  Zod schema inside the fetcher, not in the component [S30, S51].

More: `references/data-and-logic.md`.

## Next.js App Router boundaries (Next 15.5)

- DevDigest uses Next's **"External HTTP API" data model**: Fastify on :3001 owns the DB. So:
  no Data Access Layer, no Route Handlers that mirror Fastify routes, no Server Actions for
  reading data, no DB/secret access from the client package [S15, S18, S17].
- `"use client"` marks a module **and everything it imports** as client code [S10]. Put it on
  the files that need hooks/events/browser APIs — never on `constants.ts`, `helpers.ts`,
  `types.ts`, `styles.ts`, which must stay importable from anywhere [S13].
- Context providers are `"use client"` files rendered as deep as possible [S13].
- Pages are currently client views; converting a route to Server-Component data fetching is an
  architecture decision (ADR), not a drive-by refactor.
- Live docs describe **Next 16** (`proxy.ts`, `refresh()`, `updateTag()`) and **next-intl v4** —
  not available here. Check the installed version before copying an example [S21, S23].

More: `references/nextjs.md`.

## Imports, barrels, naming

- Use the `@/` alias for anything outside the current component folder; relative imports only
  inside it. No new `../../../../` chains.
- `@devdigest/shared` from client code is **`import type` only** — a runtime value import passes
  tsc and vitest but 500s the Next dev build (client/INSIGHTS.md). Mirror needed values locally.
- Each component folder has one `index.ts` with **explicit named re-exports** — its public
  entry. No `export *` in new code, no barrels that aggregate folders, never import your own
  folder through its `index.ts` [S45, S37].
- Names: component folders and files `PascalCase` (`FindingCard/FindingCard.tsx`); shared
  component folders under `components/` `kebab-case`; modules `kebab-case.ts`; hooks
  `useCamelCase.ts`; module-level constants `UPPER_SNAKE_CASE`; route-private folders `_name`.

More: `references/conventions.md`.

## Checklists

**New component**
- [ ] Placed by the table above; used by one route → `_components`, not `components/`.
- [ ] Folder: `<Name>.tsx`, `index.ts` (named re-export); add `constants.ts` / `helpers.ts` /
      `styles.ts` / `types.ts` / `hooks/` only when there is content for them.
- [ ] No fetch/api call inside; data via `lib/hooks`. No hardcoded UI text.
- [ ] Logic with branches lives in `helpers.ts` with a `helpers.test.ts`.
- [ ] `"use client"` only if it uses hooks/events; not on helper/constant/type files.

**Reviewing a client diff — flag any of:**
- `fetch(` / `api.get(` / `apiFetch(` in a component or page.
- Query data copied into `useState` or synced with `useEffect`.
- A component declared inside another component's body.
- Business branching (`if status === …` chains, sorting, mapping DTOs) inline in JSX or a hook
  body instead of a pure helper.
- An import from another route's `_components`, or `lib/` / `components/` importing `app/`.
- A runtime (non-type) import from `@devdigest/shared`.
- `export *`, a new aggregating barrel, or a new deep `../../../` chain.
- `"use client"` on a file with no hooks/events, or on constants/helpers.
- A new Route Handler or Server Action that only forwards to Fastify.
- A component moved to `components/` with only one consumer.
- Literal UI strings; a shared component calling `useTranslations` for its own namespace.

## Legacy code

Existing code predates this skill: `lib/hooks/index.ts` uses `export *`, pages use deep relative
imports, some pages are fat `"use client"` views, `lib/hooks/*` builds `queryKey` inline. Policy:
- **New code follows the rules even inside a legacy file** — don't copy the old pattern.
- Fix violations on lines you touch when the fix is local; don't start an unrequested refactor.
- Bigger moves (introducing `features/`, Server-Component fetching, ESLint boundaries) are
  proposals in `references/enforcement.md`, each needing a decision first.

## References

- `references/structure.md` — layer map, promotion rule, route vs shared, the `features/` question
- `references/components.md` — splitting, composition, compound/headless, i18n in components
- `references/data-and-logic.md` — hooks, queryOptions, business logic, state, API boundary
- `references/nextjs.md` — App Router rules for this project, data model, version traps
- `references/conventions.md` — constants, helpers/utils/lib, types, naming, barrels, env
- `references/enforcement.md` — lint rules to adopt (planned, not in the repo yet)
- `examples.md` — bad → good pairs from this client
- `README.md` — why the skill exists, decisions taken, **full source list (S01–S86)**
- Related: `react-best-practices`, `next-best-practices`, `react-testing-library`, `zod`, `typescript-expert`
