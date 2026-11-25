---
name: frontend-architecture
description: "Frontend (React + Next.js App Router) architecture and clean-code conventions: where files live (components, hooks, constants, helpers/utils, types, styles), component folder anatomy, separating business logic from UI, server/client boundaries, naming, single-responsibility functions, import rules (aliases, barrels, boundaries), re-render hygiene (minimal useState/useEffect, few side effects), caching and memoization discipline (server first, TanStack Query cache, memo only when measured), and SEO (Metadata API, robots/sitemap, JSON-LD, semantic HTML). Use when creating or moving files in a frontend, adding a component/page/hook, deciding 'where should this go', adding state/effects/useMemo, adding or reviewing a page's SEO, reviewing code organization, refactoring a large component, or fixing messy imports. Complements react-best-practices (hooks catalog) and next-best-practices (Next.js API details)."
---

# Frontend Architecture & Clean Code

How to organize a React / Next.js codebase so a newcomer (human or agent) can guess
where any file lives, renders as little as necessary, and is indexable. For the
full hooks catalog see `react-best-practices`. For Next.js API details (images, fonts,
bundling) see `next-best-practices`.
Every rule is sourced in [references.md](references.md). Good/bad code is in [examples.md](examples.md).

**Project overrides win.** If the package has an `AGENTS.md` (e.g. `client/AGENTS.md`), its
conventions override this skill. The DevDigest specifics are in §13.

Severity: **MUST** = breaks architecture or causes bugs · **SHOULD** = default, deviate with a reason · **AVOID** = a smell.

---

## 1. Core principles

1. **Colocate by default.** Put code as close as possible to where it's used. Things that change together live together. (Kent C. Dodds, Dan Abramov)
2. **Group by feature, not by file type.** `features/review/` beats `components/` + `hooks/` + `utils/` at the root once the app has more than a handful of screens. (Bulletproof React, FSD, Wieruch)
3. **Promote only when shared.** Code moves up to `shared/` only when **≥2 features** use it. One user means it stays in its feature.
4. **One-way dependencies.** `shared → features → app/routes`. Lower layers never import higher ones, and features never import each other's internals. (Bulletproof React, FSD)
5. **Consistency over perfection.** A slightly worse convention applied everywhere beats a perfect one applied in half the codebase. (React FAQ, Next.js docs)
6. **AHA, not DRY-at-all-costs.** Duplicate twice, abstract on the third occurrence, once the shape is clear. A wrong abstraction costs more than duplication. (Abramov, Dodds)

## 2. Top-level layout: app (pages) → features (modules) → shared

Three layers, like Angular's *feature modules + shared module* (Bulletproof React, FSD, Angular style guide):

```
src/
  app/                          # PAGES LAYER = Next.js routing. Thin files only.
    layout.tsx                  # root layout, mounts providers
    providers.tsx               # QueryClient, theme, i18n (client)
    agents/
      page.tsx                  # 3–10 lines: params → <AgentsListView /> from a feature
      [id]/page.tsx
    (marketing)/…               # route groups organize URLs without changing them

  features/                     # FEATURE MODULES: one folder per business domain
    agents/
      index.ts                  # PUBLIC API: the only file other layers import
      routes.ts                 # path builders + route constants: agentPath(id)
      views/                    # screen-level components that page.tsx renders
        AgentsListView/
        AgentEditorView/
      components/               # UI used only inside this feature
        AgentCard/
      hooks/                    # feature logic hooks (useAgentFilters)
      api/                      # data access: query keys, query/mutation hooks over the shared client
      constants.ts  helpers.ts  types.ts   # feature-wide; split into folders when they grow
    reviews/
    repos/
    settings/

  shared/                       # REUSABLE, DOMAIN-AGNOSTIC. Knows nothing about features.
    ui/                         # design system primitives (Button, Badge, Modal)
    components/                 # composite reusable blocks (AppShell, PageHeader, EmptyState)
    hooks/                      # generic hooks (useDebounce, useMediaQuery)
    lib/                        # api-client.ts, format.ts, dates.ts, i18n helpers
    styles/                     # tokens, globals.css, shared style objects
    constants/                  # app-wide config (APP_NAME, PAGE_SIZES)
    types/                      # cross-cutting types / shared contracts

messages/                       # i18n strings
```

**The "pages" layer is `app/`. NEVER create `src/pages/`.** Next.js reserves `pages/` for the
legacy Pages Router and would treat every file in it as a route. If you need a separate layer
for page compositions, name it `views/` (the FSD guide for Next.js does the same).

