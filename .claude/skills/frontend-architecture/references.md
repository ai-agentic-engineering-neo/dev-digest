# Sources — frontend-architecture

Research date: 2026-11-25. Every rule in [SKILL.md](SKILL.md) is backed by at least one
source below. **Primary** = official docs / the original author. **Community** = secondary
write-ups (useful for nuance, weaker as authority).

## 1. Official React docs (primary)

| Source | Used for |
|---|---|
| [Thinking in React](https://react.dev/learn/thinking-in-react) | Splitting UI into a component hierarchy; "a component should ideally only do one thing" (single responsibility) |
| [Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | Render = pure function; side effects go in event handlers |
| [Rules of React](https://react.dev/reference/rules) | Hard rules for components and hooks |
| [Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure) | Why side effects in render break things |
| [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | Pull logic into hooks; components show *intent*, not implementation; `use` + capital letter; a function that calls no hooks is not a hook; hooks share logic, not state |
| [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Derived data is computed during render; event logic lives in handlers |
| [Legacy FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html) | React has no official opinion on structure: group by feature or by type, avoid deep nesting, don't overthink it |

## 2. Official Next.js docs (primary, App Router)

| Source | Used for |
|---|---|
| [Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure) | `src/`, private `_folders`, `(route groups)`, organization strategies |
| [Colocation](https://nextjs.org/docs/app/building-your-application/routing/colocation) | Only `page`/`route` files are routable, so colocating other files in `app/` is safe |
| [src directory](https://nextjs.org/docs/app/building-your-application/configuring/src-directory) | `src/` layout plus the `@/*` alias in `tsconfig.json` |
| [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Put `'use client'` on small interactive leaves, not whole trees |
| [Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | What can cross the boundary: serializable props, `children` slots |
| [Composition Patterns](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns) | Pass Server Components to Client ones as `children`; wrap third-party client-only components; `server-only` guard |

## 3. Project structure and architecture

| Source | Type | Used for |
|---|---|---|
| [Bulletproof React — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Primary | Feature folders; one-way flow `shared → features → app`; no cross-feature imports; enforce with `import/no-restricted-paths` |
| [Bulletproof React — repo](https://github.com/alan2207/bulletproof-react) | Primary | Reference implementation |
| [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | Primary | Layers → slices → segments (`ui`, `api`, `model`, `lib`, `config`) |
| [Feature-Sliced Design — Public API](https://feature-sliced.design/docs/reference/public-api) | Primary | Each slice exposes only `index.ts`; no deep imports |
| [FSD docs source (GitHub)](https://github.com/feature-sliced/documentation) | Primary | Full spec |
| [Bulletproof React — Next.js App Router example](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app) | Primary | `app/` routes importing from `features/`; same feature anatomy (`api/`, `components/`, `hooks/`, `types/`) |
| [Feature-Sliced Design — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | Primary | `app/` vs FSD layers; **`src/pages/` is reserved by Next.js**, so rename the pages layer (e.g. `views`) or keep an empty root `pages/` |
| [Angular — Style Guide](https://angular.dev/style-guide) | Primary | Organize by feature areas; one concept per file; the module mental model this skill mirrors |
| [Angular — Feature modules (NgModules guide)](https://angular.dev/guide/ngmodules/feature-modules) | Primary | Feature module / shared module / core module split |
| [Next.js — src folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) | Primary | `src/app` vs `src/pages`: both are routing directories |
| [Martin Fowler — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Primary (author) | Layers: view → hooks → domain models → network; why logic in components stops scaling |
| [Robin Wieruch — React Folder Structure in 5 Steps](https://www.robinwieruch.de/react-folder-structure/) | Primary (author) | Growing a structure step by step; per-component folders with `constants.ts` and `utils.ts` colocated |
| [Josh Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Primary (author) | `helpers` (project-specific) vs `utils` (generic); `constants.ts`; component folder with `index` |
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | Primary (author) | "Place code as close to where it's relevant as possible"; things that change together live together |
| [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Primary (author) | Applies colocation to state |
| [Sergey Sova — Why utils/helpers is a dump](https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo) | Community | Catch-all `utils/` is a sign of low cohesion: move functions to the module they belong to |
| [Profy.dev — Screaming Architecture: evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) | Community | Folder names should say what the app does, not which framework it uses |
| [Netguru — React Project Structure](https://www.netguru.com/blog/react-project-structure) | Community | Overview of the common options |

## 4. Separating business logic from UI

| Source | Type | Used for |
|---|---|---|
| [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern) | Primary | Hooks replace container components in modern React; the full pattern is overkill in small apps |
| [patterns.dev — Hooks Pattern](https://www.patterns.dev/react/hooks-pattern) | Primary | Hooks as the unit of reusable logic |
| [freeCodeCamp — Separation of Concerns: Container and Presentational Components](https://www.freecodecamp.org/news/separation-of-concerns-react-container-and-presentational-components/) | Community | Presentational components only render |
| [TSH — Container/presentational pattern vs hooks](https://tsh.io/blog/container-presentational-pattern-react) | Community | When containers still help (large apps) |
| [Barry Doyle — Separation of concerns with custom hooks](https://dev.to/barrymichaeldoyle/mastering-separation-of-concerns-in-react-with-custom-hooks-1e97) | Community | A hook that depends on 5 other hooks is a warning sign |
| [ITNEXT — Headless components](https://itnext.io/decoupling-ui-and-logic-in-react-a-clean-code-approach-with-headless-components-82e46b5820c) | Community | Headless hook + dumb view |

## 5. Clean code: functions, single responsibility, abstractions

| Source | Type | Used for |
|---|---|---|
| [clean-code-javascript (Ryan McDermott)](https://github.com/ryanmcdermott/clean-code-javascript) | Primary | Functions do one thing; ≤2 args, otherwise an object; no boolean flag params; one level of abstraction; meaningful names; no magic numbers |
| [Dan Abramov — Goodbye, Clean Code](https://overreacted.io/goodbye-clean-code/) | Primary (author) | Don't deduplicate for its own sake; clean code is a means, not a goal |
| [Dan Abramov — The WET Codebase](https://overreacted.io/the-wet-codebase/) | Primary (author) | Wrong abstractions cost more than duplication |
| [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | Primary (author) | Avoid Hasty Abstractions: abstract on the 3rd repetition, not the 2nd |

## 6. Naming

| Source | Type | Used for |
|---|---|---|
| [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) ([mirror](https://javascript.airbnb.tech/react/)) | Primary | PascalCase components and files; filename = component name; camelCase instances; `handle*`/`on*` |
| [Airbnb JavaScript Style Guide — Naming](https://github.com/airbnb/javascript#naming-conventions) | Primary | camelCase / PascalCase / UPPER_CASE for exported constants |
| [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) | Primary | Identifier casing table; CONSTANT_CASE for module-level constants; no `I` prefix on interfaces |
| [Dynatrace React style guide](https://developer.dynatrace.com/develop/reference/react-style-guide/) | Community (corporate) | kebab-case for non-component files and folders vs PascalCase for components |
| [Sathish — Naming conventions, the foundation of clean code](https://dev.to/sathishskdev/part-1-naming-conventions-the-foundation-of-clean-code-51ng) | Community | `is/has/should` booleans, `handle*` handlers, verb-first functions |
| [Huawei Developers — React JS Naming Conventions](https://medium.com/huawei-developers/react-js-naming-conventions-fe87bc9dbd9a) | Community | Summary table of naming conventions |

## 7. Imports, barrels, boundaries

| Source | Type | Used for |
|---|---|---|
| [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | Primary (author) | Barrels cause circular imports and slow tooling |
| [Marvin Hagemeister — The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) | Primary (author) | How barrels multiply module-graph cost |
| [Atlassian — Faster builds when removing barrel files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) | Primary (company) | Real-world numbers: 75% faster builds |
| [eslint-plugin-import](https://github.com/import-js/eslint-plugin-import) | Primary | `import/order`, `import/no-restricted-paths`, `import/no-cycle` |
| [eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries) | Primary | Enforcing layer and feature boundaries |
| [@feature-sliced/eslint-config](https://github.com/feature-sliced/eslint-config) | Primary | Combines import/order + public API + boundaries (beta) |
| [ESLint — no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) | Primary | Banning specific paths (e.g. deep imports into `vendor/ui`) |
| [TypeScript — `paths`](https://www.typescriptlang.org/tsconfig/#paths) | Primary | Path aliases (`@/*`) |

## 8. Rendering, state and side effects

| Source | Type | Used for |
|---|---|---|
| [react.dev — Render and Commit](https://react.dev/learn/render-and-commit) | Primary | What triggers a render; a parent's render re-renders its subtree |
| [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | Primary | No redundant, duplicated or contradictory state; store ids, not copies |
| [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Primary | Effects only for external systems; no effects for derivation, events, resets or chains |
| [react.dev — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) | Primary | Cleanup functions; one effect = one sync process |
| [react.dev — Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state) | Primary | Reset state with `key` instead of an effect |
| [react.dev — Referencing Values with Refs](https://react.dev/learn/referencing-values-with-refs) | Primary | Refs for values that must not trigger a render |
| [Mark Erikson — A (Mostly) Complete Guide to React Rendering Behavior](https://blog.isquaredsoftware.com/2020/05/blogged-answers-a-mostly-complete-guide-to-react-rendering-behavior/) | Primary (author) | How renders propagate; Context re-rendering every consumer |
| [Mark Erikson — talk (GitNation)](https://gitnation.com/contents/a-guide-to-react-rendering-behavior) | Primary (author) | Same topic, video form |
| [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Primary (author) | Moving state down limits re-renders |

## 9. Caching and memoization

| Source | Type | Used for |
|---|---|---|
| [react.dev — useMemo](https://react.dev/reference/react/useMemo) | Primary | Memo is only an optimization; measure (≥1 ms, production build); "should you add useMemo everywhere?" |
| [react.dev — useCallback](https://react.dev/reference/react/useCallback) | Primary | Only for memoized children and dependencies |
| [react.dev — memo](https://react.dev/reference/react/memo) | Primary | When `React.memo` helps; fix structure first |
| [react.dev — cache](https://react.dev/reference/react/cache) | Primary | Per-request dedupe on the server |
| [react.dev — React Compiler introduction](https://react.dev/learn/react-compiler/introduction) | Primary | Automatic memoization; manual memo mostly unnecessary when enabled |
| [Kent C. Dodds — When to useMemo and useCallback](https://kentcdodds.com/blog/usememo-and-usecallback) | Primary (author) | Every optimization has a cost; measure first |
| [freeCodeCamp — How to avoid overusing useCallback and useMemo](https://www.freecodecamp.org/news/how-to-avoid-overusing-usecallback-and-usememo-in-react/) | Community | Catalog of pointless memoization |
| [TanStack Query — Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) | Primary | `staleTime` 0, `gcTime` 5 min, refetch triggers, retries |
| [TanStack Query — Caching](https://tanstack.com/query/latest/docs/framework/react/guides/caching) | Primary | Cache lifecycle |
| [TanStack Query — Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) | Primary | Invalidate affected keys after mutations |
| [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) | Primary (maintainer) | Don't copy query data into local state; set `staleTime`; query key factories |
| [TkDodo — React Query Data Transformations](https://tkdodo.eu/blog/react-query-data-transformations) | Primary (maintainer) | `select` for derived slices |
| [Next.js — Caching and Revalidating](https://nextjs.org/docs/app/getting-started/caching-and-revalidating) | Primary | Server-side fetch caching / `revalidate` |

## 10. SEO

| Source | Type | Used for |
|---|---|---|
| [Next.js — Metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) | Primary | Static `metadata`, `generateMetadata`, `opengraph-image` |
| [Next.js — generateMetadata reference](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) | Primary | `metadataBase`, `title.template`, `alternates.canonical/languages`, `robots` |
| [Next.js — robots.ts](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots) | Primary | Generating robots.txt |
| [Next.js — sitemap.ts](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) | Primary | Generating sitemap.xml |
| [Next.js — JSON-LD guide](https://nextjs.org/docs/app/guides/json-ld) | Primary | Structured data from a Server Component |
| [Next.js — notFound](https://nextjs.org/docs/app/api-reference/functions/not-found) / [redirect](https://nextjs.org/docs/app/api-reference/functions/redirect) | Primary | Correct 404 and redirect status codes |
| [Google — SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) | Primary | Titles, descriptions, URLs, links, headings |
| [Google — Understand JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) | Primary | How Google renders JS; server-render indexable content; crawlable `href` links |
| [Google — Introduction to structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) | Primary | JSON-LD; only mark up visible content |
| [Google — Rich Results Test](https://search.google.com/test/rich-results) | Primary (tool) | Validating JSON-LD |
| [Google — Make links crawlable](https://developers.google.com/search/docs/crawling-indexing/links-crawlable) | Primary | `<a href>` instead of JS-only navigation |
| [Google — Core Web Vitals and Search](https://developers.google.com/search/docs/appearance/core-web-vitals) | Primary | LCP / CLS / INP as ranking signals |
| [web.dev — Web Vitals](https://web.dev/articles/vitals) | Primary | Metric definitions and thresholds |
| [schema.org](https://schema.org/) | Primary | Structured data vocabulary |
| [FocusReactive — Next.js App Router SEO overview](https://focusreactive.com/next-js-app-router-seo-overview/) | Community | App Router SEO walkthrough |

## Project-local sources (DevDigest)

- [client/AGENTS.md](../../../client/AGENTS.md) — thin routes, `_components/<Name>/`, hooks only in `src/lib/hooks`, UI only from `@devdigest/ui`, strings in `messages/`
- [client/src/vendor/ui/README.md](../../../client/src/vendor/ui/README.md) — design system rules
- Example of the target folder anatomy: [AgentCard/](../../../client/src/app/agents/_components/AgentCard/)
