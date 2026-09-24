# frontend-ui-architecture

**Version:** 1.0.0 · **Scope:** `client/` (Next.js 15 App Router · React 19 · TanStack Query 5 · next-intl)

Architecture and code-organization rules for the DevDigest UI: where components,
constants, helpers/utils, hooks and business logic live, how components are split,
which way imports may point, and where the server/client boundary goes.

| File | Loaded | Contents |
|---|---|---|
| [SKILL.md](SKILL.md) | when the skill triggers | the rules, decision tables, workflow and review checklists |
| [references/layout.md](references/layout.md) | on demand | full target tree, route-segment anatomy, promotion rules, naming |
| [references/examples.md](references/examples.md) | on demand | before/after code |
| README.md | humans | purpose, sources, decisions, changelog |

## Boundaries with other skills

Architecture only. To avoid duplicated guidance:
- hooks correctness, derive-don't-store, memoization, keys → `react-best-practices`
- Next.js file conventions detail, RSC serialization errors, async APIs, metadata,
  images, bundling → `next-best-practices`
- test mechanics → `react-testing-library`
- performance is intentionally out of scope

## Decisions where sources disagree

| Topic | Positions | Decision here |
|---|---|---|
| Barrel files | public-API index (J1, F2, W1) vs. "stop using barrels" (Q8, BF1, BF2, B1) | one shallow `index.ts` per component folder/shared module (existing convention); no nested or `export *` roll-ups, no self-imports |
| Container / presentational | retired (D1, PD2) vs. thin views + logic layers (M1, P1) | no container twins; logic goes to hooks + pure helpers |
| Custom query hooks vs `queryOptions` | wrap each query (Q4) vs. share `queryOptions` (Q5) | keep hooks in `lib/hooks` (existing convention); add a `queryOptions` factory when a key is reused |
| By function vs. by feature | flat technical folders (J1) vs. feature modules (B1, F1, W1); Next.js allows both (N1) | by route/feature via `_components`, shared UI promoted to `src/components` |
| Layering depth | FSD / clean architecture (F1, M1, P1) vs. grow as needed (K2, W1) | light layers (route → feature → shared → lib); no FSD layers |
| Default exports | banned (G1) vs. required by Next route files | named everywhere, default only in Next special files |
| Import style | relative (G1) vs. `@/` absolute (B4) | relative inside a folder tree, aliases across (F2) |
| File naming | kebab-case (W1, B4) vs. PascalCase component files (J1) | PascalCase component folders/files, kebab-case shared folders and lib modules (existing convention) |

## Sources

All links fetched and checked on 2026-09-22. `mirror` = original blocked, text
confirmed on a mirror; `search-only` = exists per search, content not fetched.

### Skill authoring
- Agent Skills specification — https://agentskills.io/specification (frontmatter, `metadata.version`, progressive disclosure)
- Skill authoring best practices, Anthropic — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

### React (official)
- R1 Thinking in React — https://react.dev/learn/thinking-in-react
- R2 You Might Not Need an Effect — https://react.dev/learn/you-might-not-need-an-effect
- R3 Reusing Logic with Custom Hooks — https://react.dev/learn/reusing-logic-with-custom-hooks
- R4 Keeping Components Pure — https://react.dev/learn/keeping-components-pure

### Next.js / Vercel
- N1 Project structure and organization — https://nextjs.org/docs/app/getting-started/project-structure
- N2 Server and Client Components — https://nextjs.org/docs/app/getting-started/server-and-client-components
- N3 The Server and Client Boundary — https://nextjs.org/docs/app/guides/server-and-client-boundary
- N4 Data Security (Data Access Layer) — https://nextjs.org/docs/app/guides/data-security
- N5 Understanding React Server Components — https://vercel.com/blog/understanding-react-server-components
- N6 Common mistakes with the Next.js App Router — https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them
- N7 `server-only` package — https://www.npmjs.com/package/server-only (npm returned 403; behaviour covered by N2/N4)

