# frontend-ui-architecture

**Version:** 1.0.0 (2026-11-27) · **Type:** local skill (not vendored, not in `skills-lock.json`)

A skill about the **architecture and code organization** of a React + Next.js App Router
frontend: where components, constants, helpers and utils, hooks, styles and types live, how to
split components, where business logic and data access sit, where the Server/Client
boundary goes, and which way imports may point. It gives general rules first and the
DevDigest `client/` conventions second.

It deliberately leaves out **performance** (memoization, bundle size, caching, rendering
speed) and the hook anti-pattern catalog, because the vendored `react-best-practices` and
`next-best-practices` skills already cover them.

## Files

| File | Purpose | Loaded |
|---|---|---|
| [SKILL.md](SKILL.md) | Principles, a "where does X go?" table, rules per topic, review checklist | whenever the skill triggers |
| [references/nextjs-app-router.md](references/nextjs-app-router.md) | App Router architecture: routing vs code, `_private`/`(group)` folders, Server/Client boundary, DAL and Server Actions placement, route-level states, FSD/Bulletproof mapping, DevDigest specifics | on demand |
| [references/examples.md](references/examples.md) | Good and bad folder trees and refactors, using real `client/` paths | on demand |

## How to update

1. Edit the rule in `SKILL.md` or the reference file, and keep the *(source)* attribution next to it.
2. Add any new source to the list below.
3. Bump `metadata.version` in the `SKILL.md` frontmatter: patch for wording, minor for a new or changed rule, major for a restructure or a changed default. Then add a changelog entry.
4. If a DevDigest convention changes, update `client/AGENTS.md` too. The two must never contradict each other.

## Changelog

- **1.0.0** (2026-11-27): first version. Covers React organization (components, constants, helpers and utils, business logic and state, imports) and Next.js App Router architecture.

## Sources

Every source used while researching and writing this skill. The short names in *(italics)* in the skill files refer to these entries.

### Official docs: React
1. React: Thinking in React. https://react.dev/learn/thinking-in-react
2. React: Choosing the State Structure. https://react.dev/learn/choosing-the-state-structure
3. React: Sharing State Between Components. https://react.dev/learn/sharing-state-between-components
4. React: Reusing Logic with Custom Hooks. https://react.dev/learn/reusing-logic-with-custom-hooks
5. React: You Might Not Need an Effect. https://react.dev/learn/you-might-not-need-an-effect
6. React: Keeping Components Pure. https://react.dev/learn/keeping-components-pure
7. React (legacy) FAQ: File Structure. https://legacy.reactjs.org/docs/faq-structure.html

### Official docs: Next.js (App Router)
8. Next.js: Project structure and organization. https://nextjs.org/docs/app/getting-started/project-structure
9. Next.js: Colocation and private folders. https://nextjs.org/docs/app/building-your-application/routing/colocation
10. Next.js: Route Groups. https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
11. Next.js: Layouts and Pages. https://nextjs.org/docs/app/getting-started/layouts-and-pages
12. Next.js: Server and Client Components. https://nextjs.org/docs/app/getting-started/server-and-client-components
13. Next.js: Server and Client Boundary guide. https://nextjs.org/docs/app/guides/server-and-client-boundary
14. Next.js: Composition Patterns. https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns
15. Next.js: Error Handling. https://nextjs.org/docs/app/getting-started/error-handling
16. Next.js: Updating Data (Server Actions). https://nextjs.org/docs/app/getting-started/updating-data
17. Next.js: Data Security (Data Access Layer, `server-only`). https://nextjs.org/docs/app/guides/data-security
18. Next.js blog: How to Think About Security in Next.js (Server Components and Actions). https://nextjs.org/blog/security-nextjs-server-components-actions
19. Next.js: TanStack Query guide. https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query
20. Next.js: `src` directory. https://nextjs.org/docs/app/building-your-application/configuring/src-directory

