---
name: frontend-architecture
description: "Frontend UI architecture and code organization for client/ (React 19 + Next.js 15 App Router). Use when deciding where a page, page component, shared component, hook, constant, helper, type, style or test lives; how to split or name a component; where business logic and data fetching belong; or how to import the design system. Structural decisions only — hooks/state/performance rules live in react-best-practices, RSC and file-convention mechanics in next-best-practices, test writing in react-testing-library."
metadata:
  tags: frontend, architecture, nextjs, app-router, react, folder-structure, colocation, naming
---

# Frontend Architecture — `client/`

Where code lives and how it is layered in `client/` (`@devdigest/web`). Generic
principles are distilled from official docs and reference architectures — sources
and rationale in [references.md](references.md). The **This repo** sections below
are the conventions that apply here; where they and a generic principle differ,
this repo's convention wins.

Sibling skills — do not duplicate their territory:
- `react-best-practices` — hooks rules, state patterns, memoization, rendering anti-patterns
- `next-best-practices` — RSC boundary mechanics, file conventions, async APIs, caching, bundling
- `react-testing-library` — how to write the tests this skill says where to put

## Where things live (the answer sheet)

| What | Where | Rule |
|---|---|---|
| **Route / page** | `src/app/<segment>/page.tsx` | **Thin**: import the page-level view, pass params, return it. No feature logic, no styles, no fetching. |
| **Page component** (used by one route) | `src/app/<segment>/_components/<Name>/` | Private folder (`_` prefix = non-routable). Each component gets its own folder. |
| **Sub-component of a page component** | `<Name>/_components/<Child>/` (same shape, one level deeper) | Nest only while it has exactly one parent; promote when a second route needs it. |
| **Shared app chrome / cross-route components** | `src/components/<kebab-name>/` (`app-shell`, `diff-viewer`, `page-shell`) | Domain-agnostic or used by 2+ routes. A single loose file (`FindingPreviewRow.tsx`) is tolerated; a folder is the norm. |
| **Design-system UI** (Button, Badge, Icon, Toggle, ConfirmDialog, …) | `src/vendor/ui/` — **import only from the `@devdigest/ui` barrel** | Never `@devdigest/ui/primitives/Button` or a relative path into a layer. New/changed component → add to `src/components/showcase/Showcase.tsx`. See `src/vendor/ui/AGENTS.md`. |
| **Data hooks** (TanStack Query) | `src/lib/hooks/<domain>.ts`, re-exported by `src/lib/hooks/index.ts` | The only surface components use for server data; they call `src/lib/api.ts`. |
| **HTTP client** | `src/lib/api.ts` (base = `NEXT_PUBLIC_API_BASE`) | One preconfigured client; nothing else calls `fetch` for the API. |
| **API contracts / DTO types** | `@devdigest/shared` (`src/vendor/shared/`) | Vendored; a change must be mirrored by hand into `server/src/vendor/shared`. |
| **App-wide helpers / providers** | `src/lib/*.ts(x)` (`format.ts`, `theme.tsx`, `toast.tsx`, `providers.tsx`) | Named by domain, never `utils.ts`. |
| **i18n strings** | `messages/en/<namespace>.json` + `useTranslations("<namespace>")` | No user-visible literals inline; a new feature can add its own JSON file. |
| **Tests** | Colocated `*.test.ts(x)` next to the source (`AgentCard/AgentCard.test.tsx`); vitest + jsdom | Test-only harnesses in a `_test/` private folder next to the route (`app/skills/_test/harness.tsx`); global setup in `src/test/`. No mirrored `test/` tree. Browser journeys belong to `../e2e`, not here. |

## Component folder anatomy (naming)

```
_components/AgentCard/
  index.ts            # forwarder only: export { AgentCard, AgentCard as default } from "./AgentCard"
  AgentCard.tsx       # the component ("use client" only if it needs it)
  styles.ts           # co-located inline-style objects keyed off CSS vars (`export const s = { ... }`)
  constants.ts        # feature-local constants (SCREAMING_SNAKE_CASE exports)
  helpers.ts          # pure functions for this component (no React, no hooks)
  AgentCard.test.tsx  # colocated test
  _components/        # private sub-components, same shape (only if needed)
```

- **Folder and component file: PascalCase**, matching the exported component
  name. Shared-chrome *group* folders in `src/components/` are kebab-case
  (`app-shell/`) and hold PascalCase component folders inside.
- **Create files only when needed**: `styles.ts`, `constants.ts`, `helpers.ts`
  appear when the component has styles/constants/helpers — do not scaffold
  empty ones. `index.ts` is always present so the import path is
  `./_components/AgentCard`.
- **Barrels:** the per-component `index.ts` forwarder is the only barrel allowed
  in app code (a wide `export *` re-export barrel defeats tree-shaking and
  causes circular imports). The exceptions are the public entry points that
  already exist: `@devdigest/ui` (`vendor/ui/index.ts`) and `lib/hooks/index.ts`.
- **Hooks:** `useXxx` camelCase, in `src/lib/hooks/` when they wrap the API;
  a hook used by a single component sits in that component's folder (`hooks/`
  subfolder or `useXxx.ts`, as in `components/app-shell/hooks/`).
- **Imports:** absolute alias `@/…` for `src/` (no `../../../`); `@devdigest/ui`
  for UI; `@devdigest/shared` for contracts; `import type` for type-only imports.
  Nesting deeper than ~4 levels is a signal to promote or flatten.

## Core Principles

1. **Colocation is the default; sharing is earned.** Place code as close to its
   consumer as possible; extract to a shared location only on demonstrated reuse.
