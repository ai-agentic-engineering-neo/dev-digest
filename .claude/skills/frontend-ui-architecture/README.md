# frontend-ui-architecture

Code organization and UI architecture for React + Next.js (App Router)
frontends. This README is for people maintaining the skill; the agent reads
[`SKILL.md`](SKILL.md).

## Version

| Version | Date | Change |
|---|---|---|
| **1.0.0** | 2026-09-21 | First release: principles, layers, "where does X go" table, business-logic tiers, splitting rules, import rules, Next.js App Router placement, review checklist; references for Next.js, layouts + lint enforcement, worked examples. |

The version is also in the `SKILL.md` frontmatter as `metadata.version`. Keep the
two in sync. Use semver: **major** when a rule changes meaning or is removed,
**minor** when a rule or reference file is added, **patch** for wording and link fixes.

## Focus

One question: **where does this code live, and who may depend on it?**

The skill is about structure, not behavior or performance. It answers:

- where components, hooks, constants, utils/helpers, types, API calls and
  business logic go, depending on how many places use them;
- when and how to split a component or a feature;
- which layer may import which (`shared → features → app`), and how that is enforced;
- where the `'use client'` and `server-only` boundaries sit in the folder tree;
- how to structure or migrate a whole project (small → feature folders → FSD).

## What it covers / does not cover

| Covers | Does not cover (goes to) |
|---|---|
| Folder layout, colocation, promotion to shared | Component purity, hooks rules, `useEffect` misuse → `react-best-practices` |
| Where constants, utils, helpers, `lib`, config live | Memoization and render performance → `react-best-practices` |
| Business logic tiers (domain → data → hook → view) | Next.js file conventions in detail, async APIs, caching → `next-best-practices` |
| Component splitting criteria | RSC validity rules (serializable props, async client components) → `next-best-practices` |
| Import direction, public API, barrels, lint enforcement | Auth/authorization inside the data layer → `security` |
| Client/server boundary **placement**, DAL location, Server Action location | Schema authoring → `zod`; how to write tests → `react-testing-library` |

## Intended use

- Creating a new screen, feature or folder and deciding where files go.
- "Where should this function/constant/hook live?"
- A component or file that has grown too large.
- Promoting code to shared, or a feature that suddenly needs another feature.
- Reviewing a PR for structure (section 8 of `SKILL.md` is a checklist).
- Proposing or migrating a project structure.

It is written for **any** React + Next.js App Router project, and states the
difference for the common case of an App Router app that is really an SPA
against a separate backend.

### In this repo (DevDigest `client/`)

`client/` is that SPA case: nearly every page is `"use client"` and data comes
from the Fastify API through TanStack Query. `SKILL.md` section 0 tells the agent
to follow an existing convention first, and here the convention is written down
in `client/CLAUDE.md` and `client/docs/ui-architecture.md` (thin pages,
colocated `_components/<Name>/` folders with `styles.ts`/`constants.ts`/
`helpers.ts`, all data through `src/lib/hooks/*`, three component tiers). Those
documents win over this skill's defaults wherever they differ.

## Related skills and how this one differs

| Skill | Its focus | Overlap with this skill | Who owns the overlap |
|---|---|---|---|
| `react-best-practices` | How a component and its hooks behave: purity, derived state, effects, memoization, keys, a11y, perf | Has a short "Code Organization" section and a "Premature Abstraction" rule | **This skill** for placement and structure; `react-best-practices` for everything inside a component |
| `next-best-practices` | Correct use of Next.js APIs: file conventions, RSC boundary validity, data patterns, metadata, images, fonts, bundling | `file-conventions.md` lists the project tree and private folders | `next-best-practices` for *what a special file does*; **this skill** for *where your own code goes* around those files |
| `security` | OWASP, auth, input validation, secrets | The DAL is where auth checks live | This skill says where the DAL is; `security` says what it must check |
| `typescript-expert` | Types, tooling, monorepos | Path aliases, package boundaries | This skill for app-internal folders; `typescript-expert` for multi-package setup |
| `react-testing-library` | Writing component tests | Test file placement | This skill: tests sit beside the file; RTL skill: how to write them |
| `zod` | Schema design | Where schemas live | This skill: in the feature's `api/` or the shared contract |

### Known divergences (deliberate)

These are places where this skill disagrees with `react-best-practices`. An agent
loading both should follow this skill on structural questions.

| Topic | `react-best-practices` | This skill | Why |
|---|---|---|---|
| Container / presentational | "Container components fetch data; presentational components receive props" | Not a folder rule; hooks give the same separation; extract a pure view only when it is reused or tested alone | Dan Abramov withdrew the pattern as a default in 2019 |
| Component size | "Max 200 lines per component — split if larger" | Split by responsibility and state ownership; size is a symptom | react.dev: single responsibility; splitting by count produces prop-threading |
| Shared utilities | "Shared utilities go in `utils/`" | `utils/` only for domain-agnostic code, by topic; domain helpers stay with their domain; promote on second consumer | Wieruch, Kent C. Dodds (colocation), Sandi Metz |

## Files

