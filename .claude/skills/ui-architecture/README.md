# ui-architecture — sources

Research notes and source list behind [SKILL.md](SKILL.md) and [examples.md](examples.md).
Compiled 2026-09-18. Scope: frontend **code organization/architecture** (component
placement, folder structure, constants/utils/helpers, business-logic layering) for
React + Next.js App Router — explicitly not performance and not framework API
mechanics (those live in `next-best-practices` and `react-best-practices`).

## Primary / official sources

- [Next.js docs — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — colocation safety guarantee, private folders (`_folder`), route groups, the three top-level organization strategies. Official, unopinionated-by-design stance.
- [bulletproof-react — Project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — feature-based folder layout, unidirectional import rules (shared → features → app), `import/no-restricted-paths` ESLint enforcement, "avoid barrel files" guidance.
- [bulletproof-react (repo)](https://github.com/alan2207/bulletproof-react) — full reference implementation of the above.
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) and [documentation repo](https://github.com/feature-sliced/documentation) — layers/slices/segments model, strict one-directional layer dependencies. Used as a cross-check for the "shared → features → app" rule, not adopted wholesale (FSD's 7-layer model is heavier than this project needs).

## Practitioner references

- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — "place code as close to where it's relevant as possible"; source of this skill's core promotion rule.
- [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [Robin Wieruch — React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/) — scale-based folder progression (small → medium → large → monorepo), explicit constants/utils/hooks placement table, barrel-file tradeoffs, naming conventions.
- [arhamkhnz/next-colocation-template](https://github.com/arhamkhnz/next-colocation-template) — concrete Next.js App Router example of `_components/`/`_hooks/`/`_lib/` colocated per route; closely matches this project's existing `_components/<Name>/` convention (see `client/AGENTS.md`).
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) — presentation / business logic / application logic / external world layering model used in the "Where business logic lives" section.
- [profy.dev — Path To A Clean(er) React Architecture (Part 6): Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)

## Container/presentational → hooks

- [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) — pattern definition and its current (optional, not required) status.
- Search-aggregated consensus (Dan Abramov's public walk-back of his original container/presentational post, cited across multiple 2024–2025 write-ups) that custom hooks replaced the need for a dedicated container-component layer.

## Barrel files (`index.ts`)

- [Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026)](https://reactuse.com/blog/barrel-files-tree-shaking/) — concrete bundle-size regressions from wide barrel chains; basis for the "narrow vs. wide" distinction in this skill (small per-folder barrels are fine, app-wide re-export chains are not).

## Project-internal grounding

- [`client/AGENTS.md`](../../../client/AGENTS.md) (formerly `client/CLAUDE.md`) — this project's existing, already-in-production convention: `_components/<PascalCaseName>/` colocation, `src/components` for cross-cutting chrome, `src/lib/hooks/*` as the mandatory data-fetching layer. This skill formalizes and extends that convention rather than inventing a new one — it turned out to already match the "colocation-first" pattern documented above.
- [`react-best-practices/SKILL.md`](../react-best-practices/SKILL.md) — has a brief "Code Organization" section; this skill is the deeper, architecture-focused complement, not a replacement.
- [`next-best-practices/SKILL.md`](../next-best-practices/SKILL.md) — covers Next.js file-convention *mechanics* (routing, RSC, async APIs); this skill covers *where files go*, which the mechanics doc intentionally leaves unopinionated.

## Deliberately not covered here (see the other skills instead)

- Hooks correctness rules (`useEffect` deps, memoization thresholds, key props) → `react-best-practices`
- Next.js rendering boundaries, async `params`/`cookies()`, metadata, image/font optimization → `next-best-practices`
- Performance (bundle splitting, `React.lazy`, Core Web Vitals) → out of scope by explicit request; not this skill's concern