### TanStack Query
- Q1 Query Options guide — https://tanstack.com/query/latest/docs/framework/react/guides/query-options
- Q2 Query Keys guide — https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- Q3 Effective React Query Keys, TkDodo — https://tkdodo.eu/blog/effective-react-query-keys
- Q4 Practical React Query, TkDodo — https://tkdodo.eu/blog/practical-react-query
- Q5 The Query Options API, TkDodo — https://tkdodo.eu/blog/the-query-options-api
- Q6 Leveraging the Query Function Context, TkDodo — https://tkdodo.eu/blog/leveraging-the-query-function-context
- Q7 React Query and React Context, TkDodo — https://tkdodo.eu/blog/react-query-and-react-context
- Q8 Please Stop Using Barrel Files, TkDodo — https://tkdodo.eu/blog/please-stop-using-barrel-files

### Principles
- K1 Colocation, Kent C. Dodds — https://kentcdodds.com/blog/colocation
- K2 AHA Programming, Kent C. Dodds — https://kentcdodds.com/blog/aha-programming
- K3 State Colocation will make your React app faster, Kent C. Dodds — https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
- D1 Presentational and Container Components (2019 note), Dan Abramov — https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 (mirror)
- D2 Writing Resilient Components, Dan Abramov — https://overreacted.io/writing-resilient-components/

### Architecture methods and project structures
- F1 Feature-Sliced Design: Overview — https://feature-sliced.design/docs/get-started/overview
- F2 Feature-Sliced Design: Public API — https://feature-sliced.design/docs/reference/public-api
- F3 Feature-Sliced Design with Next.js — https://feature-sliced.design/docs/guides/tech/with-nextjs
- B1 Bulletproof React: Project Structure — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- B2 Bulletproof React — https://github.com/alan2207/bulletproof-react
- B3 Bulletproof React: API Layer — https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md
- B4 Bulletproof React: Project Standards — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md
- W1 React Folder Structure in 5 Steps, Robin Wieruch — https://www.robinwieruch.de/react-folder-structure/
- J1 Delightful React File/Directory Structure, Josh W. Comeau — https://www.joshwcomeau.com/react/file-structure/
- M1 Modularizing React Applications with Established UI Patterns, Juntao Qiu — https://martinfowler.com/articles/modularizing-react-apps.html
- P1 Business Logic Separation (Clean(er) React Architecture pt. 6), Johannes Kettmann — https://profy.dev/article/react-architecture-business-logic-and-dependency-injection (mirror: dev.to/jkettmann)
- P2 Separate API Layers in React Apps, profy.dev — https://profy.dev/article/react-architecture-api-layer (search-only)
- PD1 Hooks Pattern, patterns.dev — https://www.patterns.dev/react/hooks-pattern/
- PD2 Container/Presentational Pattern, patterns.dev — https://www.patterns.dev/react/presentational-container-pattern/

### Barrel files
- BF1 The barrel file debacle, Marvin Hagemeister — https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/
- BF2 75% faster builds by removing barrel files, Atlassian — https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files

### Enforcement, i18n, naming
- E1 eslint-plugin-boundaries docs — https://www.jsboundaries.dev/
- E2 eslint-plugin-boundaries repo — https://github.com/javierbrea/eslint-plugin-boundaries
- I1 next-intl: Rendering messages — https://next-intl.dev/docs/usage/messages
- I2 next-intl: Server & Client Components — https://next-intl.dev/docs/environments/server-client-components
- G1 Google TypeScript Style Guide — https://google.github.io/styleguide/tsguide.html

### Rule → source map

| SKILL.md section | Backed by |
|---|---|
| 1 Principles (colocate, AHA, one-way deps) | K1, K2, K3, B1, F1, W1 |
| 2 Layer map / forbidden imports | B1, F1, F2, E1, E2 |
| 3 Where does it go | N1, J1, B1, K1 |
| 4 Folder anatomy, naming | J1, W1, G1, B4, R3 |
| 5 Splitting | R1, D1, PD1, PD2 |
| 6 Business logic | M1, P1, R2, R4, N4 |
| 7 Constants / helpers / utils | J1, K1, G1 |
| 8 Data layer | Q1–Q7, B3 |
| 9 Server/client boundary, providers, i18n | N2, N3, N5, N6, I1, I2 |
| 10 Imports / public API / barrels | F2, Q8, BF1, BF2, B4, N1 |

## Changelog

- **1.0.0** (2026-09-22) — first version: principles, layer map, placement tables,
  component anatomy, splitting, business logic, data layer, server/client boundary,
  imports, workflow and review checklists; references `layout.md`, `examples.md`.

Versioning: bump `metadata.version` in SKILL.md and add a line here. MAJOR = a rule
reverses, MINOR = new rule/section, PATCH = wording/links.
