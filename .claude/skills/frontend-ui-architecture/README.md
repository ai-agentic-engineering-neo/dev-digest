# Sources — `frontend-ui-architecture` v1.0.0

Every source behind the rules in this skill, grouped by the question it answers.
Compiled 2026-09-21 from five parallel research passes (project structure · Next.js
App Router · business-logic placement · module boundaries · component composition).

Each URL below was fetched and confirmed to resolve at compile time, except where
the § Link health note says otherwise. Where sources disagree, the skill says so
rather than picking a winner silently — see § Contested claims.

---

## 1. Official / normative

### React

| Source | Author · Date | Authoritative for |
|---|---|---|
| [Thinking in React](https://react.dev/learn/thinking-in-react) | React team · living | The official decomposition procedure; one responsibility per component; lift state to the closest common parent |
| [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) | React team · living | The escalation ladder props → extract components + `children` → context; the strongest official defence of prop drilling |
| [Passing Props to a Component](https://react.dev/learn/passing-props-to-a-component) | React team · living | `children` as "a hole that can be filled in by its parent"; heavy `{...props}` spreading as a split signal |
| [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | React team · living | What belongs in a hook; the `use*` naming rule; "if it doesn't call Hooks, make it a plain function"; against lifecycle wrappers |
| [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team · living | Derived data in render; user-action logic in event handlers; shared handler logic in a plain function |
| [Server Components](https://react.dev/reference/rsc/server-components) | React team · living | Framework-agnostic RSC semantics; composition via `children` |
| [`'use client'`](https://react.dev/reference/rsc/use-client) | React team · living | Place the directive as deep in the tree as possible; serializable-props table |
| [Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components) | React team · living | Default vs named export convention |
| [File Structure (legacy FAQ)](https://legacy.reactjs.org/docs/faq-structure.html) | React team · pre-hooks | "Don't spend more than five minutes on choosing a file structure"; the 3–4 nesting-level cap |
| [Components and Props → Extracting Components](https://legacy.reactjs.org/docs/components-and-props.html) | React team · archived | The original split heuristic: used several times **or** "complex enough on its own" |
| [Composition vs Inheritance](https://legacy.reactjs.org/docs/composition-vs-inheritance.html) | React team · archived | "We haven't found any use cases where we would recommend creating component inheritance hierarchies" |

### Next.js

| Source | Author · Date | Authoritative for |
|---|---|---|
| [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | Vercel · upd. 2026-07-21 | **The canonical page.** Next.js is unopinionated; three named strategies; private `_folders`; route groups; colocation safety |
| [`src` Folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) | Vercel · upd. 2025-10-17 | What may and may not move into `src/`; the silent "root `app/` wins" failure |
| [Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) | Vercel · upd. 2025-06-16 | `(group)` semantics and its three caveats |
| [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | Vercel · upd. 2026-08-25 | The best statement of the boundary: module graph vs render tree; owner vs parent; code-vs-data crossing |
| [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Vercel · upd. 2026-08-25 | When to use each; interleaving; providers as deep as possible; `server-only` / `client-only` |
| [`use client` directive](https://nextjs.org/docs/app/api-reference/directives/use-client) | Vercel · upd. 2026-08-25 | The directive as an **entry point**, not a per-file annotation |
| [How to implement authentication](https://nextjs.org/docs/app/guides/authentication) | Vercel · upd. 2026-08-25 | DAL at `app/lib/dal.ts`; DTOs; **layouts are not an auth boundary**; middleware is optimistic only |
| [How to think about data security](https://nextjs.org/docs/app/guides/data-security) | Vercel · upd. 2026-08-25 | The three data-fetching models; the DAL contract; the audit checklist |
| [Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions) | Vercel · upd. 2026-06-17 | Actions as POST entry points; sequential dispatch; "schema validation is not authorization" |
| [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data) | Vercel · upd. 2026-08-25 | Where `'use server'` goes — inline vs file-level |
| [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) | Vercel · upd. 2026-09-07 | Fetch in the component that needs it; `React.cache` for ORM calls; colocate `preload` with its consumer |
| [Backend for your frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) | Vercel · upd. 2026-06-25 | Route Handlers vs Server Actions vs Server Components; don't fetch your own Route Handlers from RSC |
| [Single-page applications](https://nextjs.org/docs/app/guides/single-page-applications) | Vercel · upd. 2026-08-25 | `use()` + Context Provider placement |
| [TypeScript config](https://nextjs.org/docs/app/api-reference/config/typescript) | Vercel · upd. 2026-08-25 | Generated `PageProps` / `LayoutProps` / `RouteContext`; `typedRoutes`; where custom `.d.ts` go |
| [`optimizePackageImports`](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) | Vercel · upd. 2025-12 | Default-optimized package list; still `experimental`; bails on impure barrels |
| [Learn: Dashboard App](https://nextjs.org/learn/dashboard-app/getting-started) | Vercel · current | The de-facto official convention: `app/lib`, `app/ui`, `app/lib/definitions.ts` |
| [How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) | Sebastian Markbåge · 2023-10-23 | Origin of the DAL/DTO recommendation; "pick one model — exceptions pop out as suspicious" |
| [Next.js 15](https://nextjs.org/blog/next-15) | Delba de Oliveira, Jimmy Lai, Rich Haines · 2024-10-21 | Async request APIs; the caching-default reversal |
| [Next.js 16](https://nextjs.org/blog/next-16) | Lai, Story, Markbåge, Neutkens · 2025-10-21 | `middleware.ts` → `proxy.ts`; Cache Components; `experimental.ppr` removed |

### TypeScript

| Source | Author · Date | Authoritative for |
|---|---|---|
| [Enums handbook](https://www.typescriptlang.org/docs/handbook/enums.html) | Microsoft · living | The official "Objects vs Enums" section recommending `as const`; `const enum` pitfalls |
| [`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html) | Microsoft · living | Why `import type` must be explicit; supersedes `importsNotUsedAsValues` |
| [`paths`](https://www.typescriptlang.org/tsconfig/paths.html) | Microsoft · living | The alias mechanism, and that `tsc` does **not** rewrite paths at emit |
| [`erasableSyntaxOnly`](https://www.totaltypescript.com/erasable-syntax-only) | Matt Pocock · 2025 | TS 5.8 bans `enum`, `namespace`, parameter properties |
| [Where to put your types](https://www.totaltypescript.com/where-to-put-your-types-in-application-code) | Matt Pocock · living | The three-rule answer for type placement |

---

## 2. Project structure & feature architecture

| Source | Author · Date | Authoritative for |
|---|---|---|
| [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Alan Alickovic · living | `src/features/*`; unidirectional `shared → features → app`; compose at the app level; the `import/no-restricted-paths` zones; **the reversed barrel advice** |
| [Bulletproof React — API Layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md) | Alan Alickovic · living | One configured client; one file per request holding types + schema + fetcher + hook |
| [Bulletproof React (repo)](https://github.com/alan2207/bulletproof-react) | Alan Alickovic · living | Context: a guide, not a template |
| [FSD — Overview](https://feature-sliced.design/docs/get-started/overview) | FSD team · v2.1 | Layers / slices / segments; the import rule; the public-API rule |
| [FSD — Layers](https://feature-sliced.design/docs/reference/layers) | FSD team · v2.1 | Which layers are optional; `processes` deprecated; "not everything needs to be a feature" |
| [FSD — Slices & segments](https://feature-sliced.design/docs/reference/slices-segments) | FSD team · v2.1 | The `ui / api / model / lib / config` vocabulary; **`components`, `hooks`, `types` are bad segment names** |
| [FSD — Public API](https://feature-sliced.design/docs/reference/public-api) | FSD team · v2.1 | Index contracts; no deep imports; the `@x` cross-import notation; FSD's own concession on barrel cost |
| [FSD — Alternatives](https://feature-sliced.design/docs/about/alternatives) | FSD team · living | Atomic Design's atoms/molecules map to `shared/ui`; it "lacks a clear level of responsibility for business logic" |
| [FSD — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | FSD team · living | The official answer to the `app`/`pages` layer-name collision |
| [The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide) | Evan Carter, on the FSD site · 2026-01-23 | A worked FSD + App Router layout. **Opinionated blog post, not FSD spec** |
| [FSD — Frontend Clean Architecture](https://feature-sliced.design/blog/frontend-clean-architecture) | FSD site · 2025-12-30 | The pro-Clean-Architecture position |
| [The Vertical Codebase](https://tkdodo.eu/blog/the-vertical-codebase) | Dominik Dorfmeister (TkDodo) · 2026-04-13 | Why `components/hooks/types/utils` fails at scale; verticals; shared code becomes its own vertical |
| [React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) | Robin Wieruch · upd. 2026-05-05 | The eight-stage evolution; the "rule of two" promotion heuristic |
| [Feature-based React Architecture](https://www.robinwieruch.de/react-feature-architecture/) | Robin Wieruch · 2024-11-25 | How features avoid coupling: compose at the page level, pass IDs not data |
| [Screaming Architecture — Evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) | Johannes Kettmann · 2022-02-25 | Four-stage comparison with the failure mode named for each |
| [Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) | Robert C. Martin · 2011-09-30 | Origin of the term; the top-level listing as a diagnostic |
| [PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | Martin Fowler · 2015-08-26 | **The key sentence**: split the top level into domain modules that are *internally* layered |
| [Package by Feature](https://phauer.com/2020/package-by-feature/) | Philipp Hauer · 2020-04-21, upd. 2022 | Package-by-feature benefits; Rule of Three; "KISS > DRY" |
| [May I Interest You In a Modular Monolith?](https://frontendatscale.com/issues/45/) | Maxi Ferreira · 2025-04-13 | "Organization + encapsulation = modularity" |
| [Component Hierarchy & Breakdown](https://frontendatscale.com/courses/frontend-architecture/implementing/component-hierarchy-and-breakdown/) | Maxi Ferreira · living | **A component that needs its own internal folders has become a feature** |
| [FSD and good frontend architecture](https://www.codecentric.de/en/knowledge-hub/blog/feature-sliced-design-and-good-frontend-architecture) | Felix Abele (codecentric) · 2025-01-23 | The best-sourced FSD critique: classification ambiguity, reuse-threshold churn, when FSD is over-dimensioned |
| [Structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) | Vercel / Turborepo · living | `apps/` vs `packages/`; the extraction trigger — "if you write `../` between packages, rethink" |

---

## 3. Module boundaries, public API, barrels

| Source | Author · Date | Authoritative for |
|---|---|---|
| [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | TkDodo · 2024-07-26 | The canonical case against: 11,000 → 3,500 modules measured; the circular-import mechanism |
| [The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) | Marvin Hagemeister · 2023-10-08 | **The measurement paper.** Per-module-count timings; every test worker rebuilds the graph |
| [How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | Shu Ding (Vercel) · 2023-10-13 | Why tree-shaking cannot fix barrels — it is a bundler feature, the cost is runtime |
| [Why I Prefer Barrel Files in 2026](https://codecompose.com/articles/why-i-prefer-barrel-files-in-2026/) | Thijs Koerselman · 2026-04-21 | The strongest pro-barrel rebuttal; the toolchain argument; his own conceded exceptions |
| [Vite #21966 — tree-shaking fails for mixed barrels](https://github.com/vitejs/vite/issues/21966) | Vite · 2026-03-19 | Hard evidence the problem is not fully solved in 2026 tooling |
| [Barrel imports discussion](https://github.com/vercel/next.js/discussions/92926) | Next.js · 2026-04 | Collaborator position: direct imports for local code; `import * as` is the worst pattern |
| [App Router — organizing server & client files](https://github.com/vercel/next.js/discussions/52766) | answered by icyJoseph (Next.js Docs team) · 2023-07 | **Don't use `(client)`/`(server)` route groups**; use `lib/x/client.ts` + `lib/x/server.ts` |
| [The Beyoncé Rule](https://frontendatscale.com/issues/36/) | Maxi Ferreira · 2024-11-24 | Why boundaries belong in CI, not in review comments; architecture fitness functions |
| [Sheriff — module boundaries](https://sheriff.softarc.io/docs/module_boundaries) | Rainer Hahnekamp / SoftArc · living | Module = folder with `index.ts` **or** an `internal/` folder; deep-import banning |
| [Nx — Enforce Module Boundaries](https://nx.dev/docs/features/enforce-module-boundaries) | Nx team · living | Tag-based `depConstraints` |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Javier Brea · living | Element-types model; the `boundaries/dependencies` rule |
| [`boundaries/dependencies` docs](https://www.jsboundaries.dev/docs/rules/dependencies/) | Javier Brea · living | The new docs home; `entry-point` and `external` are **deprecated** into this rule |
| [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | eslint-plugin-import · living | Zone config; matches the **resolved file path**, not the import string |
| [`import/no-cycle`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md) | eslint-plugin-import · living | Cycle detection; its own cost; `maxDepth` |
| [`import/no-internal-modules`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-internal-modules.md) | eslint-plugin-import · living | "Import only from the entry point" via globs |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Sander Verweij · living | `no-circular`, orphans, forbidden zones, graph output |
| [Knip — unused exports](https://knip.dev/typescript/unused-exports) | Lars Kappert · living | Whole-graph dead-export detection — the failure mode barrels create |
| [`unicorn/filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md) | Sindre Sorhus · living | Default `kebabCase`; the case-sensitive-filesystem rationale |
| [`no-magic-numbers`](https://eslint.org/docs/latest/rules/no-magic-numbers) | ESLint · living | The enforceable magic-value policy |
| [The `utils` anti-pattern](https://www.yanglinzhao.com/posts/utils-antipattern/) | Yanglin Zhao · 2020 | "`util` is just too loose of a name"; the `unstable_temporary_utils` migration trick |

---

## 4. Business logic, state, data

| Source | Author · Date | Authoritative for |
|---|---|---|
| [Smart and Dumb Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | Dan Abramov · 2015, **updated 2019** | The Container/Presentational **retraction**. See § Link health |
| [Thoughts on React Hooks, Redux, and Separation of Concerns](https://blog.isquaredsoftware.com/2019/07/blogged-answers-thoughts-on-hooks/) | Mark Erikson (Redux maintainer) · 2019-07-10 | The honest counterweight: hooks deliberately reduce separation of concerns; hook code needs integration tests |
| [Goodbye, Clean Code](https://overreacted.io/goodbye-clean-code/) | Dan Abramov · 2020-01-11 | "Traded the ability to change requirements for reduced duplication, and it was not a good trade" |
| [The Two Reacts](https://overreacted.io/the-two-reacts/) | Dan Abramov · 2024-01-04 | `UI = f(data)(state)` — server-placed data logic vs client-placed interaction logic |
| [JSX Over The Wire](https://overreacted.io/jsx-over-the-wire/) | Dan Abramov · 2025-04-16 | Model vs ViewModel; why REST shapes shouldn't drive UI; the mapping belongs server-side |
| [React for Two Computers](https://overreacted.io/react-for-two-computers/) | Dan Abramov · 2025-04-09 | The conceptual model behind the directives: two isolated worlds joined by a door |
| [Writing Resilient Components](https://overreacted.io/writing-resilient-components/) | Dan Abramov · 2019-03-16 | Four design principles; the "if this were rendered twice" test |
| [React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) | TkDodo · 2021-08-20 | **"The frontend application doesn't own the data"**; don't sync server data elsewhere |
| [Practical React Query](https://tkdodo.eu/blog/practical-react-query) | TkDodo · 2020-11-16, upd. 2023 | Custom hook per query; keys colocated with fetchers |
| [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | TkDodo · living | Query-key factories; against a central `queryKeys.ts` |
| [React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms) | TkDodo · ~2022 | Form state vs server state; the bounded, deliberate exception |
| [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) | TkDodo · 2026-02-23 | **The 2026 position**: hooks share configuration, not logic — prefer plain functions when a non-component caller exists |
| [The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | TkDodo · 2024-01-17 | The portable unit: an options object, not a hook |
| [Working with Zustand](https://tkdodo.eu/blog/working-with-zustand) | TkDodo · 2022-11-20 | Export hooks not the store; atomic selectors; actions as events; many small stores |
| [Does TanStack Query replace client state?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state) | TanStack · living | Query is not a client-state replacement, but the leftover global state "is usually very tiny" |
| [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Kent C. Dodds · 2020-07-21 | Colocation-first placement; server cache vs UI state; scoped providers over one global store |
| [Redux Style Guide](https://redux.js.org/style-guide/) | Redux team · living | "Put as Much Logic as Possible in Reducers"; "Model Actions as Events, Not Setters"; keep form state out |
| [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | Alexis King · 2019-11-05 | Parse at the boundary, return a refined type; against "shotgun parsing" |
| [Clean Architecture on the Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | Alex Bespoyasov · 2021-09-02 | The most serious pro-CA frontend write-up — **including the author's own caveats** |
| [Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html) | Juntao Qiu, on martinfowler.com · 2023-02-16 | Layered decomposition: view / hooks / domain model / data access |
| [Separated Presentation](https://martinfowler.com/eaaDev/SeparatedPresentation.html) | Martin Fowler · 2006-06-29 | Presentation may call domain, never the reverse |
| [Anti-corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) | Microsoft · upd. 2026-05 | Translation only, no business rules; not warranted when semantics already match |
| [How to test custom React hooks](https://kentcdodds.com/blog/how-to-test-custom-react-hooks) | Kent C. Dodds · 2020-03-22 | Test hooks through a component; `renderHook` for the hard cases |
| [Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details) | Kent C. Dodds · 2020-08-17 | Test the public seam, not internals |
| [Type-safe URL state with nuqs](https://gitnation.com/contents/type-safe-url-state-management-in-react-with-nuqs) | François Best · React Advanced 2025 | URL as a first-class state location: "teleportation" and "time travel". Library: [nuqs.dev](https://nuqs.dev/) |

---

## 5. Component decomposition & composition

| Source | Author · Date | Authoritative for |
|---|---|---|
| [When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) | Kent C. Dodds · 2019-07-19 | **The anti-line-limit position**: seven named problems, split when one bites, "NOT BEFORE" |
| [React components composition: how to get it right](https://www.developerway.com/posts/components-composition-how-to-get-it-right) | Nadia Makarevich · 2022-04-12 | The opposing size-aware position; monolith vs premature extraction |
| [Inversion of Control](https://kentcdodds.com/blog/inversion-of-control) | Kent C. Dodds · 2019-11-18 | "It's *never* 'just an `if` statement'" — the basis for composition over configuration |
| [Multiple boolean props are a code smell](https://kyleshevlin.com/multiple-boolean-props-are-a-code-smell/) | Kyle Shevlin · 2020-08-28 | Boolean props → `variant` union; making impossible states impossible |
| [Prop Drilling](https://kentcdodds.com/blog/prop-drilling) | Kent C. Dodds · 2018-05-21 | Drilling isn't inherently bad; **premature splitting** is what makes it painful |
| [How to use React Context effectively](https://kentcdodds.com/blog/how-to-use-react-context-effectively) | Kent C. Dodds · 2021-06-05 | Provider + `useX()` consumer hook; throw outside the provider; don't export the context |
| [Compound Components with React Hooks](https://kentcdodds.com/blog/compound-components-with-react-hooks) | Kent C. Dodds · 2019-02-18 | Compound components via context; the `<select>/<option>` analogy |
| [What's going to happen to render props?](https://kentcdodds.com/blog/react-hooks-whats-going-to-happen-to-render-props) | Kent C. Dodds · 2018-12-10 | Hooks won logic sharing; render props survive for **rendering** inversion of control |
| [Interface Segregation Principle in React](https://alexkondov.com/interface-segregation-principle-in-react/) | Alex Kondov · 2024-08-27 | Pass `name`, not the whole `user` |
| [Tao of React](https://alexkondov.com/tao-of-react/) | Alex Kondov · 2021-01-18 | ">5 props is a signal"; "pass objects over primitives" — **note this contradicts the ISP piece above** |
| [React component code smells](https://antongunnarsson.com/react-component-code-smells/) | Anton Gunnarsson · 2022-02-14 | Seven smells incl. **incompatible props**; "20 props can still do one thing well" |
| [4 common patterns in React code reviews](https://www.chakshunyu.com/blog/4-common-patterns-you-can-easily-focus-on-in-your-react-code-reviews/) | Chak Shun Yu · 2021-10-18 | The god-component review heuristic |
| [Headless Component](https://martinfowler.com/articles/headless-component.html) | Juntao Qiu, on martinfowler.com · 2023-11-07 | Separating "the brain of a component from its looks", and its two stated drawbacks |
| [Radix — Composition](https://www.radix-ui.com/primitives/docs/guides/composition) | Radix · living | `asChild` / `Slot`; the two contracts a composed child must honour |
| [Ariakit — Composition](https://ariakit.com/guide/composition) | Ariakit · living | The third dialect: a `render` prop taking an element *or* a function |
| [Building Component Slots in React](https://sandroroth.com/blog/react-slots/) | Sandro Roth · 2022-11-01, upd. 2023 | Six slot implementations compared, with tradeoffs; plus React Aria's fake-DOM approach |
| [Polymorphic React Components are quite tricky](https://sandroroth.com/blog/react-polymorphic-components/) | Sandro Roth · 2023-04-02 | Why `as` is hard; concludes `asChild` is "the less bad option" |
| [Making Sense of React Server Components](https://www.joshwcomeau.com/react/server-components/) | Josh W. Comeau · 2023-09-06, upd. 2025-05-09 | **The ownership rule**: a Client Component can only receive a Server Component, never import one |
| [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Josh W. Comeau · 2022-03-15, upd. 2025-12-03 | Folder-per-component; `Name.helpers.ts` siblings; **an explicit defence of barrel files** |
| [My Favorite 5 Lines of CSS](https://www.joshwcomeau.com/react/modern-spacer-gif/) | Josh W. Comeau · 2021 | "Margins bleed out, seeping through the component boundary" — and the now-dated `<Spacer>` remedy |
| [No Outer Margin](https://kyleshevlin.com/no-outer-margin/) | Kyle Shevlin · 2024-02-26 | **"External spacing should never be the responsibility of a component"**; parent owns `gap` |
| [Compound Components and Advanced Composition](https://vercel.com/academy/shadcn-ui/compound-components-and-advanced-composition) | Vercel Academy · upd. 2025-10-17 | A recent vendor decision framework for reaching for compound components |

---

## 6. Design systems & the UI layer

| Source | Author · Date | Authoritative for |
|---|---|---|
| [shadcn/ui — Introduction](https://ui.shadcn.com/docs) | shadcn · living | "This is not a component library. It is how you build your component library" — the vendoring model |
| [The anatomy of shadcn/ui](https://manupa.dev/blog/anatomy-of-shadcn-ui) | Manupa Karunathilake · 2023-12-11 | The two-layer model: headless behaviour + Tailwind/cva style layer; the `cn()` override mechanism |
| [The Three-Layer UI Component Architecture](https://markus.oberlehner.net/blog/the-three-layer-ui-component-architecture-versatile-building-blocks-for-crafting-multiple-design-systems) | Markus Oberlehner · 2023-03-20 | Unstyled primitives → styled primitives → domain-specific components |
| [The Design System Ecosystem](https://bradfrost.com/blog/post/the-design-system-ecosystem/) | Brad Frost · 2023-09-21 | The layer cake; "recipes" and "smart components" as the pressure-release valve |
| [Atomic Design (original)](https://bradfrost.com/blog/post/atomic-web-design/) | Brad Frost · 2013-06-10 | The original taxonomy — the reference point for the contested section |
| [Atomic Design Methodology](https://atomicdesign.bradfrost.com/chapter-2/) | Brad Frost · 2016 | Frost's own framing: "not a linear process", "not rigid dogma" |
| [Atomic Design Systems: Why the Labels Don't Matter](https://www.qt.io/software-insights/atomic-design-systems-why-the-labels-dont-matter) | Peter Rohles (Qt) · 2025-11-26 | Carries Frost's own quote that the labels "have never been the point"; the categorization trap |

---

## 7. Abstraction principles

| Source | Author · Date | Authoritative for |
|---|---|---|
| [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) | Sandi Metz · 2016-01-20 | "Duplication is far cheaper than the wrong abstraction"; the inline-it-back remedy |
| [AHA Programming](https://kentcdodds.com/blog/aha-programming) | Kent C. Dodds · 2020-06-22 | Avoid Hasty Abstractions; "optimize for change first" |
| [Colocation](https://kentcdodds.com/blog/colocation) | Kent C. Dodds · 2019-06-17 | "Place code as close to where it's relevant as possible", **and its named exceptions** |
| [The WET Codebase](https://www.deconstructconf.com/2019/dan-abramov-the-wet-codebase) | Dan Abramov · Deconstruct 2019 | The three costs of abstraction: accidental coupling, indirection, inertia (full transcript on page) |
| [Good Abstraction, Bad Abstraction](https://frontendatscale.com/issues/2/) | Maxi Ferreira · 2023-07-30 | Deep modules; single level of abstraction |

---

## Contested claims

Where the skill states a position, it states the disagreement too. These are the live ones:

| Question | The disagreement | What the skill does |
|---|---|---|
| **Barrel files** | TkDodo + Hagemeister + bulletproof-react against; Koerselman (2026) and Comeau for. Both credible and recent | Presents the rules **both sides agree on** and notes the split is by toolchain. Neither side is presented as settled |
| **Promotion threshold** | Rule of two (Wieruch) vs rule of three (Hauer) vs no number at all (Metz, Dodds) | "Move on the second consumer, but move the code, not an abstraction" — the synthesis that survives Metz's objection |
| **When to split a component** | Split-on-pain (Dodds) vs small-by-default (Makarevich, Qiu) | Names the signals both accept; rejects line counts, which **no** source defends |
| **Prop count** | ">5, reconsider" vs "20 props can still do one thing well" — and Kondov contradicts himself across two posts | Replaces the count with homogeneity, and states who owns the shape |
| **Clean Architecture on the frontend** | Proponents and pragmatists are arguing about **different codebases** | Presented as a conditional with named conditions, not a recommendation |
| **Prop drilling** | Blogs treat it as a defect; react.dev defends it explicitly | Follows react.dev: the ordered escalation, with the skipped middle step named |
| **`enum` vs `as const`** | Strongly discouraged and banned under `erasableSyntaxOnly`, but `as const` loses the quasi-nominal typing | Recommends `as const`, states the one real trade-off |
| **Where the DAL file lives** | Official Next.js docs contradict themselves (`app/lib/dal.ts` vs `data/`) | Says the folder name is negotiable and names the **lintable invariant** instead |
| **Where Server Actions live** | No convergence anywhere, including official examples | States the agreed part (re-authorize, validate, stay thin) and leaves placement to the feature that owns the data |
| **FSD cost/benefit** | Authoritative for import-rule vocabulary; the overhead complaints are real but poorly sourced | Recommends borrowing the vocabulary; lists adoption conditions and costs |

## Widely repeated advice the sources reject

- **"Pick the right folder structure up front."** React's own docs say don't spend more than five minutes.
- **`components/` `hooks/` `utils/` at the top level.** Correct *inside* a feature; the failure mode as the outermost axis.
- **Atomic Design as a folder taxonomy.** Disowned by its author; the labels were a communication aid.
- **"Extract on the second occurrence" (DRY).** Pushed back by Metz, Dodds and Hauer.
- **Container/Presentational as a mandate.** Retracted in 2019.
- **Server data in Redux / Zustand / `useState`.** The single most-criticized placement error in the current literature.
- **`useEffect` as the default data-fetching mechanism.** react.dev now frames Effects as an escape hatch.
- **"Use middleware for auth" in Next.js.** Optimistic checks only — never hit the database there.
- **"Always wrap every `useQuery` in a custom hook."** TkDodo's own 2020 advice, materially revised by 2026.
- **`(client)` / `(server)` route groups.** They do not stop anything being routable.
- **"`'use client'` means it doesn't render on the server."** A Client Component renders in both places.
- **Deep nesting to mirror the domain.** React's docs recommend a 3–4 level cap.

## Stale — do not cite as current

- **Bulletproof React's pre-2024 barrel advice** — the repo reversed it.
- **FSD's `processes` layer** — deprecated. Any seven-layer FSD diagram showing it is stale.
- **`experimental.ppr`** — removed in Next.js 16, evolved into Cache Components.
- **`middleware.ts`** — renamed `proxy.ts` in Next.js 16; the old name is deprecated.
- **Synchronous `cookies()` / `headers()` / `params`** — async since Next.js 15, a hard error in 16. Note the 2023 security blog still shows the old syntax; its *architecture* is current, its syntax is not.
- **Next.js 13/14-era caching articles** — the defaults reversed in 15 and became opt-in in 16.
- **`modularizeImports`** — superseded by `optimizePackageImports`.
- **`importsNotUsedAsValues` / `preserveValueImports`** — deprecated in favour of `verbatimModuleSyntax`.
- **`boundaries/entry-point` and `boundaries/external`** — deprecated into `boundaries/dependencies`.
- **`const enum` for performance** — a documented footgun; banned under `erasableSyntaxOnly`.
- **Vercel's October 2023 barrel benchmarks** — real, but Next 13.5 + webpack. History, not current Turbopack numbers.
- **`next-env.d.ts` committed to git** — current docs say gitignore it.

## Link health

Checked 2026-09-21.

- **[Smart and Dumb Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)** — Medium returns HTTP 403 to automated fetchers. The page is live for human readers; any link-checker will flag it falsely.
- **[Screaming Architecture (Kettmann)](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)** — the canonical copy at `profy.dev` no longer resolves. This DEV mirror is the surviving copy.
- **[Ariakit — Composition](https://ariakit.com/guide/composition)** — `ariakit.org` 301-redirects here; link to `ariakit.com`.
- **Next.js doc URLs moved**: colocation and private-folder content used to live under `/docs/app/building-your-application/routing/colocation` and now sits inside `/docs/app/getting-started/project-structure`. Older posts — and the 2023 GitHub discussion — still link to the dead path.
- **Rejected during research, do not add**: `profy.dev/article/react-architecture-domain-logic` (DNS does not resolve), `taivara.com/container-components` (TLS chain error), `web.archive.org` (blocks the fetch tool).

## Deliberately excluded

SEO listicles and AI-generated content farms were dropped even when they ranked highly — they overwhelmingly restate Next.js 13-era defaults and link to documentation URLs that no longer exist. Medium and DEV posts are cited only where the author is notable or the content is substantive and unavailable elsewhere.