Angular mapping, for orientation:

| Angular | Here |
|---|---|
| Feature module (`AgentsModule`) | `features/agents/` |
| Module `exports` | `features/agents/index.ts` |
| Routing module (`agents-routing.module.ts`) | `app/agents/**/page.tsx` (URL) + `features/agents/routes.ts` (paths) |
| Shared module | `shared/` |
| Core module (singletons) | `app/providers.tsx` + `shared/lib/api-client.ts` |
| Service | hook in `features/<f>/api/` or `hooks/` + pure functions in `helpers.ts` |

Rules:
- **MUST** keep `page.tsx` / `layout.tsx` thin. They read params, set `metadata` and render **one** view from a feature. No business logic and no big JSX in them. (Next.js project-structure)
- **MUST** give every feature a public `index.ts`. `app/` and other code import `@/features/agents`, never `@/features/agents/components/AgentCard/helpers`.
- **MUST NOT** import between features. If two features need the same thing, it moves to `shared/`. If a page shows several features together, the composition happens in `app/…/page.tsx`, which may import any feature. (Bulletproof React)
- **MUST NOT** let `shared/` import from `features/` or `app/`.
- **SHOULD** create a feature per **business domain** (agents, reviews, repos), not per technical concern (forms, tables).
- **SHOULD** only create the sub-folders a feature actually needs. A small feature can be `index.ts` + `views/` + `api/`.
- **SHOULD** use the `src/` directory with the `@/*` → `./src/*` alias.
- **AVOID** a root `utils/` or `helpers/` dump. Generic code goes to `shared/lib/<topic>.ts`, and domain code goes into its feature.

Dependency direction (enforce with lint, see §9):

```
app/  ──▶  features/*  ──▶  shared/
 └───────────────────────────▲
features/a  ✕──▶  features/b        shared  ✕──▶  features | app
```

## 3. Component folder anatomy

Applies to components in `features/<f>/views/`, `features/<f>/components/` and `shared/components/`.
A component that is more than about 30 lines, or has its own constants, helpers or tests, gets a folder:

```
AgentCard/
  AgentCard.tsx        # the component: JSX + wiring only
  index.ts             # public API: export { AgentCard } from "./AgentCard"
  constants.ts         # static values used only by this component
  helpers.ts           # pure functions used only by this component
  types.ts             # props/local types, if more than a few lines
  styles.ts            # style objects / class maps, if extracted
  hooks.ts or useX.ts  # component-specific hook with the logic
  AgentCard.test.tsx   # colocated test
  _components/         # private sub-components used only by this one
```

- **MUST** have one exported component per file, with the filename matching the component name (Airbnb).
- **MUST** import the folder through `index.ts` from outside it. Never deep-import `AgentCard/helpers` from another feature.
- **MUST** keep sub-components used only by the parent in the parent's `_components/`. Promote them when a second user appears.
- **SHOULD** split components over about 200 lines or with more than about 7 props, since they likely do more than one thing (Thinking in React: "a component should ideally only do one thing").
- **SHOULD** create only the files you need. Don't scaffold empty `constants.ts`/`types.ts`.

## 4. "Where does this go?" decision table

| Thing | Used by one component | Used by one feature | Used by ≥2 features |
|---|---|---|---|
| Screen rendered by a route | — | `features/<f>/views/<Name>View/` | compose in `app/…/page.tsx` |
| UI component | `<Comp>/_components/` | `features/<f>/components/` | `shared/components/` (primitives: `shared/ui/`) |
| Static values (labels map, limits, enum→color) | `<Comp>/constants.ts` | `features/<f>/constants.ts` | `shared/constants/<topic>.ts` |
| Pure function, no React | `<Comp>/helpers.ts` | `features/<f>/helpers.ts` | `shared/lib/<topic>.ts` (`format.ts`, `github-urls.ts`) |
| Logic with state/effects | `<Comp>/use<Thing>.ts` | `features/<f>/hooks/` | `shared/hooks/` (generic only) |
| Server data (query/mutation hooks, keys) | never in a component | `features/<f>/api/` | API client in `shared/lib/api-client.ts` |
| Route paths | — | `features/<f>/routes.ts` | — |
| Types | inline or `<Comp>/types.ts` | `features/<f>/types.ts` | `shared/types/` / shared Zod contracts |
| Styles | `<Comp>/styles.ts` | `features/<f>/styles.ts` | `shared/styles/` (tokens, globals) |
| UI text | | | `messages/<locale>/*.json` |

