# frontend-ui-architecture

**Version:** 1.0.0 (2026-09-19) · Files: `SKILL.md` (core decision tables), `nextjs.md` (App Router boundaries and data layer)

## Motivation

Two existing skills touch code organization only in passing. `react-best-practices` gives it five lines, and `next-best-practices` documents App Router *file conventions*. Neither answers the everyday questions: where a new hook, constant, helper or business rule goes, when local code becomes shared, and how to split a big component.

This skill answers those questions as a **classify → place → split** recipe, keyed to observable predicates (what the code knows, how many consumers it has). Performance is out of scope on purpose.

### Scope split with sibling skills

| Topic | Owner |
|---|---|
| Where code lives, shared vs local, component splitting, dependency direction, barrels, `'use client'` / `server-only` as a boundary | **frontend-ui-architecture** |
| Hooks misuse, state anti-patterns, render performance | `react-best-practices` |
| App Router file conventions, RSC serialization, data-fetching APIs, metadata, images/fonts | `next-best-practices` |
| Schema API details | `zod` |

## How it was built (TDD for skills)

1. **Research:** three parallel Sonnet agents covered React structure, non-UI code placement, and Next.js architecture. Every URL below was fetched and verified live.
2. **RED:** three Sonnet agents answered placement scenarios without the skill: a new feature, a 650-line component refactor, and shared-vs-local decisions. Baseline was already decent (colocation, RSC-first). The recurring gaps:
   - Business rules (run cost + price table) placed in a UI component's `helpers.ts`.
   - UI mappings (severity → color) mixed into domain `lib/<entity>/` modules.
   - A single-consumer query hook put in global `lib/hooks/` "because that's where hooks go".
   - No stated dependency direction and no demotion rule.
   - API types hand-written instead of inferred from the contract schema.
3. **GREEN:** with the skill loaded, the same scenarios closed every baseline gap. Run cost + pricing moved to a React-free `_lib/model.ts`, `severityColor` moved to the UI layer, `Pr` became `z.infer` of the contract, and single-consumer hooks and data modules were colocated. One agent went further and moved tab state into the URL, which removed `'use client'` from the tab bar.
4. **REFACTOR:** the GREEN agents reported friction points, and each was closed in the text:
   - "Same route" was ambiguous. The skill now uses a nearest-common-ancestor rule for sibling routes like `pulls/` and `pulls/[number]/`.
   - No path was named for the shared UI layer.
   - There was no kind for URL/form input parsers.
   - Business thresholds and display limits weren't distinguished.
   - Data-module granularity (entity + sub-collections), exporting key factories for invalidation, and isomorphic resource modules weren't covered.
   - Tabs over one form lost edits on unmount.
   - The i18n namespace for sub-features wasn't specified.

## Where sources disagree (and how the skill resolves it)

| Question | Positions | Skill's resolution |
|---|---|---|
| Feature-based vs type-based top-level folders | bulletproof-react, FSD and Wieruch go feature-first. Comeau groups by technical role and argues feature boundaries drift. React docs: "don't spend more than 5 minutes". | Doesn't mandate a top-level scheme. The **promotion rule** (1 consumer → local, 2+ features → shared) and one-way dependencies work under both. |
| Barrel `index.ts` | TkDodo: avoid, except at a package entry point (11k→3.5k modules in a Next.js app). bulletproof-react: avoid even for features. Comeau: a thin per-component `index.ts` is fine. | Thin per-folder `index.ts` is allowed. Hub barrels are banned. **dev-digest** requires `index.ts` in every `_components/<Name>/`, which is the allowed thin form, so there is no conflict. |
| Route-level colocation vs central `src/features/` in Next.js | Makerkit and Codelynx colocate under `app/<route>/_components`/`_lib`. bulletproof-react and FSD keep `app/` routing-only. The Next.js docs accept both. | Follow the project convention (dev-digest: route-level `_components/`). Thin `page.tsx` either way. |
| Where Server Actions live | Centralized `lib/actions/<domain>.ts` vs colocated `actions.ts`. | Either works. Actions must be thin and must re-check auth. (dev-digest has no Server Actions, because the backend is Fastify.) |
| How eagerly to name constants | "Name every magic value" vs "a self-evident one-scope literal doesn't need a name". | Name it once it is non-obvious or reused. Keep it with its only consumer. |

**Open question for dev-digest:** `client/src/lib/hooks/` currently groups query hooks by resource (`reviews.ts`, `agents.ts`, …) globally. This fits the skill's "per-resource data module" rule for hooks shared across routes. A hook with a single consumer would, by this skill, be colocated instead. Revisit if that folder grows single-use hooks.

## Sources

