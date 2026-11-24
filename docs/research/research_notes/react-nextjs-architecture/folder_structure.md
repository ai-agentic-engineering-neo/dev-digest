# React / Next.js folder structure and module organization (architecture, not performance)

Research date: 2026-11-24. All facts below were read from the cited page during this session unless marked otherwise.

## Source index (annotated)

| # | Source | URL | Date / currency | What question it answers |
|---|--------|-----|-----------------|--------------------------|
| S1 | Bulletproof React, "Project Structure" | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | Living doc in maintained repo | Canonical feature-based `src/` layout; unidirectional shared → features → app; no cross-feature imports; ESLint `import/no-restricted-paths` zones; barrel files now discouraged. |
| S2 | Feature-Sliced Design, Overview | https://feature-sliced.design/docs/get-started/overview | FSD v2.1 docs, current | Layers / slices / segments model and the "import only from layers strictly below" rule. |
| S3 | FSD, Public API reference | https://feature-sliced.design/docs/reference/public-api | FSD v2.1 | Public API (index) contract per slice, `@x` cross-import notation, where NOT to put index files, circular-import guidance. |
| S4 | FSD, Usage with Next.js | https://feature-sliced.design/docs/guides/tech/with-nextjs | Current | How to combine FSD layers with App Router / Pages Router (`_app`, `_pages` rename, route files as re-exports). |
| S5 | Steiger (FSD linter) | https://github.com/feature-sliced/steiger | Beta, current | Enforcing FSD rules automatically (`fsd/forbidden-imports`, `fsd/public-api`, ...). |
| S6 | Next.js docs, "Project structure and organization" | https://nextjs.org/docs/app/getting-started/project-structure | lastUpdated 2026-07-21 | Official stance: unopinionated; safe colocation in `app/`; private `_folders`; route groups `(group)`; `src/`; three strategies. |
| S7 | Next.js docs, `optimizePackageImports` | https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports | lastUpdated 2025-12-19, experimental | Only mentioned architecturally: framework workaround for packages that re-export thousands of modules. |
| S8 | Kent C. Dodds, "Colocation" | https://kentcdodds.com/blog/colocation | 2019-06-17 (principle still current) | Why to keep tests, styles, state, utils, comments next to the code that uses them. |
| S9 | React docs, "Thinking in React" | https://react.dev/learn/thinking-in-react | Current official docs | Component decomposition (single responsibility) and where state lives. No file/folder advice. |
| S10 | Legacy React docs, "File Structure" FAQ | https://legacy.reactjs.org/docs/faq-structure.html | Legacy (pre-2023) docs; advice still widely cited | Group by feature/route vs by file type; avoid deep nesting; don't overthink. |
| S11 | Dan Abramov, "Scalable file structure..." | https://react-file-structure.surge.sh/ | Old (joke-but-serious page) | Origin of "move files around until it feels right". |
| S12 | Dan Abramov, "Presentational and Container Components" | https://medium.com/@dan_abramov/7ca2f9a7c7d0 | 2015 article with 2019 update note | OUTDATED pattern; author's own update says views evolved after Hooks. |
| S13 | TkDodo, "Please Stop Using Barrel Files" | https://tkdodo.eu/blog/please-stop-using-barrel-files | 2024-07-26 | Barrel-file cons (cycles, no real privacy, tooling cost); only acceptable for library entry points. |
| S14 | Josh W. Comeau, "Delightful React File/Directory Structure" | https://www.joshwcomeau.com/react/file-structure/ | 2022-03-15, updated 2025-12-03 | A credible counter-position: organize by function (type), not feature; component-per-directory with `index` forwarding. |
| S15 | Robin Wieruch, "React Folder Structure" | https://www.robinwieruch.de/react-folder-structure/ | Updated 2026-05-05 | Incremental evolution single file → per-component folders → technical folders → feature folders; promotion rule; Next.js placement. |
| S16 | Johannes Kettmann (profy.dev), "Screaming Architecture – Evolution of a React folder structure" | https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25 (cross-post of profy.dev article; profy.dev itself was unreachable from this session) | 2022-02-25 | Stage-by-stage evolution to feature grouping; public API index per feature; absolute imports; kebab-case. |
| S17 | Juntao Qiu on martinfowler.com, "Modularizing React Applications with Established UI Patterns" | https://martinfowler.com/articles/modularizing-react-apps.html | 2023-02-07..16 | Layering *inside* a feature: view / hooks (presentation) / domain model / gateway. |
| S18 | eslint-plugin-boundaries (docs at jsboundaries.dev) | https://github.com/javierbrea/eslint-plugin-boundaries ; rules: https://www.jsboundaries.dev/docs/rules/ | v7.4.1 | General-purpose architecture boundary linting via element types and policies. |
| S19 | eslint-plugin-import `no-restricted-paths` | https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md | Current | Zone-based import restrictions (what Bulletproof React uses). |
| S20 | dependency-cruiser | https://github.com/sverweij/dependency-cruiser | Current | Validate + visualize dependency graph with `forbidden` rules; init adds no-circular / orphans rules. |

