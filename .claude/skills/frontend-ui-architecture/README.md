# frontend-ui-architecture

Code-organization skill for the DevDigest frontend (`client/` — Next.js 15.5 App Router,
React 19, TanStack Query 5, next-intl 3). It answers *where does this code go* and *how do I
split this* — components, constants, helpers/lib, types, hooks, business logic, the API layer,
import direction and Server/Client boundaries. It deliberately does **not** cover render
performance (see `react-best-practices`, `next-best-practices`).

It is the frontend counterpart of `onion-architecture` (backend layering).

## Files

| File | Content |
|---|---|
| `SKILL.md` | Rules, placement table, review checklist — what the agent loads |
| `references/structure.md` | Layer map, allowed imports, promotion rule, `features/` question |
| `references/components.md` | Splitting, composition, compound/headless, i18n and styles placement |
| `references/data-and-logic.md` | `lib/hooks`, `queryOptions`, API boundary, business logic, state |
| `references/nextjs.md` | App Router rules for a client with a separate backend, version traps |
| `references/conventions.md` | Constants, helpers vs lib, types, naming, barrels, env |
| `references/enforcement.md` | Lint rules to adopt — proposals, not in the repo yet |
| `examples.md` | Bad → good pairs modelled on the current client |

## How it was built

1. Deep research on 2026-11-24 in five tracks (folder structure, component design, business
   logic/state/API, Next.js App Router, constants/utils/types). Notes:
   `docs/research/research_notes/react-nextjs-architecture/`; synthesis report:
   `docs/research/reports/react-nextjs-architecture.md`.
2. The rules were checked against the actual `client/src` layout and `client/CLAUDE.md`,
   `client/INSIGHTS.md`, so the skill writes down and sharpens existing conventions instead of
   importing a foreign structure.

## Decisions taken (where sources disagree)

| Question | Decision | Sources for / against |
|---|---|---|
| Feature vs type folders | Route-first (`app/<route>/_components`), promote to `components/` / `lib/` on 2nd consumer; no `features/` layer until an ADR | S12, S28, S41, S55 / S54 |
| Private `_components` in `app/` | Yes, for single-route code only | S12, S33 / S55 |
| Barrel files | One explicit `index.ts` per component folder; no `export *`, no aggregating barrels | S37, S54 / S45, S28 |
| One component per file | Not required; small private siblings allowed | S02, S41, S54 |
| `helpers` / `lib` / `utils` | `helpers.ts` = local pure logic; `lib/<topic>.ts` = cross-route logic and configured libraries; no `utils` dump | S28, S35, S54 |
| Query abstraction | `queryOptions` factory + hook in `lib/hooks/<domain>.ts` (hook kept as the public entry, per client/CLAUDE.md) | S49, S50, S24 / S47 |
| Data model | External HTTP API (Fastify); no DAL, no mirroring Route Handlers, no Server Actions for reads | S15, S17, S18 |
| Domain logic style | Pure functions in helpers / lib; no use-case layer for plain GETs | S60, S57 / S62 |
| Naming | Keep current client convention (PascalCase components, kebab modules) | S29, S54, S26 |
| Contracts | `vendor/shared` copies, `import type` only from client | S68 (deviation), client/INSIGHTS.md |

## Open questions (need an ADR, not a skill edit)

- Server-Component fetching or SSR prefetch + `HydrationBoundary` vs client-only fetching for a
  separate backend (no official comparison; TanStack Advanced SSR not yet studied).
- Introducing `src/features/<domain>/`.
- Adding ESLint to `client/` with the boundaries in `references/enforcement.md`.

## Maintaining

- Source IDs are stable: cite them as `[S12]`; append new sources at the end, never renumber.
- When the client upgrades to Next 16 / next-intl 4, revisit `references/nextjs.md` → "Version traps".
- Something non-obvious learned while applying the skill → `client/INSIGHTS.md` via the
  `engineering-insights` skill; promote stable lessons into this skill.

---

# Sources

Consolidated, deduplicated list compiled 2026-11-24 from the five research notes above; no
additional web research. IDs S01… are stable.

**Answers tags:** `folder-structure`, `component-split`, `business-logic`, `state`, `api-layer`, `constants`, `utils-lib`, `types`, `naming`, `nextjs-boundaries`, `server-actions`, `imports-boundaries`, `barrels`, `i18n`.

