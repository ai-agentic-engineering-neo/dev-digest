# frontend-ui-architecture

**Version:** 1.0.0 · **Scope:** Frontend (React / Next.js) · **Entry:** [SKILL.md](SKILL.md)

Where code lives and how it is split in a React / Next.js app: folder structure, component decomposition,
constants, helpers vs utils, business logic, data layer, types, imports and module boundaries.

Out of scope (owned by sibling skills, to avoid duplication):
- hooks/state anti-patterns, performance → [react-best-practices](../react-best-practices/SKILL.md)
- Next.js framework APIs (RSC, metadata, route handlers) → [next-best-practices](../next-best-practices/SKILL.md)
- component tests → [react-testing-library](../react-testing-library/SKILL.md)

## Files

| File | Loaded | Purpose |
|---|---|---|
| `SKILL.md` | when the skill triggers | Principles, layers, "where does this go" table, splitting, logic, constants, helpers/utils, imports, checklist |
| `references/dev-digest-client.md` | when working in `client/` | Maps every rule to dev-digest paths and conventions |
| `references/examples.md` | on demand | Before/after trees and code |

## Versioning

SemVer in `SKILL.md` frontmatter (`metadata.version`) and here — bump both together.
MAJOR: a rule is reversed or removed · MINOR: new rule/section · PATCH: wording, examples, links.

### Changelog
- **1.0.0** — 2026-11-28 · Initial version, built from the sources below; "Code Organization" moved here from `react-best-practices`.

## How conflicts between sources were resolved

