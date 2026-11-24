# Where non-component code lives in React/TypeScript frontends: constants, utils/helpers/lib, types, config, naming

Scope: architecture and organization only, not performance. Sources fetched 2026-11-24. Each rule is tied to the URL it came from.

## Annotated source list (what question each answers)

| Source | URL | Answers |
|---|---|---|
| Bulletproof React: Project Structure | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | Global `src/{config,lib,utils,types,hooks,stores}` vs feature-level `features/x/{api,components,hooks,stores,types,utils}`; unidirectional imports shared -> features -> app. |
| Bulletproof React: Project Standards | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md | Kebab-case file and folder names enforced through `check-file/*` ESLint rules; the `@/*` absolute import alias. |
| Bulletproof React `src/config/env.ts` | https://github.com/alan2207/bulletproof-react/blob/master/apps/react-vite/src/config/env.ts | Reference implementation of typed env config validated with Zod, which fails fast. |
| Feature-Sliced Design: Layers | https://feature-sliced.design/docs/reference/layers | Shared layer segments (`api`, `ui`, `lib`, `config`, `routes`, `i18n`); "lib is not helpers/utilities"; the layer import rule. |
| Feature-Sliced Design: Slices and segments | https://feature-sliced.design/docs/reference/slices-segments | Segment naming by purpose (`ui/api/model/lib/config`), not by essence (`components/hooks/types`). |
| Next.js: Environment variables guide (lastUpdated 2026-08-25) | https://nextjs.org/docs/app/guides/environment-variables | `.env*` load order, `NEXT_PUBLIC_` inlining at build time, server-only by default, `.env*.local` gitignored, `.env` lives at the root even with `/src`. |
| T3 Env: Introduction | https://env.t3.gg/docs/introduction | Why to use schema-validated env vars and how it prevents server env leaking to the client. |
| T3 Env: Next.js | https://env.t3.gg/docs/nextjs | `src/env.ts` (or `src/env/server.ts` + `src/env/client.ts`), the `server`/`client` objects, build-time validation by importing the file in `next.config`. |
| Josh W. Comeau: "Delightful React File/Directory Structure" (2022, updated 2025-12-03) | https://www.joshwcomeau.com/react/file-structure/ | The utils vs helpers distinction; `src/constants.ts` and `Component.constants.ts`; `Component.types.ts`; hooks as `use-*.ts`; PascalCase component files. |
| Total TypeScript: "Where to put your types in application code" (Matt Pocock) | https://www.totaltypescript.com/where-to-put-your-types-in-application-code | Three rules for where types go: colocate, shared location, shared package. |
| Total TypeScript: workshop exercise on declaration files (Pro Essentials) | https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don't-control/should-you-use-declaration-files-to-store-your-types | Whether `.d.ts` files should hold your types. (Known from search snippet only; page not fetched.) |
| Total TypeScript Essentials, ch. 13 | https://www.totaltypescript.com/books/total-typescript-essentials/modules-scripts-and-declaration-files | The role of declaration files, modules and scripts. (Known from search snippet only.) |
| Google TypeScript Style Guide | https://google.github.io/styleguide/tsguide.html | Identifier casing, `CONSTANT_CASE` for module-level constants, named exports only, `import type`, no namespaces, no static-only container classes. |
| react.dev: Removing Effect Dependencies | https://react.dev/learn/removing-effect-dependencies | "Move static objects and functions outside your component." |
| react.dev: You Might Not Need an Effect | https://react.dev/learn/you-might-not-need-an-effect | Caveat on module top-level code: keep app-wide initialization in the entry point. |
| eslint-plugin-check-file | https://github.com/dukeluo/eslint-plugin-check-file | Enforcing file and folder naming conventions. |
| eslint-plugin-boundaries (JS Boundaries) | https://www.jsboundaries.dev/docs/overview/ | Enforcing which element types (folders) may import which. |
| Knip | https://knip.dev/ | Unused files, exports and dependencies, which keeps `utils`/`types` from rotting. |
| "Utils considered harmful" (blog, 2026-01-31) | https://spiral-ladder.github.io/tech/2026/01/31/utils-considered-harmful.html | Critique of the utils junk drawer. (Search snippet only; secondary source.) |
| DEV: "Your utils folder is a crime scene" | https://dev.to/nurrehman/your-utils-folder-is-a-crime-scene-5095 | Critique of the junk drawer; proposes ownership by feature, e.g. `features/billing/utils.ts`. (Search snippet only; low authority.) |