### React structure and component organization
- [Project Structure — bulletproof-react (Alan Alickovic)](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — feature folders, no cross-feature imports, `shared → features → app`, `lib/` as an anti-corruption layer.
- [Overview — Feature-Sliced Design](https://feature-sliced.design/docs/get-started/overview) — layers/slices/segments, import only from lower layers, public API per slice.
- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation) — place code as close to where it's relevant as possible.
- [React Hooks: Compound Components — Kent C. Dodds](https://kentcdodds.com/blog/compound-components-with-react-hooks) (2019) — composition instead of prop explosion.
- [React Folder Structure Best Practices [2026] — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/) (updated 2026-05) — staged structure, "promote on second consumer" rule.
- [Delightful React File/Directory Structure — Josh W. Comeau](https://www.joshwcomeau.com/react/file-structure/) (updated 2025-12) — a folder per component, named main file, thin `index.ts`, the type-based dissent.
- [File Structure FAQ — React legacy docs](https://legacy.reactjs.org/docs/faq-structure.html) — React is unopinionated; by feature vs by type.
- [Thinking in React — react.dev](https://react.dev/learn/thinking-in-react) — single-responsibility component boundaries.
- ["Move files around until it feels right" — Sung M. Kim](https://sung.codes/blog/2018/11/18/move-files-around-until-it-feels-right/) (2018) — on Dan Abramov's structure advice.
- [Please Stop Using Barrel Files — TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files) (2024-07) — measured cost of barrels in Next.js.
- [Presentational and Container Components — patterns.dev](https://www.patterns.dev/react/presentational-container-pattern/) — hooks supersede containers.
- [Presentational and Container Components — Dan Abramov](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) (2015, retraction note 2019) — *Medium blocks automated fetches; content corroborated via patterns.dev.*
- [Using ESLint to restrict where files can be imported from — Matias Kinnunen](https://mtsknn.fi/blog/eslint-import-restrictions/) (2021) — `import/no-restricted-paths` zones.
- [eslint-plugin-boundaries — javierbrea](https://github.com/javierbrea/eslint-plugin-boundaries) — enforcing architecture import rules.
- [When to Split a React Component — 137foundry](https://dev.to/137foundry/when-to-split-a-react-component-and-when-youre-over-engineering-2a6e) — the "and" test, wait for a third use case.
- [Naming Conventions in React — Sufle](https://www.sufle.io/blog/naming-conventions-in-react) (2024-09) — file, hook and constant naming.

### Business logic, hooks, constants, utils, data layer, state
- [Modularizing React Applications with Established UI Patterns — Juntao Qiu (martinfowler.com)](https://martinfowler.com/articles/modularizing-react-apps.html) (2023-02) — view / hook / domain model layering, domain without React.
- [Headless Component — Juntao Qiu (martinfowler.com)](https://martinfowler.com/articles/headless-component.html) (2023-11) — logic in hooks, JSX in a thin shell.
- [Client-Side Architecture Basics: Layers — Khalil Stemmler](https://khalilstemmler.com/articles/client-side-architecture/layers/) (2020) — presentation, UI logic, interaction/domain, infrastructure.
- [Reusing Logic with Custom Hooks — react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks) — a hook only if it calls hooks; `use` prefix rule.
- [You Might Not Need an Effect — react.dev](https://react.dev/learn/you-might-not-need-an-effect) — derived data and event logic stay out of Effects.
- [Effective React Query Keys — TkDodo](https://tkdodo.eu/blog/effective-react-query-keys) — colocated key factories.
- [Practical React Query — TkDodo](https://tkdodo.eu/blog/practical-react-query) — fetcher next to `useQuery`, don't copy server data into state.
- [Query Keys — TanStack Query docs](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) — key structure rules.
- [State Colocation will make your React app faster — Kent C. Dodds](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) (2019) — lift only as far as needed.
- [Application State Management with React — Kent C. Dodds](https://kentcdodds.com/blog/application-state-management-with-react) (2020) — server cache ≠ UI state.
- [nuqs — type-safe URL state](https://nuqs.dev/) — URL as a first-class state home.
- [Dunghill Anti-Pattern — Matti Lehtinen](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/) (2023-09) — why `utils` catch-alls rot.
- [Stop Trusting Your API: Zod + React Query — Josh Karamuth](https://joshkaramuth.com/blog/tanstack-zod-dto/) (2025-08) — parse and map DTOs at the fetch boundary.

### Next.js App Router architecture
- [Project structure and organization — Next.js docs](https://nextjs.org/docs/app/getting-started/project-structure) — colocation safety, private folders, four organizing strategies.
- [src folder — Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) — what stays at the root.
- [Route Groups — Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — organizational groups and their caveats.
- [Server and Client Components — Next.js docs](https://nextjs.org/docs/app/getting-started/server-and-client-components) — `'use client'` at leaves, composition via `children`, `server-only`.
- [How to Think About Security in Next.js — Sebastian Markbåge (Next.js blog)](https://nextjs.org/blog/security-nextjs-server-components-actions) (2023-10) — HTTP API / DAL / component-level data models, DTOs.
- [Data Security guide — Next.js docs](https://nextjs.org/docs/app/guides/data-security) — current DAL guidance, thin Server Actions, minimal return values.
- [next-forge — Vercel](https://github.com/vercel/next-forge/blob/main/README.md) — monorepo apps/packages split.
- [The Ultimate Next.js App Router Architecture — FSD blog](https://feature-sliced.design/blog/nextjs-app-router-guide) (2026-01) — thin routing files.
- [Usage with Next.js — FSD docs](https://feature-sliced.design/docs/guides/tech/with-nextjs) — reconciling FSD layers with `app/`.
- [Next.js App Router Project Structure — Makerkit](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure) — per-route `_components`/`_lib`, thin actions → services.
- [Getting started: App Router — next-intl](https://next-intl.dev/docs/getting-started/app-router) — `messages/` and `src/i18n/` placement.
- [Using TanStack Query with Next.js — LogRocket](https://blog.logrocket.com/using-tanstack-query-next-js/) (2023-10) — provider and hydration placement.
- [How I organize my files in NextJS — Codelynx](https://codelynx.dev/posts/2024-09-03-how-organise-files-in-nextjs) (2024-09) — route colocation plus `src/features/`.

## Changelog

- **1.0.0 (2026-09-19)** — initial version: classify/place/split recipe, Next.js boundaries and data layer, barrels policy, red flags.
