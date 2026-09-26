# react-frontend-architecture

Local skill (authored in this repo, not vendored). It decides **where code
lives and how it is layered** in `client/`: component placement, splitting,
constants, helpers, types, business logic, state ownership, the Next.js
Server/Client boundary, and import direction.

- `SKILL.md`: the rules, placement table, and review checklist.
- `examples.md`: before/after pairs for each rule.
- This file: the decisions behind the rules, the alternatives that were
  rejected, and the sources.

Research was done on 2026-09-25 across official docs, reference
architectures, and widely cited authors. Where sources disagree the skill
takes a side; the table below says which and why, so the decision can be
revisited on evidence rather than taste.

## Decisions

| # | Question | Decision in this skill | Rejected alternative | Why |
|---|---|---|---|---|
| 1 | Where does feature code live in an App Router app? | Route-scoped UI in `_components/` beside `page.tsx`; cross-route UI in `src/components/`; data hooks and topic helpers in `src/lib/`; `src/features/<domain>/` only once a domain is shared by 2+ routes | `src/features/` from day one (Bulletproof React, Wieruch); everything colocated in routes forever (Makerkit) | Next.js is explicitly unopinionated and asks only for consistency. The client already follows route colocation, and no domain is shared widely enough to justify a features layer. The trigger for creating one is written down so it is not skipped. |
| 2 | Barrel `index.ts` files? | One-line named re-export per component folder; no aggregate barrels, no `export *`; new code imports domain hook files directly | Per-feature public-API barrels (Feature-Sliced Design, Wieruch, Kettmann); no barrels at all (TkDodo, Bulletproof) | Aggregate barrels measurably slow Next.js dev and tests and hide cycles. A single re-export per component keeps import paths stable at negligible cost and matches existing folders. The existing `src/lib/hooks/index.ts` is grandfathered, not extended. |
| 3 | How thick is the non-React layer? | View → hooks (orchestrate) → plain modules (decide) → api. No repository classes, no DI containers | Hooks only (React docs, Dodds); full application/domain/infrastructure layering with DI (Stemmler, Kettmann) | Plain modules give the testability win without a framework. Full clean-architecture layering pays off in apps with swappable transports; this app has one Fastify API and Zod contracts already acting as the boundary. |
| 4 | Split proactively or on pain? | On named triggers (second responsibility, loops in markup, private state, re-render isolation, screen size) | Split only when a concrete problem appears (Dodds); split by single responsibility everywhere (React docs) | Triggers make the rule reviewable. Pure "wait for pain" leads to 400-line pages; pure "single responsibility" leads to one-line components. |
| 5 | Folder naming | PascalCase files and folders under `_components/` (one component per file; a folder once it has siblings), kebab-case everywhere else | kebab-case everywhere (Bulletproof, Wieruch, Kettmann) | Root `CLAUDE.md` already fixes this convention and the codebase follows it; changing it buys nothing. |
| 6 | Generic `utils/` folder? | None. `helpers.ts` beside the consumer; promoted helpers become `src/lib/<topic>.ts` with a test | `src/utils/` + `src/helpers/` (Comeau, Bulletproof) | Type-named folders become junk drawers; topic-named modules stay discoverable and deletable. Matches FSD's `shared/lib/<topic>` and Dodds's colocation. |
| 7 | Server prefetch + hydrate, or client fetching? | Client fetching through React Query hooks; server `page.tsx` renders a client view; prefetch/hydrate only for a measured first-paint problem | Prefetch in every page (TanStack advanced SSR, Bulletproof Next example) | The backend is a separate HTTP API and the UI polls and refetches on focus; a browser cache is the right tool and Next.js documents this as a supported model. Hydration adds a second cache to keep consistent. |
| 8 | Context: state manager or injection? | Injection and scoping (`Provider` + `useX()` that throws); not a general store | Context + reducer as app state (React docs "Scaling Up") | With server state in React Query and URL state in the router, little global client state remains; what remains (theme, active repo, toasts) is resolved-once values, which is injection. |
| 9 | Enforce boundaries with lint? | Yes: dependency-cruiser (`pnpm lint:arch` with a known-violations baseline) as source of truth, mirrored as core-ESLint `no-restricted-imports` warnings; to be added | `import/no-restricted-paths` via eslint-plugin-import; eslint-plugin-boundaries; rely on review | Every methodology that survives at scale enforces direction mechanically. The server package already uses dependency-cruiser plus ESLint mirrors, so the client uses the same tools and CI shape rather than a second plugin. |