**Promotion path:** component → feature → `shared/`. Code moves up only when a **second** user
appears, and when it moves to `shared/` it loses all domain knowledge (no `Agent` types, no feature hooks).

**helpers vs utils vs lib:** use one shared name, `shared/lib/`.
`helpers.ts` = local, domain-aware functions next to their component or feature. Generic, project-agnostic
functions go in `shared/lib/<topic>.ts`, named by **what they do** (`format.ts`, `dates.ts`), never `utils.ts` / `misc.ts`.
A growing "utils" file is low cohesion: move each function to the module it belongs to. (Comeau, Sova)

**Constants rules:**
- **MUST** extract magic numbers and strings that carry meaning: `MAX_FILE_SIZE_MB = 5`, not `5` inline (clean-code-js).
- **SHOULD** use `UPPER_SNAKE_CASE` for module-level primitive or config constants, and `as const` for literal maps and arrays.
- **SHOULD NOT** extract a one-off value with no meaning (`gap: 8` in a style object is fine).
- Constants files hold **data only**: no functions, no JSX, no imports from React.

## 5. Separating business logic from UI

Layering inside the client (Martin Fowler, *Modularizing React Apps*):

```
View (JSX)  →  Hook (state, effects, orchestration)  →  Domain helpers (pure)  →  API client
```

- **MUST** keep render pure: no fetching, mutation or subscriptions in the component body (react.dev).
- **MUST** route data access through the feature's `api/` hooks over the single shared API client (`shared/lib/api-client.ts`). Components never call `fetch`.
- **SHOULD** move logic out of the component into a custom hook once it holds more than about 2 pieces of state or effects. The component should read as *intent* (`const { agents, toggle } = useAgentList()`), not implementation (react.dev, Reusing Logic).
- **SHOULD** keep domain rules (validation, mapping, derived values, sorting) in **pure functions** in `helpers.ts` so they are unit-testable without React.
- **SHOULD** prefer hooks over container components. Use a container only when one wrapper genuinely composes several hooks for a dumb view (patterns.dev).
- **AVOID** hooks that don't call hooks. A plain function is not a hook, so don't prefix it with `use`.
- **AVOID** one hook depending on 5+ other hooks, which is a sign of a missing seam.

## 6. Next.js server/client boundary as architecture

- **SHOULD** default to Server Components. Put `'use client'` on the **smallest interactive leaf**, not on a page or layout (Next.js docs).
- **MUST** pass Server Components to Client Components via `children`/slot props. A client file must not import a server-only module.
- **MUST** mark modules that touch secrets, DB or private env with `import 'server-only'`.
- **MUST** pass only serializable props across the boundary (no functions, class instances or Dates expected as Date).
- **SHOULD** wrap third-party client-only widgets in your own small `'use client'` component.
- **SHOULD** keep providers (`QueryClientProvider`, theme) in one client `providers.tsx` mounted from the root layout.
- If the app is a **client-heavy studio** (data via TanStack Query, like DevDigest), say so in the package docs. Then most views are `'use client'` and the rule becomes: keep routes thin and logic in hooks.

## 7. Naming

| What | Convention | Example |
|---|---|---|
| Component + its file/folder | PascalCase, file = component | `AgentCard/AgentCard.tsx` |
| Hook | `use` + PascalCase, camelCase file | `useAgentFilters.ts` |
| Function | camelCase, **verb first** | `formatDuration`, `buildDiffUrl`, `parseSeverity` |
| Boolean | `is/has/can/should` | `isLoading`, `hasFindings` |
| Event handler / prop | `handleX` inside, `onX` as prop | `onToggle={handleToggle}` |
| Module constant | UPPER_SNAKE_CASE | `DEFAULT_PAGE_SIZE` |
| Type / interface | PascalCase, no `I` prefix | `AgentCardProps` |
| Non-component file | camelCase or kebab-case, **one style per repo** | `format.ts`, `github-urls.ts` |
| Collections | plural; item singular | `agents.map((agent) => …)` |

- **MUST** use names that reveal intent. No `data`, `item`, `temp`, `obj`, `handleClick2`, or one-letter names outside tiny lambdas (clean-code-js). `ag` → `agent`.
- **SHOULD** name by domain, not by type: `SeverityFilter`, not `Dropdown2`.
- **SHOULD** name props after what the component needs, not where the data came from.
- **AVOID** abbreviations except universal ones (`id`, `url`, `i18n`).