## Constants and config: global vs feature-level vs colocated; env vars and typed config

### Takeaway
Use three tiers. App-wide constants and env config go in one global place (`src/config` in Bulletproof React and FSD, or `src/constants.ts` in Comeau's setup). Constants used by one feature go in that feature. Constants used by one component sit next to it, or at module scope outside the component. Read env vars through a single Zod-validated module that fails fast, such as `src/config/env.ts` or `src/env.ts`, and never through scattered `process.env` reads.

### Cited Findings
- Bulletproof React lists `src/config` as "global configurations, exported env variables etc." — [Bulletproof React: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Bulletproof React's `src/config/env.ts` defines a `z.object` EnvSchema. It reads `import.meta.env` keys with the `VITE_APP_` prefix, strips the prefix, coerces strings such as `'true'` to booleans with `.transform`, applies defaults, and calls `safeParse`. On failure it throws an error listing each missing or invalid variable. It exports a single `env` object. — [bulletproof-react env.ts](https://github.com/alan2207/bulletproof-react/blob/master/apps/react-vite/src/config/env.ts)
- FSD's Shared layer `config` segment holds "environment variables, global feature flags and other global configuration for your app", and the `routes` segment holds "route constants or patterns for matching routes". — [FSD Layers](https://feature-sliced.design/docs/reference/layers)
- FSD slice-level `config` segment holds "configuration files and feature flags", so feature-scoped config lives inside the slice. — [FSD Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- Comeau keeps app-wide values (colors, font sizes, breakpoints, public keys, app data) in `src/constants.ts`. Constants shared within one component folder go in `Widget.constants.ts` next to it. — [Josh Comeau: file structure](https://www.joshwcomeau.com/react/file-structure/)
- Next.js keeps env vars server-only by default. Only `NEXT_PUBLIC_`-prefixed vars are inlined into the client bundle at `next build`, and they are "frozen with the value evaluated at build time". Dynamic lookups such as `process.env[varName]` are not inlined. — [Next.js env guide](https://nextjs.org/docs/app/guides/environment-variables)
- Next.js load order is `process.env` -> `.env.$(NODE_ENV).local` -> `.env.local` (skipped in test) -> `.env.$(NODE_ENV)` -> `.env`. With a `/src` folder, `.env*` files must stay in the project root. `.env*.local` should be gitignored, while `.env.test` may be committed. — [Next.js env guide](https://nextjs.org/docs/app/guides/environment-variables)
- T3 Env validates env vars against a schema and supports any Standard Schema validator (Zod, Valibot, ArkType). Server vars are undefined on the client, and reading one there throws a descriptive error ("We're not leaking your server variables onto the client"). — [T3 Env intro](https://env.t3.gg/docs/introduction)
- T3 Env suggests `src/env.ts` with `createEnv({ server, client, runtimeEnv })`. If server var names are sensitive, split it into `src/env/server.ts` and `src/env/client.ts`, because with one file "validation schemas for the server variables will be shipped to the client". Import the env file in `next.config` to validate at build time. On Next 16+ a direct import in `next.config.ts` works. — [T3 Env Next.js](https://env.t3.gg/docs/nextjs)
- Google TS style: only module-level symbols, static fields of module-level classes, and enum values may use `CONSTANT_CASE`. — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)
- react.dev: "If the object does not depend on any props and state, you can move that object outside your component." It does not need to be an Effect dependency because it is not reactive. — [react.dev: Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies)

### Inferences
- A placement rule follows from Bulletproof React, FSD and Comeau together: place a constant at the lowest level that contains all its consumers (component file < component folder < feature < `src/config` or `shared/config`). Promote it only when a second consumer appears.
- Env config is a special constant. All three env sources (Bulletproof React, T3 Env, Next.js) imply one validated module as the only reader of `process.env`/`import.meta.env`. A lint rule such as `no-restricted-properties` on `process.env` outside that module could enforce this. That rule is my suggestion; no fetched source prescribes it.

### Gaps
- No fetched source gives an official rule for "feature constants file name" (`constants.ts` vs `config.ts`). FSD uses the `config` segment and Comeau uses `*.constants.ts`.
- I did not fetch Vite's env docs (`VITE_` prefix, `import.meta.env` typing via `vite-env.d.ts`).

## utils vs helpers vs lib, and the junk-drawer anti-pattern

### Takeaway
The terms mean different things in different sources. Bulletproof React: `lib` = third-party libraries preconfigured for the app (API client, query client), `utils` = shared utility functions. FSD: `lib` = internal libraries focused on one area, explicitly "not helpers or utilities". Comeau: `utils` = generic project-agnostic functions, `helpers` = project-specific domain functions. All of them push against a single generic dump file.

### Cited Findings
- Bulletproof React: `lib` is "reusable libraries preconfigured for the application" and `utils` is "shared utility functions". Each feature may also have its own `utils` folder for "utility functions for a specific feature". Features import only from shared code, and code flows shared -> features -> app. Cross-feature imports are discouraged and enforced with `import/no-restricted-paths`. — [Bulletproof React: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- FSD Shared `lib` is "a collection of internal libraries". The doc says "This folder should not be treated as helpers or utilities", and warns that such folders "often turn into a dump". — [FSD Layers](https://feature-sliced.design/docs/reference/layers)
- FSD: segment names must describe "the purpose of the content, not its essence". `components`, `hooks` and `types` are cited as bad names. — [FSD Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) and [FSD Layers](https://feature-sliced.design/docs/reference/layers)
- Comeau: "A utility is a generic function that accomplishes an abstract task." He keeps those in `src/utils.ts`, a file he copies between projects. Project-specific helpers go in `src/helpers/*.helpers.ts`, such as `category.helpers.ts`. A component-local helper moves to `src/helpers` once several places need it. — [Josh Comeau: file structure](https://www.joshwcomeau.com/react/file-structure/)
- Junk-drawer critique: generic `utils/` grows unbounded (one example grew to 61 unorganized files). The proposed fix is ownership by feature, e.g. `src/features/billing/utils.ts`. — [DEV: Your utils folder is a crime scene](https://dev.to/nurrehman/your-utils-folder-is-a-crime-scene-5095); [Utils considered harmful (2026)](https://spiral-ladder.github.io/tech/2026/01/31/utils-considered-harmful.html). Both are known from search snippets only and are low-authority blog posts.
- Google TS style: "Do not create container classes with static methods or properties for the sake of namespacing". Export individual functions and constants instead, so no `class Utils { static ... }`. — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)
- react.dev: functions that do not depend on props or state can be declared outside the component, e.g. `createOptions()`. "Since `createOptions` is declared outside your component, it's not a reactive value." — [react.dev: Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies)
- react.dev caveat: top-level code runs on import. "Don't overuse this pattern". Keep app-wide initialization in root modules or the entry point. — [react.dev: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

### Inferences
- A usable skill rule, synthesized from the sources above: `lib/` = wrappers and configured instances of external libraries (`lib/api-client.ts`, `lib/react-query.ts`). `utils/` = pure, domain-free functions named by topic (`utils/format-date.ts`), never one `utils.ts` dump. Domain logic lives in its feature (`features/x/utils` or FSD `model`/`lib`).
- Pure helpers extracted from a component stay in the same file at module scope until a second file needs them. Then they move to the folder, the feature, and finally shared. This mirrors Total TypeScript's colocation rules for types.

### Gaps
- I did not find the exact external "dump" article that FSD links. The Layers page mentions it, but the fetch did not return the URL.
- Bulletproof React docs do not define "helpers" at all.

## Types: colocated vs global; Zod-inferred types; shared client/server contracts; .d.ts

### Takeaway
Colocate by default and promote to a shared location only when a type is reused (Matt Pocock's three rules). Global `.d.ts` files are for ambient/global declarations and for describing JS, not for app types. Bulletproof React and Comeau both allow `types` at the feature/component level plus a global `src/types` for cross-app types. FSD discourages a `types` segment and wants types to live with their purpose (`model`, `api`).

### Cited Findings
- Total TypeScript Rule 1: "When a type is used in only one place, put it in the same file where it's used." Rule 2: "Types that are used in more than one place should be moved to a shared location." Rule 3: "Types that are used in more than one package in a monorepo should be moved to a shared package." The page recommends `*.types.ts` files. — [Total TypeScript](https://www.totaltypescript.com/where-to-put-your-types-in-application-code)
- Pocock calls it a misconception that all types belong in `.d.ts` files. Declaration files are mainly for describing JavaScript and for global-scope additions, and global ambient alterations go in a `.d.ts` (or `declare global` in a `.ts`). — [Total TypeScript Pro Essentials exercise](https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don't-control/should-you-use-declaration-files-to-store-your-types); [Total TypeScript Essentials ch. 13](https://www.totaltypescript.com/books/total-typescript-essentials/modules-scripts-and-declaration-files). These come from search snippets, not full fetches. A secondhand claim that Pocock said "never use .d.ts files" conflicts with this and should be treated with caution.
- Bulletproof React: `src/types` holds "shared types used across the application", and `features/x/types` holds "typescript types used within the feature". — [Bulletproof React: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Comeau: `FileViewer.types.ts` holds "TypeScript types for anything used by multiple files within this directory". — [Josh Comeau: file structure](https://www.joshwcomeau.com/react/file-structure/)
- FSD puts schemas and interfaces in the `model` segment, and request functions, data types and mappers in the `api` segment. It names `types` as a bad segment name. — [FSD Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- Google TS style: use `import type {...}` when the symbol is only used as a type, and `export type` when re-exporting types. For object types, prefer `interface` over a type-alias object literal. — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)

### Inferences
- With Zod, the schema is the source of truth and the type is derived with `z.infer<typeof Schema>`. Bulletproof's `env.ts` returns `parsedEnv.data` typed from the schema. I did not fetch Zod's docs, so cite https://zod.dev before using this in a skill.
- For shared client/server contracts, Pocock's Rule 3 (shared package) is the canonical answer. In DevDigest the contracts are copied into `server/src/vendor/shared` and `client/src/vendor/shared` (per repo CLAUDE.md). That is a deliberate deviation from Rule 3, which the skill README should mention, along with the need to update both copies.

### Gaps
- I did not fetch Zod's `z.infer` docs or any authoritative guide on shared contracts (tRPC, OpenAPI codegen).
- No publication date is visible on the Total TypeScript article.

## Naming conventions: files, hooks, components, exports

### Takeaway
No universal standard exists. Bulletproof React enforces kebab-case for every `.ts/.tsx` file and folder through `eslint-plugin-check-file`. Comeau uses PascalCase component files and kebab-case for everything else, including `use-*.ts` hooks. Google mandates `snake_case` file names (an internal Google convention that is rare in React). The convergent rule is to pick one convention and enforce it with lint. Hooks start with `use`. Prefer named exports.

### Cited Findings
- Bulletproof React's example config: `'check-file/filename-naming-convention': ['error', {'**/*.{ts,tsx}': 'KEBAB_CASE'}, {ignoreMiddleExtensions: true}]` and `'check-file/folder-naming-convention': ['error', {'src/**/!(__tests__)': 'KEBAB_CASE'}]`. Rationale: it keeps "your codebase consistent and easier to navigate". It also configures the `@/*` -> `./src/*` path alias because absolute imports make "it easier to move files around". — [Bulletproof React: Project Standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- `eslint-plugin-check-file` provides `filename-naming-convention`, `folder-naming-convention`, `filename-blocklist`, `folder-match-with-fex` and `no-index`. v3+ supports flat config only, and legacy config needs v2.x. — [eslint-plugin-check-file](https://github.com/dukeluo/eslint-plugin-check-file)
- Comeau: PascalCase component files (`RainbowButton.js`) and kebab-case for other files. Reusable hooks go in `src/hooks/use-boop.js`. "It doesn't really matter which convention you use for your file names", as long as you pick one. Component folders have an `index.ts` re-export. On the Next.js App Router, `export *` caused a duplicate-`default` error, so he uses `export { default }` plus explicit named exports. — [Josh Comeau: file structure](https://www.joshwcomeau.com/react/file-structure/)
- Google TS style: `UpperCamelCase` for classes, interfaces, types and enums. `lowerCamelCase` for variables, functions and properties. `CONSTANT_CASE` for global constants. Files are `snake_case`. "Use named exports in all code. Do not use default exports." — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)

### Inferences
- In Next.js App Router projects, the framework requires default exports for `page.tsx`/`layout.tsx`. Google's no-default-exports rule therefore has to exempt those files. This is my inference and is not stated in the fetched sources.
- The `use` prefix for hooks is required by React's Rules of Hooks and its lint plugin. I did not fetch the react.dev source for it in this session.

### Gaps
- Airbnb style guide items were not fetched. The Airbnb React guide (https://github.com/airbnb/javascript/tree/master/react) is older (pre-2020, class-era) and should be flagged as outdated if cited.
- I did not fetch the react.dev "Rules of Hooks" page or the hook-naming section of "Reusing Logic with Custom Hooks".

## Tooling that enforces these conventions

### Takeaway
Use `eslint-plugin-check-file` for naming, and `eslint-plugin-boundaries` or `import/no-restricted-paths` for folder dependency direction (shared -> features -> app; FSD layers strictly downward). Use Knip to delete unused utils, exports and types so the shared folders do not rot. typescript-eslint was not researched in depth.

### Cited Findings
- `eslint-plugin-boundaries` assigns each file an element type from patterns, e.g. `{ type: "controller", pattern: "controllers/*" }`. It checks every import against allow/disallow policies and reports violations under `boundaries/dependencies`. It also works with Oxlint. — [JS Boundaries overview](https://www.jsboundaries.dev/docs/overview/)
- Bulletproof React uses `import/no-restricted-paths` to forbid cross-feature imports and to enforce the unidirectional flow. — [Bulletproof React: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- FSD import rule: "A module (file) in a slice can only import other slices when they are located on layers strictly below". Shared has no slices, so its files can import each other. — [FSD Layers](https://feature-sliced.design/docs/reference/layers)
- Knip "finds and fixes unused dependencies, exports and files". — [Knip](https://knip.dev/)
- `eslint-plugin-check-file` handles file and folder naming (see the naming section). — [eslint-plugin-check-file](https://github.com/dukeluo/eslint-plugin-check-file)

### Inferences
- Steiger, FSD's official linter, likely enforces FSD rules, but it was not researched here.

### Gaps
- typescript-eslint rules relevant to organization (`consistent-type-imports`, `consistent-type-definitions`, `no-namespace`) were not fetched. They map onto the Google style items above, but the mapping is unverified.
- No release date or version is visible for eslint-plugin-check-file. I did not check the boundaries plugin's `entry-point`/`no-private` rules, which may have been merged into `dependencies` in recent versions.
