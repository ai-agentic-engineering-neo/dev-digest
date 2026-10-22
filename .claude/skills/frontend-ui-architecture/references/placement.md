# Placement — components, constants, helpers, utils, lib, types

Contents: [Ladder](#the-ladder) · [Components](#components) · [Constants](#constants) ·
[helpers vs utils vs lib](#helpers-vs-utils-vs-lib) · [Types](#types) · [Hooks](#hooks) ·
[Tests and styles](#tests-and-styles) · [Feature folders](#when-to-introduce-feature-folders)

## The ladder

Every piece of code has a set of consumers. Place it at the **lowest common ancestor folder**
of those consumers:

```
component file  →  component folder  →  route folder  →  src/components | src/lib  →  package
   (1 user)          (1 component)       (1 route)          (≥ 2 routes / app-wide)    (≥ 2 apps)
```

- Start low. Moving code **up** later is a cheap, mechanical refactor; moving a premature
  abstraction back **down** (and untangling its options) is expensive.
- When a second consumer appears, move the code to the new common ancestor in the same change
  and update imports. Don't copy-paste it.
- When the last consumer disappears, move it back down or delete it.

## Components

| Question | Rule |
|---|---|
| One component per file? | Yes for exported components. Small private helpers (a `Row` used only by `Table`) may share the file. |
| File name | PascalCase, equal to the component name: `FindingCard.tsx`. |
| Folder name | Route-local: PascalCase (`_components/FindingCard/`). Shared in DevDigest: kebab-case (`src/components/severity-counts/`). Follow the existing convention of the folder you are in. |
| Entry file | `index.ts` re-exporting the public component(s). Lets the folder grow without changing imports. |
| Sub-components | Private ones go in the component folder or its own `_components/`. Keep nesting to ~2 levels; deeper means the sub-tree deserves promotion. |
| Base primitives | Never re-implement Button/Badge/Modal per feature — use or extend the design system. |
| Composition | Prefer `children` / slot props and compound components (`Tabs`, `Tabs.Panel`) over long boolean-prop lists. |

Route-local vs shared:
- Route-local (`app/<route>/_components/`): knows about that route's data shape and URLs.
- Shared (`src/components/`): takes data via props, has no knowledge of a particular route.
  If a "shared" component reads route params, it is really route-local.

## Constants

| Kind | Where |
|---|---|
| Lookup tables, colour maps, limits used by one component | `<Name>/constants.ts` |
| Values used across one route's components | `app/<route>/constants.ts` |
| App-wide domain constants (e.g. feature → model table) | a named module in `src/lib/` (`feature-models.ts`) |
| Environment / runtime config | one config module that reads `process.env` — nothing else reads env |
| UI text | i18n messages, not constants |
| Contract enums (severity, status) | shared contracts package; don't redefine locally |

Rules:
- `SCREAMING_SNAKE_CASE` for true constants, `as const` for literal tables.
- A constant used only inside one function can stay a local `const` at the top of the file.
- No global `constants/` folder with one file per topic — that's grouping by technical type,
  which scatters a feature over the tree.

## helpers vs utils vs lib

| Name | What it means | Example |
|---|---|---|
| `helpers.ts` (colocated) | Pure functions **specific to one component/route/feature**. No React, no I/O. | `lineLabel(finding)` in `FindingCard/helpers.ts` |
| `src/lib/<topic>.ts` | App-wide modules with a clear topic: domain functions, formatting, URL builders, API client, providers, contexts. | `format-cost.ts`, `github-urls.ts`, `api.ts` |
| `utils` | Generic, domain-free helpers (array, string, date). Only if the project already has it — prefer a topic-named module in `lib/`. | `lib/dates.ts` rather than `utils/index.ts` |

Rules:
- Name files by topic (`format-cost.ts`), never `utils.ts` / `misc.ts` at app level.
- A helper that needs React state or effects is a **hook**, not a helper.
- A helper that performs I/O belongs to the API layer.
- Wrappers that configure a third-party library (query client, markdown renderer, analytics)
  live in `src/lib/` so the rest of the app depends on your wrapper, not the vendor.

## Types

- Props types: inside the component file, next to the component (`type FindingCardProps`).
- Types shared by several files of one route/feature: `types.ts` at that level.
- App-wide view-model types: `src/lib/types.ts` (or per-domain files).
- API / contract types: import from the shared contracts package; derive view types from them
  (`Pick<FindingRecord, ...>`) instead of redeclaring.
- No root `types/` folder with one file per entity.

## Hooks

| Hook | Where |
|---|---|
| Server-state (React Query) over the API | `src/lib/hooks/<domain>.ts` |
| Reusable UI behaviour (`useDisclosure`, `useClickOutside`) | `src/lib/hooks/` once 2+ consumers |
| Hook used by one component | component file, or `<Name>/hooks/useX.ts` if it is large |
| Context provider + hook | one module in `src/lib/` (`repo-context.tsx`) exporting `Provider` and `useX` |

## Tests and styles

- Tests sit next to the code: `FindingCard.test.tsx`, `format-cost.test.ts`.
- Test pure helpers directly; test components through behaviour.
- Styles follow the project convention (DevDigest: `styles.ts` exporting `s`). Keep them in the
  component folder; shared tokens come from the design system.

## When to introduce feature folders

DevDigest groups by **route** (`app/<route>/_components`) plus shared `src/components` and
`src/lib`. That scales well while features map 1:1 to routes.

Consider a `src/features/<domain>/` layer (Bulletproof React, Feature-Sliced Design) only when:
- one domain (e.g. reviews) is used by several unrelated routes **and**
- its components, hooks, helpers and types would otherwise be scattered across `src/components`
  and `src/lib`.

Feature folder shape: `components/`, `hooks/`, `api.ts`, `helpers.ts`, `types.ts`, `index.ts`
(public API). Features don't import each other; compose them in the route. Introduce this as a
deliberate, discussed change — don't create it for a single component.