## Feature-based vs layer-based (type-based) structure, and the major reference architectures (Bulletproof React, FSD, Next.js, Fowler/Qiu)

### Takeaway
Most current authoritative sources (Bulletproof React, FSD, Wieruch, Kettmann/profy.dev) converge on **feature-based modules plus a thin shared layer and a top "app" composition layer, with one-directional imports and no feature-to-feature imports**; type-based grouping is endorsed as the *starting point* for small apps (Wieruch, Kettmann, legacy React docs) and by Josh Comeau as a deliberate long-term choice. Next.js and React officially stay unopinionated.

### Cited Findings

**Feature vs type — positions**
- Legacy React docs list two equally valid approaches: group by features or routes (CSS, JS, tests together per feature/route) or group by file type (`api/`, `components/`); they also advise limiting nesting to ~3–4 levels and not spending "more than five minutes" choosing — [React legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- Next.js is "unopinionated about how you organize and colocate your project files"; it lists three strategies: (1) store project files outside `app` (app purely for routing), (2) store them in top-level folders inside `app`, (3) split project files by feature or route; "choose a strategy that works for you and your team and be consistent across the project" — [Next.js Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Robin Wieruch frames structure as an evolution: single file → multiple files → one folder per component (≈2 levels of nesting) → technical folders (`components/`, `hooks/`, `context/`, `utils/`) → feature folders (`features/`), keeping `components/` "only for reusable components" — [Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- Wieruch's promotion rule: a util/hook/component used by one feature stays in that feature; once two or more features need it, move it up to the shared layer; "features don't import from each other" — [Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- Kettmann (profy.dev) traces five stages: group by file type → nesting/colocating children with parents (generic UI in `ui/`) → `pages/` folder → colocate contexts and hooks (remove global `contexts/`) → group by features (`features/todos`, `features/users`, `features/ui`) with `pages/` as one-file-per-page entry points — [Kettmann / profy.dev via DEV](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- Kettmann also recommends absolute imports via aliases (e.g. `@features/...`) so moves don't break imports, and kebab-case file names to avoid case-sensitivity issues across OS/CI — [Kettmann](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- Counter-position: Josh Comeau prefers organizing "by function, not by feature", arguing feature boundaries are hard to draw and drift from the product, and that the needed reorganizations "won't actually get done" — [Comeau](https://www.joshwcomeau.com/react/file-structure/)
- Comeau's layout: every component in its own directory (`components/FileViewer/`) with sub-components, helpers, types, constants tucked inside; component-specific hooks stay with the component, generic hooks in `src/hooks`; project-specific helpers in `src/helpers`; project-independent functions in `src/utils`; app-wide constants in `constants.ts` — [Comeau](https://www.joshwcomeau.com/react/file-structure/)

**Bulletproof React**
- `src/` folders: `app` (routes, main app component, global providers, router; layout varies by meta-framework), `assets`, `components` (shared components), `config` (global config, exported env vars), `features` (feature modules — "where most code should live"), `hooks` (shared hooks), `lib` (reusable preconfigured libraries), `stores` (global state), `testing` (test utils/mocks), `types` (shared TS types), `utils` (shared utilities) — [Bulletproof React project-structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Feature folder may contain `api`, `assets`, `components`, `hooks`, `stores`, `types`, `utils`; "You don't need all of these folders for every feature"; a shared top-level `api` folder is suggested if many API calls are shared across features — [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Cross-feature imports discouraged; compose features at the application level instead — [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Unidirectional flow shared → features → app: shared code usable anywhere, features use shared, app uses features + shared; claimed benefit: codebase "more predictable and easier to understand" — [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

**Feature-Sliced Design**
- Layers top→bottom: App (routing, entrypoints, global styles, providers), Processes (**deprecated**), Pages, Widgets (large self-contained UI/functional blocks), Features (reused implementations of product features), Entities (business entities, e.g. `user`, `product`), Shared (reusable, detached from business specifics) — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- Import rule: "modules on one layer can only know about and import from modules from the layers strictly below" — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- Slices partition a layer by business domain; slices on the same layer cannot use each other; App and Shared have no slices (they are divided into segments directly) — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- Segments by technical purpose: `ui` (components, formatters, styles), `api` (backend requests, data types, mappers), `model` (schemas, stores, business logic), `lib` (library code needed by the slice), `config` (configuration, feature flags); names not fixed by the standard — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- Public API: each slice exposes an `index` with re-exports as a "contract"; expose only what's needed and avoid `export *` — [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
- Cross-imports between entities via `@x` notation (`entities/A/@x/B`), kept minimal and "only on the Entities layer" — [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
- Within a slice use relative imports; across slices use absolute (alias) imports — to avoid index-induced cycles — [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
- Split public API per runtime environment when modules must run in different environments — [FSD Public API](https://feature-sliced.design/docs/reference/public-api)

**FSD + Next.js App Router**
- Keep Next.js `app/` (and `pages/`) at project root so `src/` contains only FSD code (recommended, "not mandatory"); `middleware` and `instrumentation` must also be at root — [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- Rename FSD `app` and `pages` layers to `_app` and `_pages` "regardless of which router you use"; this naming is compatible with Steiger — [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- Route files are thin re-exports, e.g. `export { ExamplePage as default, metadata } from '@/_pages/example';`; API route handlers live in `src/_app/api-routes` and `app/api/.../route.ts` re-exports them — [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- If server-only code leaks into client bundles via a shared `index.ts`, add an `index.server.ts` — [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- FSD "is mainly for frontends"; many endpoints → consider a separate monorepo package — [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)

**Next.js native organization primitives**
- A route is public only when a `page` or `route` file exists, so project files "can be safely colocated" inside `app/` route segments — [Next.js](https://nextjs.org/docs/app/getting-started/project-structure)
- Private folders `_folderName` opt a folder and its subfolders out of routing; useful for separating UI logic from routing logic, consistent organization, editor sorting, and avoiding conflicts with future Next.js conventions — [Next.js](https://nextjs.org/docs/app/getting-started/project-structure)
- Route groups `(folderName)` organize routes by section/intent/team without affecting URLs and allow different layouts per group — [Next.js](https://nextjs.org/docs/app/getting-started/project-structure)
- Optional `src/` separates application code from root config files — [Next.js](https://nextjs.org/docs/app/getting-started/project-structure)
- Wieruch places `features/`, `components/`, `hooks/`, `context/`, `utils/` alongside `app/` inside `src/` and advises *against* private folders inside `app/` so features stay reusable across pages — [Wieruch](https://www.robinwieruch.de/react-folder-structure/)

**Layering inside a feature (Fowler / Qiu)**
- React should be only the view layer; logic goes into presentation (hooks), domain models, and data access (gateways), letting you think about "view, model, data" relatively independently — [Qiu, martinfowler.com](https://martinfowler.com/articles/modularizing-react-apps.html)
- Concrete steps: move fetching/state into a custom hook; extract pure sub-components; put business rules in plain TS domain objects; replace scattered conditionals with a strategy/polymorphism injected via props; extract a gateway as an anti-corruption layer over network calls — [Qiu](https://martinfowler.com/articles/modularizing-react-apps.html)

### Inferences
- The FSD segments (`ui/api/model/lib/config`) and Bulletproof's per-feature subfolders (`components/api/hooks/stores/types/utils`) map onto Qiu's view / gateway / domain+hooks layers; a skill can present them as one model at three zoom levels (app → feature → in-feature layer).
- Bulletproof React is the lighter-weight choice (3 tiers: shared/features/app); FSD is the stricter, more granular one (7 layers, slices, public API, dedicated linter). Teams on Next.js App Router must handle the `app`/`pages` name clash under FSD; Bulletproof's `src/app` would also collide conceptually with Next's `app/` router directory and needs a decision (route files thin, logic in `features/`).
- Josh Comeau's dissent is a legitimate, current (2025-updated) source; a skill should frame feature-based as the default for growing apps, not the only correct answer.

### Gaps
- Bulletproof React's Next.js-specific example app (repo `apps/` folder) was not fetched; its exact App Router layout is unverified here.
- profy.dev original domain was unreachable (DNS failure); used the author's DEV.to cross-post instead. Other profy.dev React-architecture articles were not reviewed.

## Colocation

### Takeaway
Colocation ("place code as close to where it's relevant as possible") is the shared principle beneath feature folders; promote code to shared folders only when it is actually reused. Restructuring iteratively is normal and expected.

### Cited Findings
- Key principle: "Place code as close to where it's relevant as possible" — [Kent C. Dodds, Colocation (2019)](https://kentcdodds.com/blog/colocation)
- Dodds: put tests next to modules (not a mirrored `test/` tree; E2E can stay at root), keep styles close to components, keep state near the UI that uses it, keep helpers in the file that uses them until truly reused instead of a shared `utils/` where they become orphaned; cross-module docs/integration tests can live in a shared feature folder — [Dodds](https://kentcdodds.com/blog/colocation)
- React docs: "a component should ideally only be concerned with one thing. If it ends up growing, it should be decomposed into smaller subcomponents" — [Thinking in React](https://react.dev/learn/thinking-in-react)
- React docs: put state in the closest common parent of components that render from it, or create a new component solely to hold it; keep state minimal and derive the rest — [Thinking in React](https://react.dev/learn/thinking-in-react)
- "Thinking in React" gives no file/folder organization advice (all code in one sandbox file) — [Thinking in React](https://react.dev/learn/thinking-in-react)
- Dan Abramov's page "Scalable file structure for React and other projects" says to move files around until it feels right, with a linked tweet to signal it is serious — [react-file-structure.surge.sh](https://react-file-structure.surge.sh/)
- Next.js: files can be colocated safely in `app/` route segments; you "can" but don't "have to" — [Next.js](https://nextjs.org/docs/app/getting-started/project-structure)
- Kettmann's "World Domination" stage explicitly colocates contexts and hooks with consuming components and removes global `contexts/` dumping grounds — [Kettmann](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)

### Inferences
- Dodds' "until truly reused" and Wieruch's "two or more features → promote to shared" are the same rule; a skill can state it once as the promotion rule.

### Gaps
- The original Abramov tweet is reportedly deleted (per secondary sources in search results, e.g. https://dev.to/dance2die/move-files-around-until-it-feels-right-2lek); only the surge.sh page was verified.

## Barrel files (index.ts)

### Takeaway
Current sources have moved away from internal barrels: Bulletproof React now says import files directly, TkDodo says barrels belong only at library entry points; FSD keeps an index per slice as an explicit *public API* but forbids indexes inside segments of sliced layers and per-whole `shared/ui`.

### Cited Findings
- Bulletproof React: barrel files were previously recommended but are now discouraged (they can interfere with Vite tree shaking); "it is recommended to import the files directly" — [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- TkDodo (2024-07-26): importing a sibling through its own barrel creates circular imports; bundlers can fail with confusing errors; auto-imports create such cycles easily; `import/no-cycle` catches many — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- TkDodo: barrels do not make internals private — consumers can still deep-import unless lint rules forbid it — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- TkDodo: the only place a barrel makes sense is a library entry point referenced by `package.json` `main` (e.g. `@tanstack/react-query`); alternative is direct imports (`@/tab/tab-list`) plus lint conventions — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- TkDodo reports one Next.js project dropping from ~11k to ~3.5k loaded modules after removing internal barrels (performance data point, cited only for context) — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- FSD: index file per slice is the public API contract; avoid `export *`; give each `shared/ui` component / `shared/lib` library its own index rather than one big index; avoid index files in segments of sliced layers (e.g. `features/comments/ui/index.js`) — [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
- FSD: an index does not stop direct imports that bypass it — use Steiger to enforce — [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
- Pro-barrel positions: Kettmann uses `index.js` per feature/component as its "public API" — [Kettmann](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25); Comeau uses `index.ts` per component directory as "essentially a redirection" — [Comeau](https://www.joshwcomeau.com/react/file-structure/); Wieruch allows `index.js` as a folder public API but notes "barrel files are getting out of fashion" and suggests direct imports when that's a concern — [Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- Next.js `experimental.optimizePackageImports` loads only the modules actually used from packages that "export hundreds or thousands of modules" (experimental, not recommended for production) — [Next.js docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports); TkDodo notes it only works for "real" barrels containing nothing but re-exports — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)

### Inferences
- The architectural compromise across sources: one narrow, explicit (no `export *`) entry file per *module boundary* (feature/slice) is defensible as a contract, but nested/segment-level and catch-all shared barrels are not; and intra-module imports should be relative/direct, never through the module's own index.

### Gaps
- No primary source found quantifying architectural (non-performance) costs of barrels beyond cycles and false privacy.

## Enforcing import boundaries

### Takeaway
Boundaries are only real if linted: `import/no-restricted-paths` (simple zones; what Bulletproof uses), `eslint-plugin-boundaries` (element-type policies, v7), Steiger (FSD-specific), and dependency-cruiser (graph-level rules + visualization, CI-friendly).

### Cited Findings
- Bulletproof React enforces with `import/no-restricted-paths` set to `'error'`: one zone per feature forbidding imports from `./src/features` except itself; `./src/features` may not import `./src/app`; `components/hooks/lib/types/utils` may not import `features` or `app` — [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Note: Bulletproof's example shared-module zone omits `config`, `stores`, `assets`, `testing` — [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- `no-restricted-paths` options: `zones[]` each with `target`, `from`, optional `except`, `message`; optional `basePath`; globs supported; `from` is checked against the resolved path of the imported file (so aliases are covered) — [eslint-plugin-import docs](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md)
- eslint-plugin-boundaries: classify files into elements (`boundaries/elements` with `type` + `pattern`) and write allow/disallow policies; tagline "Lint your architecture, not just your syntax" — [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)
- eslint-plugin-boundaries v7.4.1 active rules: `boundaries/dependencies` (main), `no-unknown-files`, `no-unknown-dependencies`, `no-ignored-dependencies`; deprecated: `element-types` (alias of `dependencies`), `entry-point`, `external`, `no-private` (all reproducible via `dependencies`); `no-unknown`/`no-ignored` renamed — [jsboundaries.dev rules](https://www.jsboundaries.dev/docs/rules/)
- Steiger: FSD architecture linter (beta); `npm i -D steiger @feature-sliced/steiger-plugin`, `npx steiger ./src`; rules include `fsd/forbidden-imports` (higher-layer and same-layer cross-slice imports), `fsd/public-api`, `fsd/no-cross-imports` (off by default), `fsd/insignificant-slice`, `fsd/no-segmentless-slices`; zero-config, optional `steiger.config.ts` with `defineConfig` — [Steiger](https://github.com/feature-sliced/steiger)
- dependency-cruiser: validates and visualizes JS/TS dependencies against `forbidden` rules (`name`, `severity`, `from`/`to` path patterns); `npx dependency-cruiser --init` generates rules for circular deps, orphans, missing package.json deps, prod code depending on dev deps; outputs dot/mermaid/json/html — [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- `import/no-cycle` recommended to catch barrel-induced cycles — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)

### Inferences
- Choice heuristic: Bulletproof-style 3-tier → `import/no-restricted-paths` is sufficient; FSD → Steiger (+ optionally boundaries); mixed/custom architecture or need for graphs in CI → eslint-plugin-boundaries or dependency-cruiser.

### Gaps
- Whether dependency-cruiser resolves TS path aliases was not confirmed from the README (it links to an FAQ on webpack aliases).
- `eslint-plugin-import` vs `eslint-plugin-import-x` fork status for ESLint 9 flat config not researched.

## Outdated or superseded advice (flag list)

### Takeaway
Treat container/presentational splitting as a folder convention as outdated; hooks replaced it. Treat internal barrels-everywhere as outdated. FSD `processes` layer is deprecated.

### Cited Findings
- Abramov's 2015 "Presentational and Container Components" carries a 2019 update saying "my views have since evolved"; secondary sources report he no longer recommends the split because hooks provide the same separation — [Abramov, Medium](https://medium.com/@dan_abramov/7ca2f9a7c7d0) (direct fetch returned 403; update text confirmed only via search snippet)
- Hooks-era equivalent: move fetching/state into custom hooks and keep components declarative — [Qiu, martinfowler.com](https://martinfowler.com/articles/modularizing-react-apps.html)
- FSD Processes layer is deprecated — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- Bulletproof React reversed its earlier barrel-file recommendation — [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- eslint-plugin-boundaries `element-types`, `entry-point`, `no-private`, `external` are deprecated in favour of `dependencies` — [jsboundaries.dev](https://www.jsboundaries.dev/docs/rules/)
- Legacy React FAQ on file structure lives on legacy.reactjs.org; current react.dev has no folder-structure page found in this session — [legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)

### Inferences
- Kettmann (2022) and Kent C. Dodds (2019) are older but their principles (colocation, feature grouping) are restated by 2025–2026 sources (Wieruch 2026 update, Bulletproof, Next.js docs), so they remain usable as citations for principles.

### Gaps
- Exact wording of Abramov's 2019 update note not verified first-hand (Medium 403).