2. **The promotion ladder.** Inside the component → same file → the component's
   folder (`helpers.ts`, `constants.ts`) → the route's `_components/` → shared
   `src/components/` / `src/lib/`. Trigger to promote: a **second route/feature**
   needs it. Demote symmetrically: a "shared" thing used by one route moves in.
3. **Unidirectional imports: shared → components → routes.** `src/lib` and
   `src/vendor` import nothing from `src/app`; components in `src/components`
   never import from a route's `_components`; one route never imports another
   route's `_components` (promote to `src/components/` instead).
4. **Consistency beats the specific choice.** A mediocre structure applied
   uniformly outperforms a perfect one applied inconsistently.

## Component Splitting

- Split on **responsibility, not size**: one concern per component. No respected
  source gives a line-count threshold — treat "many props" as a prompt to
  examine, not a rule.
- **Split signals:** part of it needs reuse; incompatible props; state hard to
  follow; tests unwieldy; constant merge conflicts on one file.
- **Counter-signal:** don't split or abstract speculatively — duplication beats
  the wrong abstraction.
- **Composition over configuration:** sprouting boolean/variant props → use
  `children`, slots, or compound components. Move state down; lift content up —
  before reaching for `memo`.
- **Mutually exclusive UI states** (loading / error / empty / data) are separate
  early-return branches, not nested ternaries.
- Container/presentational is retired as a rule: logic goes in custom hooks; a
  pure-logic function that calls no hooks is a plain function (no `use` prefix)
  in `helpers.ts`.
- A private subcomponent with exactly one parent may stay in the parent's file;
  move it into `_components/<Child>/` when it is shared, separately tested, or
  contended in reviews.

## Business Logic & Data Placement

| Band | Holds | Tested via |
|------|-------|-----------|
| Components | rendering, event wiring | render tests (RTL) |
| Custom hooks | orchestration: state, effects, query composition | `renderHook` |
| Plain TS modules (`helpers.ts`, `src/lib/*.ts`) | business rules, calculations, validation, mapping | direct unit tests |

- **Components never `fetch`.** Data flows: `lib/api.ts` → `lib/hooks/<domain>.ts`
  (TanStack Query hook) → component. Query keys and fetchers never appear in
  components.
- **Server state ≠ client state.** The query cache owns freshness and
  invalidation; don't copy query data into local state or a store.
- **Business logic in `useEffect` is the canonical anti-pattern** — derive at
  render, handle in event handlers, reset with `key`.
- **Contracts:** shapes come from `@devdigest/shared` Zod types. Don't redeclare
  a DTO locally; if a UI-only view model is needed, derive it in `helpers.ts`.
- **Most `page.tsx` files are `"use client"` here by design** (data lives behind
  the separate Fastify API and depends on TanStack Query's client cache/SSE) —
  see `client/INSIGHTS.md`. Keep the *page* file thin regardless; put
  `"use client"` on the view it renders when the page itself needn't be client.

## Constants, Helpers, Types

- **Constants colocate** in the component folder's `constants.ts`; app-wide
  values go in a named `src/lib/*.ts` module — never one global dumping file.
  No magic numbers/strings inline.
- **`as const` objects + literal unions over enums.**
- **No `utils.ts` grab-bag.** Name helper modules by domain; a helper serving one
  component lives in its `helpers.ts`. Delete helpers orphaned by their last caller.
- **Pure functions live outside the component body** (file level or `helpers.ts`).
- **Types colocate**: prop types in the component file; API/contract types come
  from `@devdigest/shared`, never re-declared.
- **Styles:** the design system is inline-style + CSS variables (no CSS modules /
  Tailwind here) — keep style objects in the component's `styles.ts`, colors via
  `var(--…)` tokens, never hard-coded hex.

## Next.js App Router

- **`app/` is a thin routing layer.** A `page.tsx` reads like orchestration; real
  code lives in `_components/`, `src/components/`, `src/lib/`.
- **Private folders `_folder`** for non-routable colocated code; **route groups
  `(group)`** for section layouts without changing the URL.
- **`'use client'` at the leaves** where possible: it is a one-way module-graph
  door — everything imported below it ships to the browser.
- **This project is the "external HTTP API" case**: the client fronts a separate
  Fastify server, so there is no DAL-over-DB in Next — `lib/api.ts` + the
  `@devdigest/shared` contracts play that role. Never add Next route handlers
  that proxy the API for the UI's own use.

## Checklist before you add a file

1. Is it a route? → `page.tsx` only, delegating to `_components/<View>`.
2. Used by one route? → that route's `_components/<PascalName>/`. Two+ routes? → `src/components/<kebab-group>/`.
3. Fetching? → hook in `src/lib/hooks/<domain>.ts`, not in the component.
4. UI primitive needed? → import from `@devdigest/ui`; if missing, add it to the design system + Showcase, not a one-off.
5. Constants / helpers / styles → the folder's `constants.ts` / `helpers.ts` / `styles.ts`.
6. Strings → `messages/en/*.json`.
7. Test → colocated `*.test.tsx`; run `cd client && pnpm typecheck && pnpm test`.

## Known Judgment Calls

Where respected sources genuinely disagree — pick per situation:
- **Feature folders vs function folders** at scale.
- **Feature code inside `app/` (route colocation) vs outside** (`src/features`).
  This repo colocates in `app/**/_components/`; do not migrate to `features/`.
- **`lib/` vs `utils/` vs `helpers/`** — this repo: `lib/` app-wide, `helpers.ts` per component.
- **Layering depth** — a flat dumping ground and premature enterprise layering are both failure modes.