### Architecture methodologies
21. Bulletproof React: Project Structure. https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
22. Feature-Sliced Design: Overview (layers, slices, segments, public API). https://feature-sliced.design/docs/get-started/overview
23. Juntao Qiu (on martinfowler.com): Modularizing React Applications with Established UI Patterns. https://martinfowler.com/articles/modularizing-react-apps.html
24. Juntao Qiu: The evolution of a React application. https://itnext.io/the-evolution-of-a-react-application-a28c14496473
25. Profy.dev: Screaming Architecture, the evolution of a React folder structure. https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25
26. FSD × Next.js App Router: How to deal with Next.js using Feature-Sliced Design. https://dev.to/m_midas/how-to-deal-with-nextjs-using-feature-sliced-design-4c67
27. FSD × Next.js App Router: How to deal with the Next.js App Router and FSD problem. https://hackernoon.com/how-to-deal-with-the-nextjs-app-router-and-fsd-problem
28. Makerkit: Next.js App Router project structure (community). https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure

### Folder structure and colocation
29. Kent C. Dodds: Colocation. https://kentcdodds.com/blog/colocation
30. Kent C. Dodds: State Colocation will make your React app faster. https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
31. Robin Wieruch: React Folder Structure in 5 Steps. https://www.robinwieruch.de/react-folder-structure/
32. Josh W. Comeau: Delightful React File/Directory Structure. https://www.joshwcomeau.com/react/file-structure/
33. Max Rozen: Guidelines to improve your React folder structure. https://maxrozen.com/guidelines-improve-react-app-folder-structure
34. Dave Ceddia: How to Structure Your React Project. https://daveceddia.com/react-project-structure

### Component design and separating logic
35. patterns.dev: Container/Presentational pattern. https://www.patterns.dev/react/presentational-container-pattern
36. patterns.dev: Hooks pattern. https://www.patterns.dev/react/hooks-pattern
37. patterns.dev: Compound pattern. https://www.patterns.dev/react/compound-pattern
38. Kent C. Dodds: AHA Programming (Avoid Hasty Abstractions). https://kentcdodds.com/blog/aha-programming
39. Stack Overflow blog: Don't build the reusable component yet (2026-11-05). https://stackoverflow.blog/2026/11/05/don-t-build-the-reusable-component-yet/

### The data layer (TanStack Query)
40. TkDodo: Practical React Query. https://tkdodo.eu/blog/practical-react-query
41. TkDodo: Effective React Query Keys. https://tkdodo.eu/blog/effective-react-query-keys
42. TkDodo: The Query Options API. https://tkdodo.eu/blog/the-query-options-api
43. TanStack Query: Advanced Server Rendering. https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr

### Security boundaries that affect architecture
44. Robin Wieruch: Authorization in Next.js. https://www.robinwieruch.de/next-authorization/
45. OWASP: Next.js Security Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html

### Imports, barrels and boundaries
46. TkDodo: Please Stop Using Barrel Files. https://tkdodo.eu/blog/please-stop-using-barrel-files
47. Marvin Hagemeister: Speeding up the JavaScript ecosystem, the barrel file debacle. https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/
48. eslint-plugin-boundaries. https://github.com/javierbrea/eslint-plugin-boundaries

### Naming and constants
49. Google TypeScript Style Guide. https://google.github.io/styleguide/tsguide.html
50. Airbnb React/JSX Style Guide. https://github.com/airbnb/javascript/tree/master/react

### Reference skills (used for format and to avoid overlap, nothing copied)
51. vercel-labs/agent-skills: react-best-practices. https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
52. In this repo: `.claude/skills/react-best-practices`, `.claude/skills/next-best-practices` (vendored, performance and anti-patterns).
53. Anthropic skill-creator guidelines: progressive disclosure, a "pushy" description, SKILL.md under 500 lines, explaining the why behind each rule.

### Project ground truth (DevDigest)
54. `client/AGENTS.md`: the module's conventions. The skill's DevDigest column follows it.
55. Real layouts used in the examples: `client/src/app/agents/_components/`, `client/src/components/diff-viewer/`, `client/src/components/app-shell/hooks/`, `client/src/lib/hooks/`, `client/src/lib/format-cost.ts`.