## What this skill does not cover

- Anti-patterns inside a component (effects, keys, memo, derived state): `react-best-practices`.
- Next.js file conventions, async params, metadata, error files: `next-best-practices`.
- Testing the pieces once split: `react-testing-library`.
- The design system in `src/vendor/ui/`: its own README.

## Sources

Grouped by what each was used for. Dates are the page's own publication or
last-updated date where shown.

### Official documentation

- React, "Thinking in React" — https://react.dev/learn/thinking-in-react
- React, "Choosing the State Structure" — https://react.dev/learn/choosing-the-state-structure
- React, "Sharing State Between Components" — https://react.dev/learn/sharing-state-between-components
- React, "Reusing Logic with Custom Hooks" — https://react.dev/learn/reusing-logic-with-custom-hooks
- React, "Extracting State Logic into a Reducer" — https://react.dev/learn/extracting-state-logic-into-a-reducer
- React, "You Might Not Need an Effect" — https://react.dev/learn/you-might-not-need-an-effect
- React, "Passing Data Deeply with Context" — https://react.dev/learn/passing-data-deeply-with-context
- React, "Scaling Up with Reducer and Context" — https://react.dev/learn/scaling-up-with-reducer-and-context
- Next.js, "Project Structure and Organization" — https://nextjs.org/docs/app/getting-started/project-structure
- Next.js, "Server and Client Components" — https://nextjs.org/docs/app/getting-started/server-and-client-components
- Next.js, "The Server and Client Boundary" — https://nextjs.org/docs/app/guides/server-and-client-boundary
- Next.js, "Fetching Data" — https://nextjs.org/docs/app/getting-started/fetching-data
- Next.js, "Client-side data fetching" — https://nextjs.org/docs/app/guides/client-side-data-fetching
- Next.js, "TanStack Query" guide — https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query
- Next.js, "Mutating Data" — https://nextjs.org/docs/app/getting-started/mutating-data
- Next.js, "Data Security" — https://nextjs.org/docs/app/guides/data-security
- Next.js, "Authentication" — https://nextjs.org/docs/app/guides/authentication
- Next.js, "Backend for Frontend" — https://nextjs.org/docs/app/guides/backend-for-frontend
- Next.js, "Layouts and Pages" — https://nextjs.org/docs/app/getting-started/layouts-and-pages
- Next.js, "Single Page Applications" — https://nextjs.org/docs/app/guides/single-page-applications
- Next.js, "CSS" — https://nextjs.org/docs/app/getting-started/css
- Next.js, "CSS-in-JS" — https://nextjs.org/docs/app/guides/css-in-js
- Next.js, "Environment Variables" — https://nextjs.org/docs/app/guides/environment-variables
- Next.js, `optimizePackageImports` — https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports
- TanStack Query, "Advanced Server Rendering" — https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
- T3 Env — https://env.t3.gg/docs/introduction , https://env.t3.gg/docs/nextjs

### Reference architectures and methodologies