**Status:** `verified` = page was fetched and read during the research session. `secondary` = known only from a search snippet, a mirror or a third-party summary, or only partly read. `outdated` = superseded or pre-hooks/pre-App-Router advice; cite for background only.

---

## 1. Official docs

| # | Source | Author/Org | Date/Version | Answers | Status |
|---|---|---|---|---|---|
| S01 | [Thinking in React](https://react.dev/learn/thinking-in-react) | React team (react.dev) | current | component-split, state | verified (gives no file/folder advice) |
| S02 | [Your First Component](https://react.dev/learn/your-first-component) | React team | current | component-split, naming | verified |
| S03 | [Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | React team | current | component-split | verified |
| S04 | [Passing Props to a Component](https://react.dev/learn/passing-props-to-a-component) | React team | current | component-split | verified |
| S05 | [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) | React team | current | component-split, state | verified |
| S06 | [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | React team | current | state, component-split | verified |
| S07 | [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team | current | state, business-logic, utils-lib | verified |
| S08 | [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | React team | current | business-logic, naming | verified (fetched for business_logic_state.md; marked not fetched in component_design.md / constants_utils_types.md) |
| S09 | [Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies) | React team | current | constants, utils-lib | verified |
| S10 | [`'use client'` reference](https://react.dev/reference/rsc/use-client) | React team | current | nextjs-boundaries | verified |
| S11 | [File Structure (legacy FAQ)](https://legacy.reactjs.org/docs/faq-structure.html) | React team (legacy docs) | pre-2023 | folder-structure | outdated (legacy site; current react.dev has no folder-structure page; principle still widely cited) |
| S12 | [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | Vercel / Next.js | lastUpdated 2026-07-21 (Next 16 docs) | folder-structure, nextjs-boundaries | verified |
| S13 | [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Vercel / Next.js | lastUpdated 2026-10-05 (Next 16 docs) | nextjs-boundaries, state | verified |
| S14 | [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | Vercel / Next.js | Next 16 docs | nextjs-boundaries | secondary (linked from S13, not fetched) |
| S15 | [Data Security guide](https://nextjs.org/docs/app/guides/data-security) | Vercel / Next.js | lastUpdated 2026-11-18 (Next 16 docs) | api-layer, nextjs-boundaries, server-actions | verified |
| S16 | [Security of Server Components and Actions (Next.js blog)](https://nextjs.org/blog/security-nextjs-server-components-actions) | Sebastian Markbåge (Vercel) | 2023-10-23 | api-layer, nextjs-boundaries, server-actions | verified (original rationale; some APIs dated, e.g. sync `cookies()`; S15 is the maintained version) |
| S17 | [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data) | Vercel / Next.js | lastUpdated 2026-10-15 (Next 16 docs) | server-actions | verified (replaces the old "updating-data" URL, which now 404s) |
| S18 | [Backend for Frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend) | Vercel / Next.js | lastUpdated 2026-11-06 (Next 16 docs) | api-layer, server-actions | verified |
| S19 | [Environment variables guide](https://nextjs.org/docs/app/guides/environment-variables) | Vercel / Next.js | lastUpdated 2026-08-25 | constants | verified |
| S20 | [`optimizePackageImports`](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) | Vercel / Next.js | lastUpdated 2025-12-19, experimental | barrels | verified (only architecturally relevant as a barrel workaround) |
| S21 | [Next.js 16 release blog](https://nextjs.org/blog/next-16) | Vercel / Next.js | 2025-10-21 | nextjs-boundaries, folder-structure | verified (version delta vs project's Next 15.5) |
| S22 | [next-intl: App Router setup](https://next-intl.dev/docs/getting-started/app-router) | next-intl | current (v4 on Next 16) | i18n | verified (project is on next-intl v3) |
| S23 | [next-intl: Routing setup](https://next-intl.dev/docs/routing/setup) | next-intl | current (v4 on Next 16) | i18n | verified (uses `proxy.ts` and `next/root-params`, not available in project's versions) |
| S24 | [TanStack Query: Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) | TanStack | current (v5) | state, api-layer | verified |
| S25 | [Redux Style Guide](https://redux.js.org/style-guide/) | Redux team | living docs | state, business-logic, folder-structure | verified (rule names and priorities; full rationale text of some rules not read) |
| S26 | [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) | Google | living | naming, constants, types, utils-lib | verified (`snake_case` files and no-default-exports are Google-internal conventions, rare in React/Next) |
| S27 | [Radix Primitives: Composition (`asChild`)](https://www.radix-ui.com/primitives/docs/guides/composition) | Radix UI (WorkOS) | current | component-split | verified (still shows `forwardRef`; React 19 passes `ref` as a prop) |

## 2. Reference architectures and repos

| # | Source | Author/Org | Date/Version | Answers | Status |
|---|---|---|---|---|---|
| S28 | [Bulletproof React: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Alan Alickovic | living repo doc | folder-structure, imports-boundaries, barrels, utils-lib, types, constants, state | verified |
| S29 | [Bulletproof React: Project Standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) | Alan Alickovic | living repo doc | naming, imports-boundaries | verified |
| S30 | [Bulletproof React: API Layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md) | Alan Alickovic | living repo doc (no date) | api-layer | verified |
| S31 | [Bulletproof React: State Management](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md) | Alan Alickovic | living repo doc | state | verified |
| S32 | [Bulletproof React: `src/config/env.ts`](https://github.com/alan2207/bulletproof-react/blob/master/apps/react-vite/src/config/env.ts) | Alan Alickovic | living repo (Vite app) | constants, types | verified (Vite `import.meta.env`, not Next.js) |
| S33 | [Bulletproof React: `apps/nextjs-app`](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app) | Alan Alickovic | `next ^14.2.5`, last touched 2026-04-30 | folder-structure, api-layer, state, nextjs-boundaries | verified via GitHub API (Next 14: sync `searchParams`, runtime `typeof window` client split; update before copying) |
| S34 | [Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview) | FSD team | FSD v2.1 | folder-structure, imports-boundaries | verified (`processes` layer deprecated) |
| S35 | [Feature-Sliced Design: Layers](https://feature-sliced.design/docs/reference/layers) | FSD team | FSD v2.1 | folder-structure, utils-lib, constants, imports-boundaries | verified |
| S36 | [Feature-Sliced Design: Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | FSD team | FSD v2.1 | folder-structure, naming, types, constants | verified |
| S37 | [Feature-Sliced Design: Public API](https://feature-sliced.design/docs/reference/public-api) | FSD team | FSD v2.1 | barrels, imports-boundaries | verified |
| S38 | [Feature-Sliced Design: Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | FSD team | current | folder-structure, nextjs-boundaries, barrels | verified (Server Actions not covered) |
| S39 | [vercel/commerce](https://github.com/vercel/commerce) | Vercel | `next 15.6.0-canary.60` | folder-structure, server-actions, api-layer | verified via GitHub API (tree only) |
| S40 | [next-forge: Structure](https://www.next-forge.com/docs/structure); repo [vercel/next-forge](https://github.com/vercel/next-forge) | Vercel | current | folder-structure, imports-boundaries, constants | verified (monorepo scale; DevDigest has no workspace) |

## 3. Articles by recognized authors

| # | Source | Author/Org | Date/Version | Answers | Status |
|---|---|---|---|---|---|
| S41 | [Colocation](https://kentcdodds.com/blog/colocation) | Kent C. Dodds | 2019-06-17 | folder-structure, component-split, utils-lib | verified (old but principle restated by 2025–2026 sources) |
| S42 | [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Kent C. Dodds | 2019-09-23 | state | verified (old; decision tree still current) |
| S43 | [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Kent C. Dodds | 2020-07-21 | state | secondary (pre-2023; core advice holds, check API details) |
| S44 | [Compound Components with React Hooks](https://kentcdodds.com/blog/compound-components-with-react-hooks) | Kent C. Dodds | 2019-02-18 | component-split | verified (old; pattern still current) |
| S45 | [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | Dominik Dorfmeister (TkDodo) | 2024-07-26 | barrels, imports-boundaries | verified |
| S46 | [Component Composition is great btw](https://tkdodo.eu/blog/component-composition-is-great-btw) | TkDodo | 2024-09-21 | component-split | verified |
| S47 | [Practical React Query](https://tkdodo.eu/blog/practical-react-query) | TkDodo | 2020-11-16, updated 2023-10-21 | state, api-layer | secondary ("custom hook per query" advice superseded by S49/S50; still the series index) |
| S48 | [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | TkDodo | 2021-06-13, updated 2022-04-23 | state, api-layer | outdated (separate key factories partly superseded by `queryOptions` factories, S49) |
| S49 | [The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | TkDodo | 2024-01-17 | state, api-layer | verified |
| S50 | [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) | TkDodo | 2026-02-23 | state, api-layer | verified |
| S51 | [Type-safe React Query](https://tkdodo.eu/blog/type-safe-react-query) | TkDodo | 2023-01-07, updated 2023-10-21 | api-layer, types | verified |
| S52 | [React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms) | TkDodo | 2022-04-10 | state | secondary (pre-2023; predates React 19 form Actions and Server Actions) |
| S53 | [Working with Zustand](https://tkdodo.eu/blog/working-with-zustand) | TkDodo | 2022-11-20 | state, business-logic | secondary (pre-2023; principles hold) |
| S54 | [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Josh W. Comeau | 2022-03-15, updated 2025-12-03 | folder-structure, component-split, constants, utils-lib, types, naming, barrels | verified (deliberate counter-position: by function, not feature) |
| S55 | [React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | Robin Wieruch | updated 2026-05-05 | folder-structure, barrels | verified |
| S56 | [Screaming Architecture – Evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) | Johannes Kettmann (profy.dev) | 2022-02-25 | folder-structure, naming, barrels | verified via dev.to cross-post (profy.dev unreachable, DNS failure) |
| S57 | [Path To A Clean(er) React Architecture, Part 6: Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) (mirror: [dev.to](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g)) | Johannes Kettmann | 2024-06-21 | business-logic, state | verified via dev.to mirror (canonical profy.dev URL unreachable) |
| S58 | [Path To A Clean(er) React Architecture: Domain Entities & DTOs](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0) | Johannes Kettmann | 2024 (series) | api-layer, types | verified (dev.to mirror of profy.dev series) |
| S59 | Kettmann "Path To A Clean(er) React Architecture", other parts: [Part 1 shared API client](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-a-shared-api-client-2d4p), [Part 2 fetch functions](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-fetch-functions-4jin), [Part 3 data transformations](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-data-transformations-1go0), [Part 7 domain logic](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-7-domain-logic-lg), [Part 8 React Query](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-8-how-does-react-query-fit-into-the-picture-1b99) | Johannes Kettmann | 2024 (series) | api-layer, business-logic | secondary (titles and URLs from the series index; contents not fetched) |
| S60 | [Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Juntao Qiu (martinfowler.com) | 2023-02-07..16 | business-logic, api-layer, folder-structure, component-split | verified |
| S61 | [Headless Component: a pattern for composing React UIs](https://martinfowler.com/articles/headless-component.html) | Juntao Qiu (martinfowler.com) | 2023-11-07 | component-split, business-logic | verified |
| S62 | [Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | Alex Bespoyasov | 2021-09-02 | business-logic | secondary (pre-2023; principles hold, author lists real costs) |
| S63 | [Client-Side Architecture Basics (introduction)](https://khalilstemmler.com/articles/client-side-architecture/introduction/) | Khalil Stemmler | updated 2020-06-24 | business-logic | secondary (framing only; layer details not on the fetched page) |
| S64 | [Before You memo()](https://overreacted.io/before-you-memo/) | Dan Abramov | 2021-02-23 | component-split, state | verified (techniques framed as architectural, not only performance) |
| S65 | [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) (short URL: [medium.com/@dan_abramov/7ca2f9a7c7d0](https://medium.com/@dan_abramov/7ca2f9a7c7d0)) | Dan Abramov | 2015, 2019 update note | component-split, folder-structure | outdated (author walked it back in 2019; hooks replace the split; Medium returned 403, update note confirmed only via S75 and snippets) |
| S66 | [Scalable file structure for React and other projects](https://react-file-structure.surge.sh/) | Dan Abramov | old | folder-structure | secondary (joke-but-serious page; "move files around until it feels right") |
| S67 | [Common mistakes with the Next.js App Router and how to fix them](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) | Lee Robinson (Vercel) | 2024-01-08 | nextjs-boundaries, server-actions | verified |
| S68 | [Where to put your types in application code](https://www.totaltypescript.com/where-to-put-your-types-in-application-code) | Matt Pocock (Total TypeScript) | no date visible | types | verified |
| S69 | [Should you use declaration files to store your types? (Pro Essentials exercise)](https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don't-control/should-you-use-declaration-files-to-store-your-types) | Matt Pocock | n/a | types | secondary (search snippet only) |
| S70 | [Total TypeScript Essentials, ch. 13: Modules, scripts and declaration files](https://www.totaltypescript.com/books/total-typescript-essentials/modules-scripts-and-declaration-files) | Matt Pocock | n/a | types | secondary (search snippet only) |
| S71 | [Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) | patterns.dev (Lydia Hallie, Addy Osmani) | current | component-split | verified |
| S72 | [Compound Pattern](https://www.patterns.dev/react/compound-pattern/) | patterns.dev | current | component-split | verified |
| S73 | Fernando Rojo, "Composition Is All You Need" (React Universe Conf 2025), third-party write-ups: [talk summary](https://youtubesummary.com/summary/4KvbVq3Eg5w), [blog write-up](https://singhkunal2050v2.netlify.app/blog/react-composition-patterns-beyond-boolean-props), [notes](https://second-brain-nuxt.vercel.app/composition-is-all-you-need) | Fernando Rojo (via third parties) | 2025 | component-split | secondary (recording/slides not accessed; verify quotes) |
| S74 | [vercel-composition-patterns agent skill](https://skills.sh/vercel-labs/agent-skills/vercel-composition-patterns) | Vercel Labs | current | component-split | secondary (packaging of S73 rules; not read in full) |
| S75 | [How to convert your existing Redux containers to Hooks](https://blog.logrocket.com/how-to-convert-your-existing-redux-containers-to-hooks) | LogRocket | n/a | component-split | secondary (used only to confirm S65's 2019 note) |
| S76 | [Move files around until it feels right](https://dev.to/dance2die/move-files-around-until-it-feels-right-2lek) | dance2die (DEV) | n/a | folder-structure | secondary (search result; reports the original Abramov tweet is deleted) |
| S77 | [Utils considered harmful](https://spiral-ladder.github.io/tech/2026/01/31/utils-considered-harmful.html) | spiral-ladder (blog) | 2026-01-31 | utils-lib | secondary (search snippet only; low authority) |
| S78 | [Your utils folder is a crime scene](https://dev.to/nurrehman/your-utils-folder-is-a-crime-scene-5095) | nurrehman (DEV) | n/a | utils-lib | secondary (search snippet only; low authority) |
| S79 | [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) | Airbnb | pre-2020 | naming | outdated (class-era; not fetched) |

## 4. Tooling for enforcing conventions

| # | Source | Author/Org | Date/Version | Answers | Status |
|---|---|---|---|---|---|
| S80 | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries); docs: [rules](https://www.jsboundaries.dev/docs/rules/), [overview](https://www.jsboundaries.dev/docs/overview/) | Javier Brea (JS Boundaries) | v7.4.1 | imports-boundaries | verified (`element-types`, `entry-point`, `external`, `no-private` deprecated in favour of `boundaries/dependencies`) |
| S81 | [eslint-plugin-import `no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | import-js | current | imports-boundaries | verified (`eslint-plugin-import-x` / ESLint 9 flat-config status not checked) |
| S82 | [Steiger (FSD linter)](https://github.com/feature-sliced/steiger) | FSD team | beta | imports-boundaries, barrels | verified |
| S83 | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Sander Verweij | current | imports-boundaries | verified (TS path-alias resolution not confirmed) |
| S84 | [eslint-plugin-check-file](https://github.com/dukeluo/eslint-plugin-check-file) | dukeluo | v3+ flat config only (v2.x legacy) | naming, barrels (`no-index`) | verified (no release date visible) |
| S85 | [Knip](https://knip.dev/) | Knip | current | utils-lib, types, imports-boundaries | verified |
| S86 | [T3 Env: Introduction](https://env.t3.gg/docs/introduction); [T3 Env: Next.js](https://env.t3.gg/docs/nextjs) | T3 (t3-oss) | current | constants, nextjs-boundaries | verified (Next 16+ note on importing in `next.config.ts`) |

`server-only` / `client-only` packages have no standalone source in the notes. Their behaviour (build fails if a Client Component imports a `server-only` module; packages optional because Next.js handles them internally) is documented in S13 and applied in S15 and S38.

---

## Question → sources

| Question | Primary | Supporting / background |
|---|---|---|
| Where do components live (route-local vs shared vs feature)? | S12, S28, S33 | S34, S38, S39, S54, S55, S56, S41, S11, S66 |
| How to split a component (granularity, composition, props API, container/presentational) | S01, S02, S04, S05, S46, S61 | S03, S06, S27, S44, S64, S71, S72, S41, S54, S73, S74, S65 (outdated) |
| Where do constants and config/env live? | S28, S19, S86 | S32, S35, S36, S54, S26, S09 |
| utils vs helpers vs lib (and the junk drawer) | S28, S35, S54 | S36, S55, S41, S26, S09, S07, S85, S77, S78 |
| Where does business/domain logic live (components vs hooks vs plain TS)? | S60, S57, S08 | S62, S58, S25, S53, S63, S59, S61 |
| Server state vs client state; where global client state lives | S49, S50, S24, S31 | S43, S42, S25, S53, S52, S47, S48, S06, S07, S13 |
| API layer (client, fetchers, validation, DTO mapping, BFF) | S30, S15, S18, S51, S58 | S33, S60, S16, S39, S59, S36, S47 |
| Types (colocated vs shared, `.d.ts`, contracts) | S68, S28 | S54, S36, S26, S51, S58, S69, S70 |
| Naming (files, folders, hooks, exports) | S29, S84, S08 | S54, S26, S56, S02, S36, S79 (outdated) |
| Server/Client Component boundaries | S13, S10, S15 | S14, S16, S67, S38, S12, S86 |
| Server Actions (placement, validation, not for fetching) | S17, S15 | S16, S18, S39, S67 |
| Barrel files (`index.ts`) | S45, S28, S37 | S54, S55, S56, S38, S20, S82, S84 |
| Import boundaries and their enforcement | S28, S81, S80 | S34, S35, S37, S82, S83, S85, S45 (`import/no-cycle`), S29 (`@/*` alias), S40 |
| i18n placement (next-intl) | S22, S23 | S21 |

---

## Known conflicts between sources

1. **Barrel files.** Against internal barrels: S28 (reversed its earlier advice; import directly), S45 (only at library entry points). For a narrow index as a module contract: S37 (one index per slice, no `export *`, none inside segments), S56, S54 (per-component `index.ts`), S55 (allows it but says barrels are "getting out of fashion"). S54 reports `export *` breaking on the App Router; S20 is a framework workaround, not an endorsement.
2. **Feature folders vs type folders.** Feature-first: S28, S34, S55, S56. By function/type deliberately: S54. Neutral ("pick one, be consistent"): S12, S11, S66.
3. **One component per file.** Not required: S02 (several small related components per file is fine), S41 (delete `no-multi-comp`), S54. No source in the notes argues for enforcing it.
4. **Private `_folders` inside `app/`.** S12 recommends them for clarity and future-proofing; S33 uses route-local `_components/`; S55 advises against private folders in `app/` so features stay reusable across pages.
5. **Meaning of `lib` / `utils` / `helpers`.** S28: `lib` = preconfigured third-party libraries, `utils` = shared functions. S35: `lib` = focused internal libraries, explicitly "not helpers or utilities". S54: `utils` = project-agnostic, `helpers` = project-specific.
6. **`types` folders.** Allowed at global and feature level: S28, S54, S68 (`*.types.ts`). Discouraged as a segment name (name by purpose, put types in `model`/`api`): S36.
7. **File naming case and exports.** kebab-case everything: S29/S84. PascalCase component files + kebab-case others: S54. `snake_case` files and named exports only: S26 (conflicts with Next.js's required default exports for `page`/`layout`).
8. **Query abstraction unit.** Custom hook per query + separate key factory: S47, S48 (older). `queryOptions` factories, hooks only when they add logic: S49, S50, S24 (current).
9. **Domain model style.** Classes (`PaymentMethod`, Strategy objects): S60. Functions with dependency injection: S62, S57. Shared core: no React imports in domain code.
10. **Container/presentational split.** Original pattern: S65 (walked back by the author in 2019). Replaced by hooks / headless components: S71, S61, S08.
11. **Types in `.d.ts`.** S69/S70 say `.d.ts` is for describing JS and global augmentation, not app types; a secondhand "never use `.d.ts`" claim attributed to Pocock (no URL) conflicts and should not be cited.
12. **Custom hooks around `useQuery`.** S08 encourages hooks to wrap Effects and reusable logic; S49/S50 call hooks that only wrap `useQuery` "a bit pointless" for server data.

---

## Version notes

- **Next.js docs are on 16, the project is on 15.5.** S12–S15, S17–S19 describe Next.js 16 (released 2025-10-21, S21). DevDigest's client pins `next ^15.5.29`. Architecture guidance is the same, but: `middleware.ts` is `proxy.ts` in 16; `refresh()` and `updateTag()` are 16-only; 16 removes sync `params`/`searchParams`/`cookies()` access. Mark 16-only APIs as such in the skill.
- **next-intl.** S22/S23 describe next-intl v4 on Next 16 (`proxy.ts`, `next/root-params` from Next 16.3, `setRequestLocale` legacy). The project is on `next-intl ^3.26.5` + Next 15, so the equivalents are `middleware.ts` and no `root-params`.
- **Bulletproof `apps/nextjs-app` (S33)** is on `next ^14.2.5` with sync `searchParams` and a runtime `typeof window` client/server split; update to async APIs and a `server-only` server fetch before reusing the pattern.
- **Vercel Commerce (S39)** is on `next 15.6.0-canary.60`, closest to the project's version.
- **Bulletproof `env.ts` (S32)** is the Vite app (`import.meta.env`, `VITE_APP_` prefix); for Next.js use S19 + S86.
- **TanStack Query.** S24, S49, S50 reflect v5 `queryOptions`; the project uses `@tanstack/react-query ^5`. S47/S48 predate it.
- **React 19.** S27 still shows `forwardRef`; React 19 passes `ref` as a normal prop (background knowledge, not fetched). S52 predates React 19 form Actions.
- **Old URLs to avoid:** `nextjs.org/docs/13|14/.../routing/colocation` (superseded by S12); the old Next.js "updating-data" page (404, replaced by S17). Pages Router APIs (`getServerSideProps`, `getStaticProps`, `pages/api` as default backend) are out of scope.
- **eslint-plugin-boundaries (S80)** v7.4.1: use `boundaries/dependencies`; older `element-types`/`entry-point`/`no-private`/`external` rules are deprecated. **eslint-plugin-check-file (S84)** v3+ is flat-config only.
- **FSD (S34)**: the `processes` layer is deprecated.

## Gaps / not verified

- **Not fetched at all:** S14 (Server and Client Boundary guide), S59 (Kettmann parts 1/2/3/7/8), S79 (Airbnb), TanStack "Advanced SSR" docs (no URL in notes), Zod `z.infer` docs (notes suggest citing https://zod.dev but it was not fetched), react.dev "Rules of Hooks" and "Sharing State Between Components", shadcn/ui docs, Vite env docs, typescript-eslint organization rules (`consistent-type-imports`, `consistent-type-definitions`, `no-namespace`), the Next.js `examples/` directory, shadcn `taxonomy`.
- **Known only secondhand:** S65 (Medium 403; exact 2019 note text unverified), S69, S70, S73–S78. S57's canonical profy.dev URL was unreachable; content was read via the dev.to mirror.
- **Partly read:** S25 (rule names/priorities, not every rationale), S47 (series index; "Testing React Query" part not read), S63 (intro only), S39 (repo tree only).
- **No source found for:** a numeric threshold for splitting components or limiting props; an official feature-folder name for Server Actions (`features/x/actions.ts` vs S39's component-colocated `actions.ts` vs `app/lib/actions.ts`); an official folder layout for an API client that talks to a separate backend from Next.js; a 2024–2026 primary comparison of Context vs Zustand; when to switch between Next.js organization strategies; next-intl namespace-per-feature guidance; architectural (non-performance) costs of barrels beyond cycles and false privacy; the exact "dump" article FSD links from S35.
- **Inferences in the notes, not source statements** (do not cite as sourced): server-only/browser split of the API client for DevDigest; Server Actions as an optional BFF hop in front of Fastify; reusing one Zod schema for form and API validation; a `no-restricted-properties` lint rule on `process.env`; Next.js default exports as an exemption to S26.
- **Project-specific deviation:** DevDigest copies Zod contracts into `server/src/vendor/shared` and `client/src/vendor/shared` instead of a shared package (S68 rule 3); the README should call this out.
