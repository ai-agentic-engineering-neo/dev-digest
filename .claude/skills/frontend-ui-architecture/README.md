# frontend-ui-architecture — sources

Every source behind [SKILL.md](SKILL.md), collected 2026-09-18 across five
parallel research passes. **Each URL was fetched and read** — nothing here is
cited from memory or from a search snippet.

Scope is deliberately *architecture*: where code lives, how it is split, which
boundaries it may cross. Performance material (bundle size, images, fonts,
caching for speed, Core Web Vitals) was excluded on purpose, since it optimizes
a different trade-off and dilutes placement rules.

**Contents**

1. [Where components live — project structure](#1-where-components-live--project-structure)
2. [How components are split](#2-how-components-are-split)
3. [Where business logic lives](#3-where-business-logic-lives)
4. [Next.js App Router as an architecture](#4-nextjs-app-router-as-an-architecture)
5. [Constants, utils, types, naming](#5-constants-utils-types-naming)
6. [Mechanical enforcement](#6-mechanical-enforcement)
7. [Live disagreements](#live-disagreements--the-skill-must-take-a-position-not-hide-them)
8. [Gaps the research did not close](#gaps-the-research-did-not-close)

Trust tiers used throughout:

| Tier | Meaning |
|---|---|
| `official` | Framework/library/tool maintainers |
| `oss-convention` | Widely adopted community architecture (no vendor authority) |
| `practitioner` | Individual author; weight depends on who and how current |
| `tooling` | Docs for a linter/compiler that mechanically enforces a rule |

Version note: nextjs.org now serves **v16.3.5** docs (pages dated to 2026-08-25)
while this repo pins **Next.js 15**. Everything cited below is stable since
13–14. Treat as 16-only and do NOT put in the skill: `updateTag()`, `refresh()`,
`catchError()`, `LayoutProps<'/route'>`, `next/root-params`, Cache Components
(`experimental.cacheComponents`), `authInterrupts`.

---

## 1. Where components live — project structure

- [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — Next.js · updated 2026-07-21 · official
  - Next.js is explicitly *unopinionated*. A segment is not routable until it has `page.js`/`route.js`, so colocation is safe by default.
  - `_folder` opts a folder and all subfolders out of routing — the official mechanism for private, colocated code (matches this repo's `_` convention).
  - `(group)` route groups organize without a URL segment; enable multiple root layouts.
  - Presents **three equally valid strategies** with no preference: all code outside `app/`; shared top-level folders inside `app/`; split by feature/route. "Choose one, be consistent."
  - `src/` is optional and only separates app code from root config.
- [Route Groups (file convention)](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — Next.js · updated 2025-06-16 · official
  - Caveats worth a rule: two groups may not resolve to the same URL; navigating between different *root* layouts forces a full page reload; with no top-level `layout.js`, `/` must live inside a group.
- [src Folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) — Next.js · updated 2025-10-17 · official
  - Purely organizational. `public/`, `package.json`, `next.config.js`, `.env.*` stay at repo root. `src/app` is ignored if a root `app/` also exists.
- [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — alan2207 · living doc · oss-convention
  - `src/{app,assets,components,config,features,hooks,lib,stores,testing,types,utils}`; each feature mirrors that shape internally with only the folders it needs.
  - **Hard rule: no cross-feature imports** — features compose only at the app layer.
  - Unidirectional flow `shared → features → app`; enforced with `import/no-restricted-paths`.
  - Barrel files explicitly discouraged (tree-shaking); import files directly.
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) — FSD · current · oss-convention
  - Layers `app > pages > widgets > features > entities > shared` (`processes` deprecated); slices = business domains; segments = `ui|api|model|lib|config`.
  - A module may import only from layers *strictly below*; sibling slices may not import each other.
- [FSD — Layers reference](https://feature-sliced.design/docs/reference/layers) — FSD · current · oss-convention
  - `shared/lib` is for focused, documented libraries — explicitly **not** a `utils` dump.
  - `app` and `shared` act as both layer and slice, so their segments may import each other freely.
- [FSD — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide) — FSD · undated · oss-convention
  - The most prescriptive answer to "where does `app/` end": *"Use `app/` for routing only. Use `src/` for the product architecture."*
  - `page.tsx` should read as orchestration — import a page component, pass params, return UI — and may import only the `pages` layer's public API.
- [Colocation](https://kentcdodds.com/blog/colocation) — Kent C. Dodds · old but uncontested · practitioner
  - "Place code as close to where it's relevant as possible"; things that change together live together.
  - Extraction trigger is **actual reuse, not anticipated reuse**. Helpers stay near call sites until a second caller appears.
  - Unit tests colocate with their subject; only cross-module/e2e tests get their own tree.
- [React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/) — Robin Wieruch · May 2026 · practitioner
  - A *progressive* path: single file → component folders → technical folders → features → domains → packages. Don't jump ahead of real pain.
  - **"Rule of Two"** — code lives in the one feature that uses it; promote to shared only when a *second* feature needs it.
  - Boundary test: "imagine deleting one feature folder — if everything else breaks, your boundaries leaked."
  - Max two levels of nesting inside `features/`.
- [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) — Josh Comeau · 2022-03-15, upd. 2025-12-03 · practitioner · **dissenting view**
  - Argues *against* feature folders; organizes by function (`components/`, `hooks/`, `helpers/`, `utils/`) even at scale, because feature boundaries are vague and drift.
  - Still colocates at component level: a directory per component with `Widget.tsx`, `Widget.helpers.ts`, `Widget.types.ts`.
  - Defends barrel files as a non-issue at app scale (contradicts Vercel below). Notes an App-Router gotcha: `export *` vs default exports.
- [Thinking in React](https://react.dev/learn/thinking-in-react) — React · current · official
  - Confirms react.dev has **no** file/folder guidance at all — which is why the ecosystem conventions above exist.

## 2. How components are split

- [Thinking in React](https://react.dev/learn/thinking-in-react) — React · official
  - Split criterion is single responsibility: "if it ends up growing, it should be decomposed." Three lenses — programming, CSS, design.
  - UI hierarchy often mirrors the data model. Explicitly pragmatic: keep a sub-part inline until it gains real complexity.
  - **No numeric threshold** for lines or props anywhere in the official docs.
- [Your First Component](https://react.dev/learn/your-first-component) — React · official
  - Hard rule: component names are capitalized (that is how JSX tells them from HTML tags).
  - Hard rule: **never define a component inside another component's body** — state resets, and it is slow. Pass props instead.
- [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) — React · official
  - Explicit order of preference: plain props → extract components and pass JSX via `children` → only then context.
  - "Passing a dozen props through a dozen components" is called out as *not unusual* — explicitness is a feature.
  - Deep prop passing "often means you forgot to extract some components along the way."
  - Legitimate context use: theme, current account, routing, state shared by distant components.
- [Managing State](https://react.dev/learn/managing-state) — React · official
  - Lift state to the closest common parent; never duplicate or store derived state.
- [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — Kent C. Dodds · 2019-09-23 · practitioner
  - The "push state down" half of the pair. Lifting too high invalidates the whole subtree on every update.
  - Never put fast-changing state (inputs, tooltips) in a global store or context.
- [Prop Drilling](https://kentcdodds.com/blog/prop-drilling) — Kent C. Dodds · 2018-05-21 · practitioner
  - Prop drilling is explicit and traceable — not an automatic smell.
  - Counter-signal to naive splitting rules: *"wait until you really need to reuse a block before breaking it out."*
  - Real costs: refactor churn, accidental forwarding, `defaultProps` masking missing props, renames mid-tree.
- [Component Composition is great btw](https://tkdodo.eu/blog/component-composition-is-great-btw) — TkDodo · 2024-09-21 · practitioner
  - Reframes the split trigger: the enemy is **branching complexity**, not component size.
  - Extract a layout component and use early returns, one per discrete state, instead of nested ternaries — TypeScript narrows cleanly after each return.
  - Distinguishes conditional *content* (additive, fine) from conditional *structure* (mutually exclusive states — split it).
- [React Hooks: Compound Components](https://kentcdodds.com/blog/compound-components-with-react-hooks) — Kent C. Dodds · 2019-02-18 · practitioner
  - Expressive API for a family of components (`<select>`/`<option>` analogy) instead of a pile of config props; implicit state shared via context.
- [Building Type-Safe Compound Components](https://tkdodo.eu/blog/building-type-safe-compound-components) — TkDodo · 2026-01-02 · practitioner · **refines the above**
  - Litmus test: does the consumer need to lay out `children` freely? If layout is fixed (a `Select`), compound components are needless indirection.
  - Bad fit: data/API-driven content that must be mapped. Good fit: `ButtonGroup`, `TabBar`, `RadioGroup`.
  - Prefer a component factory (`createRadioGroup()`) over exporting raw parts, to tie generic type params together.
- [React Component Composition](https://www.robinwieruch.de/react-component-composition/) — Robin Wieruch · 2019-01-30 · practitioner
  - `children` keeps a generic component unaware of its contents, and stops a shared component accumulating props it does not itself use.
  - Build the generic component, then a thin specialized wrapper — "only if you catch yourself copying and pasting."
- [Airbnb JavaScript Style Guide — React/JSX](https://github.com/airbnb/javascript/blob/master/react/README.md) — Airbnb · rolling · oss-convention
  - "Only include one React component per file" (multiple stateless/pure components allowed).
  - PascalCase filenames matching the reference name; PascalCase components, camelCase instances; do not rely on `displayName`.
- [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) — Dan Abramov · 2015, retracted 2019 · practitioner · **historical only**
  - 2019 author note: *"I don't suggest splitting your components like this anymore"* — hooks removed the motivation, and he saw it enforced "with almost dogmatic fervor."
  - Medium returned 403 on direct fetch; text verified via the mirror `readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0`. Cite the Medium URL, flag the retraction.

## 3. Where business logic lives

- [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) — React · official
  - If a function calls no hooks, it is a **plain function** and must not be `use`-prefixed — plain functions can be called conditionally.
  - Keep hooks on concrete high-level use cases (`useChatRoom`, `useMediaQuery`); avoid lifecycle wrappers (`useMount`, `useEffectOnce`).
  - Hooks share stateful *logic*, never state itself. Workflow: write the effect inline first, extract only once a named use case exists.
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — React · official
  - Effects are only for synchronizing with an external system. Don't derive data in an effect, don't handle user events in one, don't chain them.
  - Reset state on a prop change with `key`, not an effect. Share logic between handlers with a plain function.
  - Decision test: "because the component was displayed" → effect; "because of a specific interaction" → handler.
- [Separating Events from Effects](https://react.dev/learn/separating-events-from-effects) — React · official
  - "Should this re-run when a reactive value changes?" No → handler or `useEffectEvent`.
- [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) — Next.js · updated 2026-09-07 · official
  - Server Components fetch directly from the source (`fetch` or ORM); identical `fetch` calls are memoized per request; wrap ORM reads in `React.cache` to dedupe.
  - Two sanctioned client patterns: `use()` on a promise passed down from a Server Component, or **SWR / TanStack Query** — named explicitly.
- [How to use Next.js as a backend for your frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) — Next.js · updated 2026-06-25 · official
  - *"Fetch data in Server Components directly from its source, not via Route Handlers"* — calling your own handler adds an HTTP round trip and breaks static prerendering at build time.
  - Route Handlers are for genuinely public, non-UI endpoints: webhooks, callbacks, content negotiation, proxying, or data that must be fetched client-side.
  - Client-side fetching is for client-only Web APIs (geolocation, storage, File) or frequently polled data.
  - Server Actions are for **mutation**, not fetching — "Server Actions are queued."
- [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) — Next.js · updated 2026-09-07 · official
  - `route.ts` cannot coexist with `page.js` in the same segment; only `GET` is cacheable. Handlers stay thin and delegate to lib functions.
- [Practical React Query](https://tkdodo.eu/blog/practical-react-query) — TkDodo (TanStack Query maintainer) · living · practitioner (linked from official docs)
  - *"It is the server who owns the data"* — never copy server state into `useState`, never park fetched data in Redux/global client state.
  - Wrap each query in a custom hook per resource; keep key and query function private to it. Treat query keys like dependency arrays.
- [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) — TkDodo · v5-era · practitioner · **revises the above**
  - For *sharing configuration*, prefer `queryOptions()` factories over custom hooks — a plain object works in loaders, event handlers and `queryClient.fetchQuery`, where a hook cannot.
  - Custom hooks stay right when there is real logic to hide (`select`/derive, combining queries). "The best abstractions are not configurable."
- [React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) — TkDodo · practitioner
  - It is an *async state manager*, not a fetching library. Staleness is a per-query domain decision (`staleTime`), not a global rule.
- [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) — TkDodo · practitioner (linked from official docs)
  - Colocate keys per feature (`features/Profile/queries.ts`), export only the hooks.
  - Structure keys generic → specific (`['todos'] → ['todos','list',{filters}] → ['todos','detail',id]`) for granular invalidation; use a key-factory object per domain.
- [Queries](https://tanstack.com/query/latest/docs/framework/react/guides/queries) and [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) — TanStack · current · official
  - `status` vs `fetchStatus` exist precisely because server state has semantics local `useState` cannot express.
  - The official docs take **no** position on folder structure and defer to TkDodo's posts above.
- [Type inference](https://zod.dev/?id=type-inference) — Zod · current · official
  - `z.infer` makes the schema the single source of truth; `.transform()` splits `z.input` from `z.output`.
- [Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) — Alex Bespoyasov · practitioner · **read critically**
  - Domain (pure) / application (use cases + ports) / adapters, with an "impure → pure → impure" sandwich.
  - The author's own caveat: full layering is "overkill" for a small project; his minimum viable version is just *extract the domain layer and enforce the dependency direction*.

## 4. Next.js App Router as an architecture

- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — Next.js · updated 2026-08-25 · official
  - Client Components only for state, event handlers, lifecycle, browser APIs, or hooks that need those. Everything else defaults to server.
  - `"use client"` marks a **module-graph boundary** — put it on the smallest interactive leaf (`<Search>`), never on a whole page or layout.
  - Server Components passed as `children`/props to a Client Component are **not** pulled into the client bundle: `<Modal><Cart /></Modal>` keeps `Cart` server-rendered.
  - Providers must be Client Components — render them as deep as possible, wrapping `{children}`, not `<html>`.
  - `server-only` / `client-only` turn a bad import into a **build error**.
- [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) — Next.js · updated 2026-08-25 · official
  - Separates *owner* (whose JSX contains the child) from *parent* (who renders it) — the mechanism that makes the `children` slot pattern work.
  - `'use client'` is needed once at a subtree's entry point, not on every file. To keep a shared module clean, wrap it in a small dedicated Client Component instead of marking it.
  - **Compound components break across the boundary** — static properties (`Menu.Item`) come back `undefined`; use named exports for anything that crosses.
  - Native HTML (`<details>`, `<form action>`, `<video controls>`) can supply interactivity with no Client Component at all.
- [Component Composition Patterns](https://vercel.com/academy/nextjs-foundations/component-composition-patterns) — Vercel · v1.0, updated 2026-08-21 · official
  - States it as the default rule, not an example: "keep state in a tiny client wrapper; content can be server-rendered."
  - Passing rendered JSX through a client wrapper sidesteps prop-serialization limits entirely.
  - Named exports, not namespace/static-property exports, for shared compound components — namespace exports break during SSR/prerendering.
- [Server Components](https://react.dev/reference/rsc/server-components) — React · official
  - The framework-agnostic version: compose, don't choose. A Server Component may start an unawaited promise and hand it to a Client Component's `use()`.
- [How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security) — Next.js · updated 2026-08-25 · official — **the strongest layering source found**
  - Pick *one* of three strategies, don't mix: external HTTP API, a **Data Access Layer** (recommended for new projects), or component-level access (prototypes only).
  - A DAL must: `import 'server-only'`, perform authorization checks, and return **DTOs** rather than raw rows.
  - *"Only the Data Access Layer should access `process.env`"* for secrets.
  - A page-level auth check does **not** protect a Server Action defined in that file — every action is a separate entry point and must re-verify caller and per-resource ownership.
  - Taint APIs are an extra layer, never a substitute for filtering in the DAL.
- [How to implement authentication in Next.js](https://nextjs.org/docs/app/guides/authentication) — Next.js · updated 2026-08-25 · official
  - `verifySession()` wrapped in React `cache()` in a `server-only` DAL file, called from data reads, Server Actions and Route Handlers alike.
  - Optimistic checks (cookie, in middleware, for redirects) vs secure checks (DB-verified, next to the data). Middleware is never the only line of defense.
  - **Do not put auth checks in layouts** — layouts don't re-render on client-side navigation, and hiding a slot doesn't stop that slot's fetch from running.
  - Client Components cannot import the DAL; check in a parent Server Component and pass the result down.
- [Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions) — Next.js · updated 2026-06-17 · official
  - A Server Action is reachable as a direct POST even if never used in the UI — treat every action as an untrusted entry point.
  - Actions are dispatched **sequentially per client**; don't `Promise.all` them from the client.
  - Keep the `"use server"` action thin and delegate to a `server-only` module (`app/actions.ts` → `data/posts.ts`).
- [layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout) — Next.js · updated 2026-05-27 · official
  - Root layout must define `<html>`/`<body>`; crossing between root layouts forces a full page load.
  - Layouts cannot access the request, search params or pathname, and cannot pass data to `children` — the documented workaround is duplicate fetches deduped by `cache()`.
- [Error Handling](https://nextjs.org/docs/app/getting-started/error-handling) — Next.js · updated 2026-06-10 · official
  - Model *expected* errors as return values read via `useActionState`; reserve throws for real bugs, caught by the nearest `error.js`.
  - Error boundaries catch render-time errors only — not event handlers, not async outside `startTransition`.
- [Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes) — Next.js · updated 2026-08-25 · official
  - For dashboards, feeds, role-conditional sections and tab groups with independent state.
  - Architectural trap worth a rule: in a conditional-slot layout, **both slots render on the server regardless of which one the layout returns** — "the conditional decides what the user sees, not what runs." Authorize inside each slot.
  - `default.js` per slot is required for hard-navigation fallback.
- [Intercepting Routes](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes) — Next.js · updated 2025-06-16 · official
  - Shareable-URL modals: overlay on soft nav, full page on refresh/direct link. `(.)`/`(..)`/`(...)` count *route segments*, not filesystem depth.
- [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) — TanStack · current · official
  - **Anti-pattern, stated explicitly:** reading a query result in a Server Component *and* passing the same data to a Client Component's `useQuery` — "React Query has no idea how to revalidate the Server Component," so the two desync.
  - Supported pattern: unawaited `void queryClient.prefetchQuery(...)` inside `<HydrationBoundary>`, `shouldDehydrateQuery` including pending queries, `useSuspenseQuery` on the client.
  - For new App Router apps: *"start out with any tools for data fetching your framework provides you with and avoid bringing in React Query until you actually need it."*
- [You Might Not Need React Query](https://tkdodo.eu/blog/you-might-not-need-react-query) — TkDodo · 2023-05-20 · practitioner (library maintainer)
  - Same conclusion from the maintainer: with a mature framework, fetch on the server by default; keep React Query for infinite scroll, offline, and polling/auto-refresh.

## 5. Constants, utils, types, naming

- [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — oss-convention
  - `src/config` holds global config and exported env vars — **not** a generic `constants.ts`.
  - `src/lib` = preconfigured third-party libraries; `src/utils` = in-house shared functions. Same split repeats per feature.
  - Types: `src/types` shared, `features/<f>/types` local.
- [FSD — Public API](https://feature-sliced.design/docs/reference/public-api) — FSD · current · oss-convention
  - The index file is a **contract**; an exported-surface change should be a visible diff.
  - Explicitly against `export *`. Names the real risks: circular imports when internals import their own slice index, and dev-server/tree-shaking cost in mega-barrels like `shared/ui`.
  - Recommends per-component index files (`shared/ui/button/index.ts`) over one monolithic barrel.
- [How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) — Vercel · 13.5-era · official
  - Importing one named export through a barrel still evaluates every re-exported module — hundreds of ms for large libraries.
  - Tree-shaking is bundler-only and cannot fully fix it; `optimizePackageImports` exists to rewrite such imports.
  - Recommends not importing through your own barrels, and considering an ESLint rule banning it.
- [React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/) — Robin Wieruch · practitioner
  - The only explicit `utils` vs `helpers` split found — "utils is generic and copy-pasteable, helpers is project-specific" — but **hedged by the author as "some teams do this."**
  - `lib` = preconfigured third-party wrappers (axios instance, Firebase init). Kebab-case files, singular folder names.
- [Colocation](https://kentcdodds.com/blog/colocation) — Kent C. Dodds · practitioner
  - Generalizes to constants and types: colocate until there is a real second consumer, then promote.
- [Co-located Tests Scale Better](https://typescript.tv/best-practices/co-located-tests-scale-better/) — typescript.tv · undated · practitioner · *corroborating only*
  - Colocated tests give IDE discovery, refactor resilience and visible coverage gaps; integration/e2e stay in their own tree.

## 6. Mechanical enforcement

Tiered — pick the cheapest tool that matches how strict the boundary must be.
No source recommends layering all of them.

- [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) — import-js · current · tooling
  - Cheapest, single-axis: `zones` of `target`/`from`/`except`/`message`. This is what bulletproof-react itself recommends.
  - `from` matches the **resolved** path — matters with path aliases (this repo relies on them).
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md) — javierbrea · v7.2.0 · tooling
  - Classifies files on three axes (element type × file category × origin); `boundaries/dependencies` is `default: "disallow"` plus a policy allowlist.
  - Also `boundaries/external` (npm per element), `boundaries/entry-point` (force imports through a public API), `boundaries/no-private`. Native flat config.
- [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) — sverweij · current · tooling
  - Regex `from`/`to` with capture-group back-references (`$1`) — the clean way to express "no imports between sibling feature folders."
  - Severity levels allow staged rollout; runs outside ESLint, so it can validate a whole repo/monorepo graph as a separate CI gate.
- [Steiger](https://github.com/feature-sliced/steiger/blob/master/README.md) — feature-sliced · **beta** · tooling
  - FSD-specific: `fsd/forbidden-imports`, `fsd/no-public-api-sidestep`, `fsd/public-api`, `fsd/insignificant-slice`, `fsd/inconsistent-naming`. Only worth it under full FSD, and the README says APIs may change.
- [TypeScript — Project References](https://www.typescriptlang.org/docs/handbook/project-references.html) — Microsoft · official
  - `composite: true` + `references` is the only **compiler-level** boundary: a project may import only what it lists.
  - The handbook's own example is exactly the `src`/`test` split. High setup cost — fits true package splits (this repo's `server/`, `client/`, `reviewer-core/`, `e2e/`) rather than intra-package folders.
- [typescript-eslint — consistent-type-imports](https://typescript-eslint.io/rules/consistent-type-imports/) — official · tooling
  - Forces `import type` so type-only imports erase cleanly — relevant wherever a barrel re-exports types alongside runtime code.
- [ESLint — no-magic-numbers](https://eslint.org/docs/latest/rules/no-magic-numbers) — ESLint · frozen but canonical · official
  - `ignore`, `ignoreArrayIndexes`, `enforceConst`, `detectObjects`. **Numbers only** — there is no core ESLint rule for magic strings.

---

## Live disagreements — the skill must take a position, not hide them

1. **Feature-based vs type-based folders.** bulletproof-react, FSD and Wieruch converge on feature-first past trivial size; Josh Comeau argues the opposite at any scale. No ecosystem consensus. State it as a trade-off.
2. **Barrel files.** bulletproof-react and Vercel say avoid (with mechanism-level evidence); FSD and Wieruch keep them as a curated contract; Comeau calls the cost a non-issue. The compatible middle: a narrow curated public API, never `export *`, never a mega-barrel, never import third-party deps through one.
3. **How strict should import rules be.** bulletproof-react's flat two tiers vs FSD's six ordered layers. FSD's extra ceremony (entity vs feature vs widget) is a real cost, not a free upgrade.
4. **One component per file.** Airbnb codifies it; Comeau calls the blanket rule "silly"; react.dev only forbids *nested* component definitions. Proposed resolution: nested definitions = hard rule; one-per-file = soft convention once a component stops being trivial.
5. **Container/presentational.** Retracted by its own author in 2019. Do not present as current practice — it is superseded by the RSC split (data vs interactivity) and custom hooks (stateful logic).
6. **What actually triggers a split.** No source supports "over N lines, split it." react.dev says responsibility; TkDodo says branching complexity; Dodds warns against splitting merely to shorten a prop chain. A line-count rule would be inventing authority that does not exist.
7. **Clean/hexagonal architecture on the frontend.** Bespoyasov's full layering vs bulletproof-react's plain `api/` folder. Bespoyasov himself calls the full version overkill below a certain complexity.
8. **RSC vs TanStack Query — effectively resolved.** TanStack's own docs and its maintainer agree: framework-native fetching by default, React Query for infinite scroll / offline / polling / migrations, and never the same data read in a Server Component *and* re-queried on the client. State this as a firm rule.

## Gaps the research did not close

- **Where Zod schemas physically live** (next to the route handler, a shared `schemas/` module, or next to the form) — no fetched source states a rule. Needs a follow-up pass or a house decision.
- **Where the DAL sits relative to a `features/` layout** — Next.js's guidance uses flat `data/*` examples and never addresses feature-folder colocation. Extrapolation, not citation.
- **Magic strings** — no official lint rule exists, only `no-magic-numbers`. Any rule here is house convention.

## Fit with what this repo already has

The existing `react-best-practices` skill covers anti-patterns, state and hooks;
`next-best-practices` covers App Router file conventions and RSC mechanics.
Neither covers placement and layering — `react-best-practices` spends two short
subsections on "Code Organization" and react.dev has no guidance at all. That is
the gap this skill fills. `client/docs/component-conventions.md` and
`client/CLAUDE.md` already encode a house convention (folder-per-component,
`_components/`, `constants.ts`/`helpers.ts`/`styles.ts`, kebab-case shared vs
PascalCase feature folders) that the skill should reconcile with, not restate.
