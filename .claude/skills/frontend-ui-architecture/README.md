# frontend-ui-architecture

**Version:** 1.1.0 · **Updated:** 2026-11-05 · **Scope:** `client/` (Next.js 15 App Router, React 19, TanStack Query)

Our own project skill (not vendored). It answers one question for the frontend: **where does this
code go, and which way may it import?** It covers where components, helpers, constants, hooks,
types, business logic and state live, how to split components, the layer and import rules, and
Next.js App Router organization.

## Scope and neighbours

| Topic | Skill |
|---|---|
| Code organization, layers, placement, splitting, state location, Next.js structure | **frontend-ui-architecture** (this) |
| Hook misuse, derive-don't-store details, React anti-patterns, performance | `react-best-practices` |
| Next.js file conventions, RSC boundary errors, caching, metadata, images and fonts | `next-best-practices` |
| Tests | `react-testing-library` |

## Files

| File | Loaded | Content |
|---|---|---|
| `SKILL.md` | when the skill triggers | layers, placement table, promotion, splitting, business logic, state, Next.js essentials, anti-patterns |
| `references/nextjs-app-router.md` | when touching routes/layouts, the `'use client'` boundary, or a server layer | App Router organization, server/client boundary, data-handling model, DAL/Server Actions rules |
| `references/examples.md` | when you need a worked example | a "new feature" walkthrough plus good/bad pairs on real `client/` paths |
| `README.md` | humans | this file: scope, versioning, decisions, sources |

## Versioning

Semantic versioning, stored in `SKILL.md` frontmatter (`metadata.version`) and mirrored here.

- **MAJOR**: a rule changes direction (e.g. switching to feature-sliced folders, introducing a DAL).
- **MINOR**: a new rule or section.
- **PATCH**: wording, examples, links.

Bump both places together and add a changelog line.

### Changelog

- **1.1.0** (2026-11-05): §11 is now "Scope". It requires asking before adding a new data source (hook, endpoint, contract type) and forbids drive-by refactors of unrelated files. Added after eval iteration 1, where both configurations silently added a hook and type.
- **1.0.0** (2026-11-05): initial version, built from the research below.

## Decisions on conflicting advice

| # | Conflict | Decision | Why |
|---|---|---|---|
| 1 | Group by feature (Bulletproof, FSD, Kondov) vs by function (Comeau) | Hybrid: route-colocated `_components/` plus shared `src/components`, `src/lib` | It matches Next.js strategy "split by feature or route" and the existing code |
| 2 | Barrels: avoid (Bulletproof, TkDodo) vs `index.ts` per component (Kondov, `client/CLAUDE.md`) | Single-component `index.ts` allowed. No new aggregate barrels. `@devdigest/ui` and `lib/hooks/index.ts` stay as exceptions. | It keeps the public entry without the cost: cycles and loading every module |
| 3 | Business logic in hooks vs in plain modules (Fowler/Qiu) | Rules live in pure `helpers.ts` / `src/lib` modules. Hooks orchestrate, components render. | It makes the rules testable without React |
| 4 | Screens next to routes (Next.js) vs `app/` routing-only + `src/pages` (FSD) | Screens in `_components/` (`<Name>View` when a page grows) | It is what the codebase already does, and FSD would be a full migration |
| 5 | Next.js data model | "HTTP APIs" (Fastify backend). No Server Actions or DAL until explicitly decided. | The official guide says pick one model and don't mix |

## Sources

Collected 2026-11-05. ✔ = page read in full during research. ○ = confirmed via search results only
(re-read before quoting).

### Primary: React and architecture

| Source | Author / date | Used for |
|---|---|---|
| ✔ [Bulletproof React: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Alan Alickovic | layers, one-way imports, no cross-feature imports, no barrels |
| ✔ [Colocation](https://kentcdodds.com/blog/colocation) | Kent C. Dodds, 2019-06-17 | the core principle, helpers stay local until shared |
| ✔ [Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Juntao Qiu (martinfowler.com), 2023-02-16 | view / hooks / domain / gateway layers, where business logic lives |
| ✔ [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team | derive during render, logic in event handlers |
| ✔ [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | Dominik Dorfmeister (TkDodo), 2024-07-26 | barrel policy |
| ✔ [Tao of React](https://alexkondov.com/tao-of-react/) | Alex Kondov, 2021 | splitting signals, constants outside components, props count |
| ○ [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | React team | hooks share logic, not state |
| ○ [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | React team | no redundant state |
| ○ [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | React team | lifting state |
| ○ [Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | React team | pure render |
| ○ [Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview) · [Layers](https://feature-sliced.design/docs/reference/layers) | FSD community | layer vocabulary, downward imports |

### Primary: Next.js architecture

| Source | Author / date | Used for |
|---|---|---|
| ✔ [Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure) | Vercel, upd. 2026-07-21 | colocation, `_private`, `(groups)`, the 3 strategies |
| ✔ [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Vercel, upd. 2026-10-05 | `'use client'` boundary, composition, providers, `server-only` |
| ✔ [Data Security guide](https://nextjs.org/docs/app/guides/data-security) | Vercel, upd. 2026-10-06 | 3 data models, DAL, DTO, Server Action rules |
| ✔ [How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) | Sebastian Markbåge, 2023-10-23 | origin of the DAL model |
| ✔ [Next.js App Router guide (FSD)](https://feature-sliced.design/blog/nextjs-app-router-guide) | Evan Carter, 2026-01-23 | "routes assemble, don't implement" |
| ○ [Server and Client Composition Patterns](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns) | Vercel (older page) | composition, provider depth |
| ○ [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | Vercel | boundary details |
| ○ [Server Actions guide](https://nextjs.org/docs/app/guides/server-actions) | Vercel | action model |
| ○ [Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) | Vercel | `(group)` layouts |
| ○ [OWASP Next.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html) | OWASP | DAL + DTO, don't rely on middleware alone |

### Supporting

| Source | Author / date | Used for |
|---|---|---|
| ○ [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Josh W. Comeau, 2022 (upd. 2025-12) | group-by-function view, conflict #1 |
| ○ [React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) | Robin Wieruch | gradual structure growth |
| ○ [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | Dan Abramov, 2015 (2019 note) | historical split; hooks replace containers |
| ○ [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Kent C. Dodds, 2019 | state as low as possible |
| ○ [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Kent C. Dodds | server vs UI state |
| ○ [When to break up a component into multiple components](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) | Kent C. Dodds | splitting |
| ○ [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | TkDodo | key conventions |
| ○ [Practical React Query](https://tkdodo.eu/blog/practical-react-query) | TkDodo | query hooks as the server-state layer |
| ○ [Screaming Architecture: React folder structure](https://profy.dev/article/react-folder-structure) | Johannes Kettmann | feature folders |
| ○ [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Javier Brea | possible future enforcement of import rules |
| ○ [Server Actions vs Route Handlers](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers) | MakerKit | when each applies (secondary) |

### Project sources

- [`client/CLAUDE.md`](../../../client/CLAUDE.md): layout, component folder shape, naming. The skill codifies it and does not override it.
- [`client/INSIGHTS.md`](../../../client/INSIGHTS.md): lessons learned in `client/`.