```
frontend-ui-architecture/
  SKILL.md                         # agent entry point (~300 lines)
  README.md                        # this file
  references/
    nextjs-app-router.md           # strategies, private folders, boundary placement, DAL, actions, SPA case
    layouts.md                     # small / feature-based / FSD trees, migration, lint configs
    examples.md                    # 7 before/after refactors
  evals/
    evals.json                     # test prompts for skill-creator runs
```

## Sources

Collected 2026-09-21. **Read**: page opened and checked while writing the skill.
**Excerpt**: only search-result excerpts were seen — open it before quoting it.

### Official documentation

| Source | Status | Used for |
|---|---|---|
| [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) (v16.3.5) | read | Three strategies, "be consistent", colocation safety, `_private` folders, route groups, `src/` |
| [Next.js — The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | read | "Code crosses through imports, data through props", directive only at the subtree entry, `children` pattern, compound components across the boundary |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | read | Directive on interactive leaves, providers "as deep as possible", third-party wrappers, `server-only` / `client-only` |
| [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | read | Data Access Layer (server-only, authz, DTOs, sole reader of `process.env`), "choose one approach", thin Server Actions delegating to the DAL |
| [Next.js — Authentication](https://nextjs.org/docs/app/guides/authentication) | excerpt | Companion to the DAL guidance |
| [Next.js — Composition patterns (v14)](https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns) | excerpt | Superseded by the two Server/Client pages above; kept for history |
| [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | read | Single responsibility, UI mirrors data model, state in the closest common parent |
| [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | read | Five state principles (background for splitting and state ownership) |
| [react.dev — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | excerpt | Lift to the closest common parent, no higher |
| [react.dev — Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) | excerpt | Separating "what happened" from "how state changes" |
| [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | read | `use` prefix only for functions that call hooks; purpose-named hooks, no `useMount`; hooks share logic, not state |
| [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | excerpt | Derive during render instead of syncing state |

### Architecture guides

| Source | Status | Used for |
|---|---|---|
| [Bulletproof React — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | read | `src/` folder set, feature folder contents, `shared → features → app`, no cross-feature imports, `import/no-restricted-paths` |
| [Bulletproof React — API layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md) | read | One API client instance; each request = types/schema + fetcher + hook |
| [Bulletproof React — repository](https://github.com/alan2207/bulletproof-react) | excerpt | Overview |
| [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | read | Progression from one file to domains/monorepo; "promote on the second feature"; `components/` only for reusable UI |
| [Feature-Sliced Design — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | read | `_app` / `_pages` renaming, routes re-export from FSD, `index.server.ts` |
| [Feature-Sliced Design — Public API](https://feature-sliced.design/docs/reference/public-api) | read | Slice `index.ts` as contract, no `export *`, no self-imports through index, `@x` cross-imports |
| [Feature-Sliced Design — Next.js App Router guide](https://feature-sliced.design/blog/nextjs-app-router-guide) | excerpt | Long-form companion |
| [Profy — React folder structures and screaming architecture](https://profy.dev/article/react-folder-structure) | excerpt | Domain-first naming |

### Principles and patterns

| Source | Status | Used for |
|---|---|---|
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | read | "Place code as close to where it's relevant as possible"; utils stay near first use; tests beside code |
| [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | excerpt | State at the lowest component that needs it (placement only — perf is out of scope) |
| [Kent C. Dodds — AHA Programming](https://kentcdodds.com/talks/aha-programming) | excerpt | Avoid hasty abstractions |
| [Sandi Metz — The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) | read | "Duplication is far cheaper than the wrong abstraction"; remedy: inline, then re-abstract |
| [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | excerpt (HTTP 403) | 2019 note: "I don't suggest splitting your components like this anymore … Hooks let me do the same thing without an arbitrary division" |
| [patterns.dev — Container/Presentational](https://www.patterns.dev/react/presentational-container-pattern/) | excerpt | The classic pattern, read alongside the retraction |
| [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) | excerpt | Hook per concern |
| [Martin Buchalik — The Controller Pattern](https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a) | excerpt | One orchestration hook per view |

### Data layer (TanStack Query)

| Source | Status | Used for |
|---|---|---|
| [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) | excerpt | Server state ≠ client state; custom hooks per query |
| [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | read | Keys colocated per feature (`features/x/queries.ts`), key factories |
| [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | excerpt | Share `queryOptions` across hooks and prefetching |

### Enforcement

| Source | Status | Used for |
|---|---|---|
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | read | Element types + default-deny dependency policies |

### Known gaps

- **Constants** have no authoritative dedicated source. The constants rules come
  from combining Wieruch (feature scope, promote on reuse), Bulletproof (`config/`
  for global/env), the Next.js DAL guide (secrets only in server-only code) and
  Kent C. Dodds (colocation).
- Rows marked *excerpt* should be read in full before a rule is attributed to
  them in a future version.

## Maintaining

- Change a rule → bump the version here and in `SKILL.md`, add a changelog row.
- Add a source → add it to the right table with its status.
- Test prompts live in `evals/evals.json`; run them with the `skill-creator` skill
  (with-skill vs without-skill) after any rule change.
