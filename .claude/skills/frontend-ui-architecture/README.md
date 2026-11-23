# frontend-ui-architecture

**Version: 1.0.0** · Scope: React 19 + Next.js App Router **architecture and code organization** (where code goes, how it is split, who may import whom). Performance, hook-misuse patterns and RSC runtime rules are out of scope — see [`react-best-practices`](../react-best-practices/SKILL.md) and [`next-best-practices`](../next-best-practices/SKILL.md).

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Entry point: placement decision flow, 14 core rules, review checklist |
| `references/nextjs-app-structure.md` | `app/` layout, `_private` folders, route groups, `server-only` |
| `references/component-design.md` | Folder anatomy, when/how to split, composition |
| `references/logic-placement.md` | Constants, helpers vs hooks, business logic, data access, types |
| `references/imports-boundaries.md` | Aliases, `index.ts`, barrels, dependency direction, lint enforcement |
| `references/devdigest-profile.md` | The rules mapped onto `client/src`, known deviations |
| `examples.md` | Before/after trees and code |
| `evals/` | Three test cases (`prompt.md`, `case.yaml`, `graders/`) |

## Versioning

Semantic versioning, recorded in `SKILL.md` frontmatter (`metadata.version`) and here.
- **MAJOR** — a core rule is reversed or removed.
- **MINOR** — a rule or reference file is added.
- **PATCH** — wording, examples, fixed links.

### Changelog
- **1.0.0 — 2026-11-23** — Initial release. 14 rules, 5 references, 3 evals, 37 sources.

## Sources

Tiers: **T1** official docs · **T2** recognized practitioner / architecture reference · **T3** tooling.
"Check" column: ✅ fetched and read 2026-11-23 · ⚠️ link from a search result, not fetch-verified (reason given). Gists are paraphrased, not quoted.

### T1 — Official documentation
| ID | Source | URL | Used for | Check |
|---|---|---|---|---|
| D1 | React — Thinking in React | https://react.dev/learn/thinking-in-react | Component hierarchy from UI; state in the closest common parent | ✅ |
| D2 | React — Choosing the State Structure | https://react.dev/learn/choosing-the-state-structure | No duplicated or contradictory state; keep it flat | ✅ |
| D3 | React — Reusing Logic with Custom Hooks | https://react.dev/learn/reusing-logic-with-custom-hooks | Hooks share logic, not state; `useX` naming | ✅ |
| D4 | React — Sharing State Between Components | https://react.dev/learn/sharing-state-between-components | Lift state; single owner per state | ✅ |
| D5 | React — You Might Not Need an Effect | https://react.dev/learn/you-might-not-need-an-effect | Derive in render; events in handlers | ✅ |
| D6 | React — Keeping Components Pure | https://react.dev/learn/keeping-components-pure | Pure render; side effects out of render | ✅ |
| N1 | Next.js — Project structure and organization | https://nextjs.org/docs/app/getting-started/project-structure | Colocation is safe; `_private` folders; route groups; `src` | ✅ |
| N2 | Next.js — Colocation (older URL) | https://nextjs.org/docs/app/building-your-application/routing/colocation | Same content as N1 (serves the same page) | ✅ |
| N3 | Next.js — Server and Client Components | https://nextjs.org/docs/app/getting-started/server-and-client-components | `"use client"` at the leaves; `server-only` | ✅ |
| N4 | Next.js — `optimizePackageImports` | https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports | Barrel-file cost and the framework workaround | ✅ |
| Q1 | TanStack Query — Query Keys | https://tanstack.com/query/latest/docs/framework/react/guides/query-keys | Keys include every variable the query depends on | ✅ |
| G1 | Google TypeScript Style Guide | https://google.github.io/styleguide/tsguide.html | Named exports, constant naming. No component guidance | ✅ partial |