- Alan Alickovic, Bulletproof React (docs `project-structure.md`, `project-standards.md`, `components-and-styling.md`, `state-management.md`; `apps/react-vite` ESLint config; `apps/nextjs-app`) — https://github.com/alan2207/bulletproof-react
- Feature-Sliced Design: Overview, Layers, Slices and segments, Public API, Cross-imports — https://feature-sliced.design/docs/get-started/overview ; Steiger linter — https://github.com/feature-sliced/steiger
- Robin Wieruch, "React Folder Structure in 5 Steps" (updated 2026-05-05) — https://www.robinwieruch.de/react-folder-structure/
- Josh W. Comeau, "Delightful React File/Directory Structure" (2022, updated 2025-12-03) — https://www.joshwcomeau.com/react/file-structure/
- Alex Kondov, "Tao of React" (2021) — https://alexkondov.com/tao-of-react/
- Alex Kondov, "Clean Architecture in React" (2024) — https://alexkondov.com/full-stack-tao-clean-architecture-react/
- Alex Kondov, "Hexagonal-Inspired Architecture in React" (2022) — https://alexkondov.com/hexagonal-inspired-architecture-in-react/
- Johannes Kettmann, "Screaming Architecture: Evolution of a React folder structure" (2022) — https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25
- Johannes Kettmann, "Path to a Cleaner React Architecture, Part 6: Business Logic Separation" (2024) — https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g
- Johannes Kettmann, "Path to a Cleaner React Architecture: Domain Entities & DTOs" (2024) — https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0
- Khalil Stemmler, "Client-Side Architecture Basics" (2020) — https://khalilstemmler.com/articles/client-side-architecture/introduction/ , /layers/ , /principles
- Tania Rascia, "How to Structure and Organize a React Application" (2021) — https://www.taniarascia.com/react-architecture-directory-structure/
- Sergio Azócar, "Screaming Architecture: the key to a scalable frontend" (2025) — https://sergioazocar.com/en/blog/screaming-architecture-the-key-to-scalable-frontend/
- Petar Ivanov, "Screaming Architecture & Colocation" (2026) — https://thetshaped.dev/p/screaming-architecture-and-colocation-nodejs-typescript-react
- Will T., "Folder Structures in React Projects" (2024) — https://dev.to/itswillt/folder-structures-in-react-projects-3dp8

### Component design, state, and business logic

- Dan Abramov, "Presentational and Container Components" (2015; 2019 retraction note) — https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0
- Dan Abramov, "Writing Resilient Components" (2019) — https://overreacted.io/writing-resilient-components/
- Dan Abramov, "The Wet Codebase" (Deconstruct 2019) — https://www.deconstructconf.com/2019/dan-abramov-the-wet-codebase
- Martin Fowler, "Presentation Domain Data Layering" (2015) — https://martinfowler.com/bliki/PresentationDomainDataLayering.html
- Juntao Qiu, "Modularizing React Applications with Established UI Patterns" (2023) — https://martinfowler.com/articles/modularizing-react-apps.html
- Juntao Qiu, "Headless Component" (2023) — https://martinfowler.com/articles/headless-component.html
- Kent C. Dodds, "Colocation" (2019) — https://kentcdodds.com/blog/colocation
- Kent C. Dodds, "State Colocation will make your React app faster" (2019) — https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
- Kent C. Dodds, "Application State Management with React" (2020) — https://kentcdodds.com/blog/application-state-management-with-react
- Kent C. Dodds, "When to break up a component into multiple components" (2019) — https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components
- Kent C. Dodds, "AHA Programming" (2020) — https://kentcdodds.com/blog/aha-programming
- Kent C. Dodds, "Don't Sync State. Derive It!" (2019) — https://kentcdodds.com/blog/dont-sync-state-derive-it
- Kent C. Dodds, "How to use React Context effectively" (2021) — https://kentcdodds.com/blog/how-to-use-react-context-effectively
- Kent C. Dodds, "Compound Components with React Hooks" (2019) — https://kentcdodds.com/blog/compound-components-with-react-hooks
- Dominik Dorfmeister (TkDodo), "Practical React Query" — https://tkdodo.eu/blog/practical-react-query
- Dominik Dorfmeister, "React Query as a State Manager" — https://tkdodo.eu/blog/react-query-as-a-state-manager
- Dominik Dorfmeister, "Effective React Query Keys" — https://tkdodo.eu/blog/effective-react-query-keys
- Dominik Dorfmeister, "Thinking in React Query" — https://tkdodo.eu/blog/thinking-in-react-query
- Dominik Dorfmeister, "React Query and React Context" — https://tkdodo.eu/blog/react-query-and-react-context
- Dominik Dorfmeister, "The Uphill Battle of Memoization" — https://tkdodo.eu/blog/the-uphill-battle-of-memoization
- Nadia Makarevich, "Components composition: how to get it right" (2022) — https://www.developerway.com/posts/components-composition-how-to-get-it-right
- Dimitri Dumont, "Hexagonal architecture in front-end" (2022, updated 2026) — https://www.dimitri-dumont.fr/en/blog/hexagonal-architecture-front-end
- tddfellow, "Learning hour: Hexagonal Architecture in React" — https://github.com/tddfellow/learning-hour-hexagonal-architecture-in-react

