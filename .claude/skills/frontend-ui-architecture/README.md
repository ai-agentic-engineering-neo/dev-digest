# frontend-ui-architecture

**Version:** 1.0.0 · **Updated:** 2026-10-15

Agent skill for **frontend UI architecture and code organization** in React + Next.js App
Router projects: where components, constants, helpers, utils, types, hooks and business logic
live; how components and pages are split; how imports and server/client boundaries are drawn.

Deliberately **not** about performance, hooks rules or state management (→ `react-best-practices`)
or Next.js file conventions (→ `next-best-practices`).

## Files

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | Core principles, placement ladder, quick-decision table, anti-patterns, checklist |
| [references/placement.md](references/placement.md) | Components, constants, helpers vs utils vs lib, types, hooks, feature folders |
| [references/business-logic.md](references/business-logic.md) | API layer → server-state hooks → domain functions → UI hooks → components |
| [references/nextjs-app-router.md](references/nextjs-app-router.md) | Thin routes, `_components`, route groups, `'use client'` boundary, server-only code |
| [references/imports-boundaries.md](references/imports-boundaries.md) | Dependency direction, public API via `index.ts`, barrels, aliases, lint enforcement |
| [examples.md](examples.md) | DevDigest tree and good/bad examples from real `client/src` paths |

## Changelog

- **1.0.0** (2026-10-15) — Initial version, built from the sources below and the existing
  conventions of `client/` (`client/CLAUDE.md`).

Bump the version in both `SKILL.md` frontmatter (`metadata.version`) and this README: patch for
wording, minor for new rules/sections, major for changed placement rules.

## Sources

Each entry: what the skill took from it.

### Official documentation — React

1. [Thinking in React](https://react.dev/learn/thinking-in-react) — break UI into a component hierarchy by responsibility.
2. [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) — stateful logic moves into hooks named by behaviour.
3. [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — derive in render; effects only for external systems.
4. [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) — keep state minimal, derive the rest.
5. [Rules of React](https://react.dev/reference/rules) — components and hooks stay pure.

### Official documentation — Next.js

6. [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — safe colocation in `app/`, `_private` folders, route groups.
7. [Data security / Data Access Layer](https://nextjs.org/docs/app/guides/data-security) — server-only DAL, DTOs, `import 'server-only'`.
8. [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — default server, opt-in client.
9. [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) — `'use client'` at the entry of a client subtree.
10. [Composition Patterns](https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns) — server content into client components via `children`; wrapping third-party components.
11. [Directives](https://nextjs.org/docs/app/api-reference/directives) — `use client` / `use server` semantics.

### Architecture methodologies

12. [Bulletproof React — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — feature folders, shared vs feature code, unidirectional imports.
13. [Bulletproof React — AGENTS.md](https://github.com/alan2207/bulletproof-react/blob/master/AGENTS.md) — feature folder segments (`api`, `components`, `hooks`, `types`).
14. [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) — layers → slices → segments.
15. [FSD — Layers](https://fsd.how/docs/reference/layers/) — import only from lower layers.
16. [FSD — Slices and segments](https://fsd.how/docs/reference/slices-segments/) — public API per slice; `ui/model/api/lib` segments.
17. [FSD — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide) — routes assemble, features hold logic.
18. [feature-sliced/skills](https://github.com/feature-sliced/skills) — official FSD agent skills (reference for skill format).
19. [Juntao Qiu — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) — React as view layer; layered view / non-view logic.

### Folder structure and colocation

20. [Robin Wieruch — React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/) — staged growth, folder per component, promote on second consumer, ≤ 2 nesting levels.
21. [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — keep things that change together together.
22. [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — keep state where it is used.
23. [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) — component folders, aliases, descriptive file names.
24. [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) — trade-offs and critique of feature-folder dependency rules.
25. [Tania Rascia — How to Structure and Organize a React Application](https://www.taniarascia.com/react-architecture-directory-structure/) — global vs feature-local modules.
26. [Makerkit — Next.js App Router Project Structure](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure) — thin actions / thick services, server-only folder.

### Business logic, API layer, data

27. [profy.dev — Separate API Layers in React Apps](https://profy.dev/article/react-architecture-api-layer) — components don't know endpoints or HTTP client.
28. [profy.dev — Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) — logic out of components into hooks/services. Mirror: [dev.to](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g).
29. [profy.dev — Domain Logic](https://profy.dev/article/react-architecture-domain-logic) — pure domain functions independent of UI.
30. [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) — 2019 update: prefer hooks over a dogmatic split.
31. [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) — key factories per domain.
32. [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) — `queryOptions` as the reusable unit.
33. [TkDodo — Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) — where query abstractions live.
34. [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) — helpers outside components, module separation.
35. [Alex Kondov — Clean Architecture in React](https://alexkondov.com/full-stack-tao-clean-architecture-react/) — layering a React app.

### Component patterns

36. [patterns.dev — Hooks Pattern](https://www.patterns.dev/react/hooks-pattern/) — extract behaviour ("verbs") into hooks.
37. [patterns.dev — Compound Pattern](https://www.patterns.dev/react/compound-pattern/) — composition over boolean props.

### Imports, barrels, boundaries

38. [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) — no app-wide barrels.
39. [Codecompose — Why I Prefer Barrel Files in 2026](https://codecompose.com/articles/why-i-prefer-barrel-files-in-2026/) — counter-argument; basis for allowing small folder entries.
40. [JS Boundaries / eslint-plugin-boundaries](https://www.jsboundaries.dev/docs/quick-start/) — lint-enforced element types and `no-private`.
41. [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — graph rules and cycle detection in CI.

### Style guides

42. [Airbnb React/JSX Style Guide](https://airbnb.io/javascript/react/) — PascalCase files, one component per file.
43. [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) — named exports over default exports.

### Reviewed, deliberately not used

- [Vercel — Introducing React Best Practices](https://vercel.com/blog/introducing-react-best-practices) / [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) — performance rules, out of scope for an architecture skill.

### Project sources

- `client/CLAUDE.md`, `client/INSIGHTS.md` and the existing `client/src` layout — the conventions this skill codifies.