- **Feature-first** (#3, #4, #6) vs **role-first** (#7) top-level layout.
- **Barrel `index.ts`** as public API (#4, #7) vs **no barrels** (#17, #29, #30). Likely compromise: one entry per feature/slice, never barrels in `shared/` or for re-exporting a whole tree.
- **Container/presentational split** (#15 old) vs **hooks-as-containers** (#15 update, #18, #21).

Resolution in 1.0.0:
- **Layout:** feature-first top level (route-colocated `_components/`), role-based segments inside a feature; role-first only for small apps.
- **Barrels:** a per-component `index.ts` (re-exports one module) is allowed and is the public entry; new aggregate `export *` barrels are not. Barrels a repo already mandates are kept.
- **Container/presentational:** hooks are the default separation; a data wrapper + pure view only when the view is reused or tested in isolation.

## Sources

Collected 2026-11-27. Legend: **[P]** primary/official · **[A]** recognised author/reference project · **[C]** community/secondary.
Takeaways were collected from search excerpts; the rules in `SKILL.md` follow the consensus of several sources, not any single one.

### 1. Project & folder structure

| # | Source | Tier | Key takeaway |
|---|---|---|---|
| 1 | [Next.js — Project structure](https://nextjs.org/docs/app/getting-started/project-structure) | P | Colocation in `app/` is safe by default; three valid strategies (outside `app`, top-level in `app`, split by route/feature) — consistency matters more than choice |
| 2 | [Next.js — Colocation / private folders](https://nextjs.org/docs/app/building-your-application/routing/colocation) | P | `_folder` opts out of routing; `_components` is a convention, not a requirement |
| 3 | [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | A | `src/app` (routes) + `src/features/<name>/{api,components,hooks,types,utils}` + shared top-level `components/hooks/lib/utils`; no cross-feature imports, unidirectional flow shared → features → app |
| 4 | [Feature-Sliced Design docs](https://feature-sliced.design/docs) | A | Layers (app/pages/widgets/features/entities/shared) → slices (business domain) → segments (`ui`, `api`, `model`, `lib`, `config`); import only from lower layers; slice public API via `index.ts` |
| 5 | [Steiger — FSD linter](https://github.com/feature-sliced/steiger) | A | Tooling to enforce FSD rules |
| 6 | [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | A | Incremental: single file → files → folders → technical vs feature folders as the app grows |
| 7 | [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | A | Role-based top level (`components/`, `hooks/`, `helpers/`, `constants`); folder per component with `index` re-export. ⚠ conflicts with #3/#4 (feature-first) and #17 (barrels) |
| 8 | [Profy.dev — Screaming Architecture: evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) | C | Folder names should reveal the domain, not the framework |
| 9 | [Legacy React docs — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html) | P | React has no opinion; group by feature or by type; avoid deep nesting (≤3–4 levels) |

### 2. Colocation (what lives next to what)

| # | Source | Tier | Key takeaway |
|---|---|---|---|
| 10 | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | A | "Place code as close to where it's relevant as possible" — styles, tests, helpers next to the component; promote to shared only when reused |
| 11 | [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | A | Keep state as low as possible in the tree |
| 12 | [Epic Programming Style Guide](https://github.com/epicweb-dev/config/blob/main/docs/style-guide.md) | A | Opinionated conventions (naming, file casing, organisation) from the Epic Web stack |

### 3. Component decomposition

| # | Source | Tier | Key takeaway |
|---|---|---|---|
| 13 | [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | P | Split UI by single responsibility; minimal complete state; find where state lives |
| 14 | [react.dev — Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | P | Render is a pure function; side effects go to handlers/effects |
| 15 | [Dan Abramov — Presentational and Container Components (2019 update)](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | A | Author no longer recommends the strict split — custom hooks cover the same separation |
| 16 | [Vercel — composition-patterns agent skill](https://github.com/vercel-labs/agent-skills) | A | Compound components, lifted state, avoid boolean-prop sprawl; React 19 APIs |
| 16a | [Vercel — react-best-practices agent skill](https://github.com/vercel-labs/agent-skills) | A | Performance rules (waterfalls, bundle size, re-renders) — reference, not structure |

### 4. Business logic, hooks, data layer

| # | Source | Tier | Key takeaway |
|---|---|---|---|
| 18 | [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | P | Hooks share stateful logic, not state; hide external-system details behind a named hook |
| 19 | [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | P | Derive during render, put event logic in handlers; fewer hand-written effects |
| 20 | [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | P | No redundant/duplicated/deeply nested state |
| 21 | [Juntao Qiu (martinfowler.com) — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | A | Layering: view ↔ hooks (state) ↔ domain model (plain TS) ↔ data/network; polymorphism instead of `if` in views |
| 22 | [Profy.dev / J. Kettmann — Path to a Clean(er) React Architecture, pt. 6: business logic](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g) | C | Move non-UI logic into plain functions (use cases), inject deps, test without React |
| 23 | [… pt. 7: domain logic](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-7-domain-logic-lg) | C | Dedicated domain layer, framework-free |
| 24 | [… domain entities & DTOs](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0) | C | Map API DTOs to domain entities at the boundary; UI never sees raw API shapes |
| 25 | [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | A | Colocate `queryOptions` factories per feature as the single place for key + fn |
| 26 | [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | A | Query-key factories, keys colocated with the feature |
| 27 | [Next.js — Data security guide (Data Access Layer)](https://nextjs.org/docs/app/guides/data-security) | P | Server-only DAL: all data access + authz in one place, returns minimal DTOs; `server-only` package |
| 28 | [Next.js blog — How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) | P | Rationale for the DAL |

### 5. Constants, utils/helpers, naming, imports

| # | Source | Tier | Key takeaway |
|---|---|---|---|
| 17 | [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | A | Barrels cause circular imports, bigger module graphs, break `optimizePackageImports` |
| 29 | [Marvin Hagemeister — The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) | A | Module-graph size is the cost; barrels are the main cause |
| 30 | [Atlassian — Faster builds when removing barrel files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) | C | Real-world measurement (~75% faster builds) |
| 31 | [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) | P | `CONSTANT_CASE` for module-level constants; naming; prefer named exports |
| 32 | [Airbnb React/JSX Style Guide](https://airbnb.io/javascript/react/) | A | PascalCase component filenames, one component per file (pure helpers allowed) |
| 33 | ["utils and Other Useless Names"](https://webpage-a7v.pages.dev/posts/2025-02-15-never-name-utils) / [Xebia — No more helpers, please](https://xebia.com/blog/no-more-helpers-please/) | C | Name modules by what they do (`format-date.ts`), not `utils.ts` dumping grounds |
| 34 | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | A | Don't extract to shared/utils until the duplication shape is clear |

### 6. Enforcing boundaries (tooling)

| # | Source | Tier | Key takeaway |
|---|---|---|---|
| 35 | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | A | Declare element types by folder pattern, restrict which may import which |
| 36 | [eslint-plugin-import — no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | P | Simple zone rules (e.g. features ✗→ other features); needs TS resolver for path aliases |
| 37 | [Nx — enforce module boundaries](https://nx.dev/features/enforce-module-boundaries) | P | Tag-based rules, monorepo scale |