### T2 — Architecture references and practitioners
| ID | Source | URL | Used for | Check |
|---|---|---|---|---|
| R2 | Bulletproof React — project structure (alan2207) | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | Feature folders; one-way imports; no cross-feature imports; lint zones | ✅ |
| F1 | Feature-Sliced Design | https://feature-sliced.design/ | Layers/slices/segments; public API per slice | ✅ |
| M1 | Martin Fowler's site — Modularizing React Applications with Established UI Patterns | https://martinfowler.com/articles/modularizing-react-apps.html | View vs non-view logic; presentation/domain/data layers | ✅ partial |
| R3 | Robin Wieruch — React Folder Structure | https://www.robinwieruch.de/react-folder-structure/ | Grow structure step by step; folder per component; features don't import each other | ✅ |
| R5 | Alex Kondov — Tao of React | https://alexkondov.com/tao-of-react/ | Group by route/module; common module; absolute paths | ✅ |
| R8 | Josh W. Comeau — React File/Directory Structure | https://www.joshwcomeau.com/react/file-structure/ | Per-component folder + `index`; by-function alternative; barrel trade-offs | ✅ |
| P1 | Profy.dev (J. Kettmann) — Clean React architecture, part 6: business logic separation | https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g | UI-independent logic out of components | ⚠️ dev.to mirror; profy.dev DNS failed |
| P2 | Profy.dev — Screaming architecture: evolution of a React folder structure | https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25 | Feature-oriented folder evolution | ⚠️ dev.to mirror; profy.dev DNS failed |
| K1 | TkDodo — Effective React Query Keys | https://tkdodo.eu/blog/effective-react-query-keys | Colocate keys with queries; key factory per feature | ✅ |
| K2 | TkDodo — Practical React Query | https://tkdodo.eu/blog/practical-react-query | Server state ≠ client state; wrap `useQuery` in custom hooks | ✅ |
| R1 | Kent C. Dodds — Colocation | https://kentcdodds.com/blog/colocation | Place code as close as possible to where it is used | ✅ |
| R6 | Kent C. Dodds — AHA Programming | https://kentcdodds.com/blog/aha-programming | Avoid hasty abstractions | ✅ |
| R9 | Kent C. Dodds — State Colocation will make your React app faster | https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster | Where state belongs (read for placement, not performance) | ✅ |
| R7 | Sandi Metz — The Wrong Abstraction | https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction | Duplication is cheaper than the wrong abstraction | ✅ |
| R4 | Dan Abramov — Presentational and Container Components (2019 note) | https://medium.com/@dan_abramov/7ca2f9a7c7d0 | Pattern is optional once hooks exist | ⚠️ HTTP 403 to automated fetch; URL from search result |
| R12 | Nadia Makarevich — React components composition | https://www.developerway.com/posts/components-composition-how-to-get-it-right | Implement-or-compose; `children`; extract on need | ✅ |
| R13 | patterns.dev — Container/Presentational | https://www.patterns.dev/react/presentational-container-pattern | Pattern definition; hooks often replace it | ✅ |
| R14 | patterns.dev — Compound pattern | https://www.patterns.dev/react/compound-pattern | Cohesive multi-part widgets sharing state | ✅ |
| R15 | patterns.dev — Hooks pattern | https://www.patterns.dev/react/hooks-pattern | Hooks replace HOCs/render props for sharing logic | ✅ |
| R10 | Epic Web — Avoid Hasty Abstractions | https://www.epicweb.dev/principles/craft/architecting-projects/aha | AHA summary | ✅ |
| R11 | mithi — react-philosophies | https://github.com/mithi/react-philosophies | Small components, helpers/hooks, colocate context | ✅ partial |

### T3 — Tooling to enforce structure
| ID | Source | URL | Used for | Check |
|---|---|---|---|---|
| L1 | eslint-plugin-boundaries | https://github.com/javierbrea/eslint-plugin-boundaries | Element types + allowed dependency rules | ✅ |
| L2 | eslint-plugin-import — `no-restricted-paths` | https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md | Zone rules (`target`/`from`) | ✅ |
| B1 | Vercel — How we optimized package imports in Next.js | https://vercel.com/blog/how-we-optimized-package-imports-in-next-js | Why big barrels hurt dev/build | ✅ |
| S1 | Steiger (FSD linter) | https://github.com/feature-sliced/steiger | FSD conformance rules (beta) | ✅ |

### Related, not duplicated
- [`react-best-practices`](../react-best-practices/SKILL.md) — hooks, state, memo, keys (local).
- [`next-best-practices`](../next-best-practices/SKILL.md) — RSC/runtime rules (local).
- `vercel-labs/agent-skills` → `react-best-practices` — performance rules; excluded on purpose.

### Maintaining the list
Add a row with a new ID, check the URL, state what we took from it, and bump the version (MINOR if a rule changes because of it). Never cite a source from memory or from a search snippet alone — fetch it, or mark it ⚠️.