## 8. Functions: one function, one job

From *clean-code-javascript* (Ryan McDermott, after Robert C. Martin):

- **MUST** have each function do **one thing** at **one level of abstraction**. If you need "and" to describe it, split it.
- **MUST** avoid boolean flag parameters (`render(true)`). Two named functions or an options object are clearer.
- **SHOULD** take ≤2 positional params. Beyond that, use one destructured object.
- **SHOULD** use early returns or guard clauses instead of nested `if`/ternary pyramids. Avoid nested ternaries in JSX.
- **SHOULD** keep functions short (about 20–30 lines). Extract named sub-steps.
- **SHOULD** avoid side effects in helpers: return new values, don't mutate inputs.
- **SHOULD** keep helper functions **outside** the component body unless they need closure over props or state.
- **AVOID** premature generality: options nobody uses, "manager"/"service" wrappers around one call (AHA).

## 9. Imports

- **MUST** use the path alias for anything outside the current folder: `@/features/agents`, `@/shared/lib/format`. **No `../../../`** chains. Relative `./` and `../` are fine inside one feature.
- **MUST** import through a folder's public `index.ts` from outside. Never deep-import internals of another feature or of the design system.
- **MUST** respect the layer direction from §2: `app → features → shared`, no feature → feature, no shared → anything above. Enforce it with `import/no-restricted-paths` or `eslint-plugin-boundaries` (config in [examples.md](examples.md) §10).
- **MUST** avoid circular imports. Never import your own folder's `index.ts` from inside that folder.
- **SHOULD** keep a stable order, enforced by `import/order` when available:
  1. `react`, framework (`next/*`)
  2. third-party packages
  3. internal aliases (`@devdigest/*`, `@/…`)
  4. relative (`./`)
  5. `import type …` grouped or inline with `type`
- **SHOULD** use `import type` for type-only imports.
- **Barrels:** a one-line `index.ts` per component folder is a public API and fine. **AVOID** big `export *` aggregators over many modules: they cause cycles, slow builds and tests, and hurt tree-shaking (TkDodo, Atlassian). Don't add new aggregate barrels. Prefer named exports over `export *`.
- **SHOULD** use named exports (`export function AgentCard`). Default exports only where the framework requires them (`page.tsx`, `layout.tsx`).
- Boundaries can be enforced with `import/no-restricted-paths`, `eslint-plugin-boundaries` or `no-restricted-imports`.

## 10. Rendering: minimal state, minimal effects, minimal re-renders

Every `setState` re-renders that component **and its whole subtree**. Treat each
`useState` and `useEffect` as a cost you have to justify. (react.dev, Mark Erikson)

**State**
- **MUST NOT** store what can be computed. Values derived from props, state or query data are calculated during render.
- **MUST NOT** copy server data into local state (`useEffect(() => setItems(data), [data])`). The query result *is* the state, because TanStack Query is the server-state store.
- **SHOULD** have no redundant or duplicated state: store `selectedId`, not a copy of the selected object (react.dev, *Choosing the State Structure*).
- **SHOULD** keep state as low as possible (colocation), so only the small subtree that needs it re-renders. Move fast-changing state (input text, hover, timers) into a small leaf component.
- **SHOULD** merge state that always changes together into one object or `useReducer`.
- **SHOULD** use `useRef` for values that don't affect the UI (timer ids, previous values, DOM nodes), since refs don't re-render.
- **SHOULD** keep URL-worthy state (filters, tabs, page) in search params, not `useState`. It's shareable and survives reloads.
- **SHOULD** keep Context values stable and split by concern. Never put fast-changing values into a wide Context: every consumer re-renders.

**Effects** are an escape hatch for syncing with **external systems** only (DOM APIs, subscriptions, sockets, non-React widgets) (react.dev, *You Might Not Need an Effect*).
- **MUST NOT** use `useEffect` to derive data → compute in render.
- **MUST NOT** use `useEffect` to react to user actions → do it in the event handler.
- **MUST NOT** use `useEffect` to fetch data → query hook (`lib/hooks/*`) or a Server Component.
- **MUST NOT** use `useEffect` to reset state when a prop changes → give the component a `key`.
- **MUST NOT** chain effects that set state that triggers other effects → compute it all in one handler.
- **MUST** give each remaining effect **one** sync concern, a cleanup (unsubscribe, abort, clear timer) and honest dependencies.