### Types, barrels, boundaries, tooling

- Matt Pocock, "Where To Put Your Types in Application Code" — https://www.totaltypescript.com/where-to-put-your-types-in-application-code
- Matt Pocock, "Type vs Interface: Which Should You Use?" — https://www.totaltypescript.com/type-vs-interface-which-should-you-use
- Serghei, "Where Your Types Live Matters More Than You Think" — https://blog.serghei.pl/posts/where-your-types-live-matters/
- Dominik Dorfmeister, "Please Stop Using Barrel Files" (2024) — https://tkdodo.eu/blog/please-stop-using-barrel-files
- Marvin Hagemeister, "Speeding up the JavaScript ecosystem: the barrel file debacle" (2023) — https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/
- Shu Ding (Vercel), "How we optimized package imports in Next.js" (2023) — https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
- Marc Nuri, "Barrel exports in JavaScript/TypeScript" (updated 2026) — https://blog.marcnuri.com/barrel-exports-javascript-typescript
- Maksym Kuzmitskyi, "React playbook: barrel files" (2026) — https://ma-x.im/blog/react-playbook-barrel-files
- ReactUse, "Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc" (2026) — https://reactuse.com/blog/barrel-files-tree-shaking/
- eslint-plugin-import, `no-restricted-paths` — https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md
- eslint-plugin-import, `no-cycle` — https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md
- eslint-plugin-boundaries — https://github.com/javierbrea/eslint-plugin-boundaries , https://www.jsboundaries.dev/docs/rules/entry-point/
- dependency-cruiser — https://github.com/sverweij/dependency-cruiser
- Sheriff — https://sheriff.softarc.io/docs/introduction , https://sheriff.softarc.io/docs/dependency-rules
- Reza Nazari, "How the Repository Pattern helped us migrate from REST to GraphQL" (2025) — https://dev.to/rezanazari/how-the-repository-pattern-helped-us-migrate-from-rest-to-graphql-without-breaking-everything-18e

### Next.js App Router architecture beyond the docs

- Sebastian Markbåge, "How to Think About Security in Next.js" (2023) — https://nextjs.org/blog/security-nextjs-server-components-actions
- Lee Robinson, "Common mistakes with the Next.js App Router and how to fix them" (2024) — https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them
- Alice Alexandra Moore, "Understanding React Server Components" (2023) — https://vercel.com/blog/understanding-react-server-components
- Josh W. Comeau, "Making Sense of React Server Components" (2023, updated 2025) — https://www.joshwcomeau.com/react/server-components/
- Makerkit, "Next.js App Router Project Structure" (2024, updated for Next 16) — https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure
- Arham Khan, "Next.js Colocation Template" — https://next-colocation-template.vercel.app/
- pipipi-dev, "App Router Directory Design" (2025) — https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo

### Not reachable during research

Cite only after re-checking: profy.dev's own domain (TLS error; dev.to
mirrors used), Feature-Sliced Design "desegmentation" guide (404), Sheriff
encapsulation page (404), Josh Comeau's compound-components lesson (paywalled).

## Maintenance

- Change a decision here first, then the rule in `SKILL.md`, then the example.
- When the client grows a `src/features/` folder or a boundary lint rule,
  update decision 1 or 9 and the "Module boundaries" section together.
- This skill is local: it is not listed in `skills-lock.json` and is edited in
  place, like `engineering-insights`.