**Side effects in general:** render functions, helpers and selectors are pure, with no mutation of
inputs, no I/O and no `Date.now()`/`Math.random()` during render. Effects live only in event
handlers, mutations and the few effects allowed above.

**Budget:** a component with more than 3 `useState` or more than 1 `useEffect` gets reviewed. Extract a hook, derive values, or move the state down.

## 11. Caching & memoization

Pick the **first** option that works:

1. **Don't do heavy work in the browser.** Aggregation, sorting or filtering of large datasets, heavy parsing, joins → do it on the **server** (an API endpoint, or a Server Component) and send ready-to-render data. Paginate and filter on the server, not by downloading everything.
2. **Cache server data, don't refetch it.** Use TanStack Query: set a deliberate `staleTime` per domain (the default `0` means "stale immediately") and stable query keys. Invalidate the affected keys after a mutation instead of refetching everything. Derive slices with `select`.
3. **Cache on the server (Next.js).** Use React `cache()` to dedupe the same call within one request, and `fetch` caching / `revalidate` for public, rarely changing data.
4. **Fix the structure before memoizing.** Moving state down or passing heavy UI as `children` ("lift content up") avoids re-renders for free.
5. **Only then memoize in the client:**
   - `useMemo` for a **measured** expensive computation (roughly ≥1 ms, or thousands of items), or to keep identity stable for a memoized child or an effect dependency.
   - `useCallback` only when the function goes to a `React.memo` child or into a dependency array.
   - `React.memo` only for components that are expensive **and** often re-render with the same props.

Rules:
- **MUST** measure first, with the React DevTools Profiler or `console.time` in a production build. "Feels slow" is not a measurement.
- **MUST** keep code correct without the memo. Memoization is an optimization, never a fix for a bug (react.dev).
- **AVOID** memoizing by default. Each memo costs memory plus a dependency comparison on every render, adds noise, and wrong dependencies give stale-data bugs (Kent C. Dodds).
- **AVOID** memoizing cheap things (string concatenation, small `.map`/`.filter`, objects passed to plain DOM elements).
- If **React Compiler** is enabled, don't add manual `useMemo`/`useCallback`/`memo`. It memoizes automatically. Keep manual memos only where the compiler can't.

## 12. SEO (Next.js App Router)

Source of truth: the Next.js Metadata docs and Google Search Central.

**Rendering**
- **MUST** render indexable content on the server (Server Components, SSR or SSG). Content that appears only after a client-side fetch is indexed late or not at all (Google: JavaScript SEO basics).
- **SHOULD** keep public pages as Server Components, with `'use client'` only on interactive leaves (§6).

**Metadata API** (never hand-write `<head>` tags)
- **MUST** have the root `layout.tsx` export `metadata` with `metadataBase`, `title: { default, template: "%s · App" }` and `description`.
- **MUST** give every page a unique `title` and `description`: static `export const metadata` or dynamic `generateMetadata({ params })`. Aim for about 50–60 characters in the title and 150–160 in the description.
- **SHOULD** set `alternates.canonical` on every public page, and `alternates.languages` (hreflang) when the page has locale versions. `<html lang>` must match the locale.
- **SHOULD** set `openGraph` and `twitter` metadata, using the `opengraph-image.tsx` file convention for share images.

**Crawling**
- **MUST** ship `app/robots.ts` and `app/sitemap.ts` for any publicly deployed site. Private app screens get `robots: { index: false, follow: false }`.
- **MUST** use `notFound()` for missing resources (real 404 status) and `redirect`/`permanentRedirect` for moved URLs. Never render an "empty" 200 page.
- **SHOULD** use meaningful, stable URLs: lowercase kebab-case slugs, no IDs-only paths for public content.

**Structured data**
- **SHOULD** render JSON-LD (`<script type="application/ld+json">`) from a Server Component, using schema.org types that match the page.
- **MUST** describe only content that is visible on the page. Validate with Google's Rich Results Test.

**Semantic HTML**
- **MUST** have exactly one `<h1>` per page and a logical `h2`→`h3` hierarchy.
- **MUST** navigate with `<Link href>` / `<a href>`, not `onClick={() => router.push()}`, because crawlers follow `href`.
- **MUST** use `next/image` with a meaningful `alt` for images. Use landmarks (`<main>`, `<nav>`, `<article>`).
- **SHOULD** watch Core Web Vitals (LCP, CLS, INP), which affect ranking: `next/image` with `sizes`, `next/font`, no layout shift. Details are in `next-best-practices`.

## 13. DevDigest client specifics (`client/`)

Read `client/AGENTS.md` first.

DevDigest already follows §2 in its own form, so nothing has to be moved. Map the
terms like this and keep writing code in the existing layout:

| §2 term | DevDigest client |
|---|---|
| pages layer (`app/`) | `src/app/**/page.tsx`: thin **server** files (`generateMetadata` + one client view) |
| feature module | a route folder: `src/app/<route>/_components/<Name>/` (views, components, helpers, constants, tests) |
| feature data access (`api/`) | `src/lib/hooks/<domain>.ts` over `src/lib/api.ts`, keys from `src/lib/hooks/keys.ts` |
| shared UI | `src/vendor/ui/` (`@devdigest/ui`) and `src/components/` (app shell, diff viewer, …) |
| shared lib | `src/lib/<topic>.ts` (`format.ts`, `github-urls.ts`, …) |

Rules:
- Routes: `page.tsx` is a server component that exports `generateMetadata` (title from `messages/en/meta.json`) and renders one `_components/<Name>View`. The root `layout.tsx` adds the `%s · DevDigest` template and `noindex`. `app/error.tsx` and `app/not-found.tsx` are the boundaries.
- Components: `_components/<Name>/` with `Name.tsx`, `index.ts`, and only the `constants.ts` / `helpers.ts` / `styles.ts` it needs, plus `Name.test.tsx` (see `app/agents/_components/AgentCard/`).
- Data: only via hooks in `src/lib/hooks/<domain>.ts`. Query keys only from `queryKeys` in `keys.ts`. Import hooks from the domain file (`@/lib/hooks/agents`), not the `lib/hooks/index.ts` barrel.
- UI primitives: only from `@devdigest/ui`. Contracts and types: from `@devdigest/shared`.
- Colors: CSS variables only. Text: `messages/<locale>/*.json` via `next-intl`.
- Imports: `@/*` → `src/*`. ESLint (`pnpm lint`) rejects `../../../` chains and deep `@devdigest/ui/*` imports.
- Caching: the global defaults in `src/lib/providers.tsx` are `staleTime: 30_000` and `refetchOnWindowFocus: false`. Override per hook when a domain needs it (e.g. `agents.ts` uses 5 min). Don't add local copies of query data.
- React Compiler is **not** enabled, so §11's manual memo rules apply.
- SEO: every screen is private workspace data (`noindex`). If a public page is ever added (landing, docs), it gets the full §12.

## 14. Review checklist

- [ ] Every new file is where §4 says. Nothing went to `shared/` with only one user, and `shared/` has no domain knowledge.
- [ ] `page.tsx`/`layout.tsx` are thin and render a view from a feature. No `src/pages/` folder.
- [ ] No feature imports another feature. Everything outside a feature goes through its `index.ts`.
- [ ] Component has one job, is under about 200 lines, and has under about 7 props. Logic is in a hook, pure rules are in `helpers.ts`.
- [ ] No magic values. Constants live in `constants.ts` with clear names.
- [ ] Functions: one job, verb-first name, ≤2 params or an object, no boolean flags, early returns.
- [ ] Names reveal intent. Booleans use `is/has`. Handlers use `handle`/`on`.
- [ ] Imports: aliases instead of `../../..`, through `index.ts`, no cycles, grouped order, `import type`.
- [ ] `'use client'` is as low as possible, server-only code is guarded, and only serializable props cross the boundary.
- [ ] No new `utils.ts`/`misc.ts` dump and no new aggregate barrel.
- [ ] Every `useState` is necessary: no derived, duplicated or mirrored-server state. State sits as low as possible.
- [ ] Every `useEffect` syncs with an external system and has a cleanup. No effects for derivation, events, fetching or resets.
- [ ] Heavy work happens on the server. Server data comes from the query cache with a deliberate `staleTime`.
- [ ] Each `useMemo`/`useCallback`/`memo` has a measured reason or protects a memoized child or deps. No reflexive memo.
- [ ] Page has a unique `title`/`description` via the Metadata API. Content is server-rendered. One `<h1>`, `href` links, `alt` text.
- [ ] Public site: canonical, Open Graph, `robots.ts`, `sitemap.ts`, valid JSON-LD. Private screens: `noindex`.
