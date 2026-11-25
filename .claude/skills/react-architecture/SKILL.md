---
name: react-architecture
description: "React/frontend architecture and code-organization rules: where components, hooks, constants, helpers, utils, types and business logic live; how to break components down; feature folders vs shared code; dependency direction and import boundaries; barrel files; Next.js App Router colocation. Use when creating new components or files, deciding where code should go, splitting a large component, extracting logic out of JSX, reviewing a PR's structure, or refactoring folder layout. Trigger terms: folder structure, file structure, where should this go, colocation, feature folder, extract component, split component, business logic, constants, utils, helpers, lib, custom hook placement, barrel file, index.ts, project structure, _components."
---

# React Architecture & Code Organization

Rules for **where code goes** and **how it's broken down**. Each rule cites its source by ID; see [references.md](references.md). For worked trees and before/after code, see [examples.md](examples.md).

Related skills (don't duplicate them): `react-best-practices` covers hook misuse, derived state, memoization and anti-patterns. `next-best-practices` covers RSC boundaries, data fetching and file conventions.

**Severity:** CRITICAL = causes coupling or bugs that are expensive to undo · HIGH = hurts scaling or maintainability soon · MEDIUM = consistency and readability.

---

## 1. Guiding principles

1. **Colocate first.** "Place code as close to where it's relevant as possible." Tests, styles, helpers, constants and types start next to their only consumer [K1, R7].
2. **Promote on real reuse, not anticipated reuse.** Move code to a shared location when a *second* consumer appears in a different feature. Abstract only once the shape is clear, usually by the third use: "prefer duplication over the wrong abstraction" [K3, W1, J1].
3. **Structure should reveal the domain.** A reader should see `reviews/`, `agents/`, `settings/`, not `containers/` and `components/` [P1, A1].
4. **Consistency beats the "perfect" layout.** React and Next.js are unopinionated. Pick a convention, write it down and follow it. Don't spend long debating it [R7, N1, J1].
5. **Separate view from non-view logic.** Components render. Hooks orchestrate state and effects. Plain functions compute [MF1].

## 2. Project structure (HIGH)

- **Organize by feature/route, with a small shared layer** [B1, W1, P1, A1]:
  ```
  src/
    app/ (or pages/)   routing + composition only — thin
    features/<domain>/ (or route-colocated _components/)
    components/        shared, domain-agnostic UI
    hooks/             shared hooks (≥2 features)
    lib/               configured 3rd-party wrappers: api client, query client, i18n
    utils/             generic pure functions
    config/            env-derived settings
    types/             cross-feature types only
  ```
- Inside a feature, create only the segments you need: `components/`, `hooks/`, `api/`, `utils|helpers`, `constants`, `types` [B1].
- **Grow incrementally.** Single file → files → folder per component → feature folders [W1]. Reach for Feature-Sliced Design layers (`entities`, `features`, `widgets`…) only for large multi-team apps [F1, F2].
- **Keep nesting shallow**, at most 3–4 folder levels below `src/` per feature [R7, W1]. Deeper nesting is a sign that a sub-feature should be promoted.
- Don't create global `contexts/` or `hooks/` dumping grounds. A hook or context used by one feature lives in that feature [P1, W1].

## 3. Dependency direction & boundaries (CRITICAL)

- **One-way flow: shared → features → app** [B1, W1, F1].
  - Shared code (`components/`, `hooks/`, `lib/`, `utils/`, `types/`) must not import from features or app.
  - Features must not import from app/routes.
- **No cross-feature imports.** If feature A needs feature B's piece, either compose both at the page/app layer, or promote the piece to shared [B1, W1].
- **Shared UI is domain-agnostic.** A component that knows about `Review` or `Agent` is a feature component, even if it's reused.
- **Enforce with lint, not memory:** `import/no-restricted-paths` zones [B1, E2] or `eslint-plugin-boundaries` [E1]; `import/no-cycle` [T3].
- Litmus test: you can delete a feature folder and only the page that composes it breaks [W1].

## 4. Components: placement and breakdown (HIGH)

**Placement**
- A component used by one parent lives next to that parent (nested `_components/` or a sibling file). It moves to shared `components/` only when it's domain-agnostic **and** used in ≥2 features [K1, W1].
- One exported component per file. The filename matches the component (PascalCase). Small private sub-components in the same file are fine [AB1].

**When to split**: split by *responsibility*, not line count [A1, R1]:
- It has more than one reason to change (e.g. it fetches, transforms **and** renders).
- A chunk of JSX has a nameable concept (`<FindingSummary>`, `<EmptyState>`).
- The component takes more than ~5 props, or props travel through without being used [A1].
- There are nested ternaries or a complex `.map()` body. Extract the item into a component [A1].
- One part re-renders often (input, timer) while the rest is static. Extract the volatile part so its state stays local [K2].

**When NOT to split**
- To hit an arbitrary LOC number. Small, cohesive components can stay together [MF1, A1].
- To make a one-use "generic" wrapper with a dozen config props. Prefer composition: `children`, slots, compound components [K5, K6, PD1].

**Composition patterns**
- `children` and slot props instead of prop drilling.
- Compound components (`<Tabs><Tabs.List/>…`) for related parts that share implicit state [K6, PD1].
- Headless hook + thin view when the same behavior needs different UIs [MF2].

## 5. Business logic placement (CRITICAL)

Three layers, from the outside in [MF1, MF2]:

| Layer | Contains | Lives in | Knows React? |
|-------|----------|----------|--------------|
| **View** | JSX, event wiring, conditional rendering | `Component.tsx` | yes |
| **Orchestration** | state, effects, data hooks, handlers that coordinate | custom hook `useX.ts` (colocated) or `lib/hooks/<domain>.ts` | yes |
| **Domain / pure logic** | calculations, mapping API → view shape, validation, sorting/filtering, formatting, business rules | `helpers.ts` / `utils.ts` / `model.ts` | **no** |

Rules:
- **Fetching + reshaping data inside a component body is a smell.** Move the fetch to a hook and the reshaping to a pure function [MF1].
- **Business rules are pure functions** that take data and return data, with no React imports. This makes them unit-testable without rendering [MF1, A1].
- **Functions that don't close over props/state go outside the component body** [A1].
- A custom hook shares *stateful logic*, not state. Use the `use` prefix only when it calls hooks [R4].
- Don't introduce container/presentational wrapper pairs. A hook gives the same separation without the extra component [DA1, PD2, A1].
- Branching variant rules (per country, per provider, per severity) that repeat across files belong in a strategy map or domain object, not scattered `if`s [MF1].
- Render must stay pure, with no side effects during render [R2, R5].

## 6. State & data placement (HIGH)

- **Server state lives in the query layer** (TanStack Query / SWR), not copied into `useState` or a store [T1, A1].
- Group query definitions per domain. Prefer `queryOptions()` factories (`reviewQueries.detail(id)`) once a query is used outside a hook (prefetch, `getQueryData`, invalidation) [T2].
- **Client state is colocated.** Keep it in the component that uses it, push it into the child, or lift it only to the nearest common parent. Keep providers as low as possible [K2].
- **Derive, don't sync.** If it can be computed from props, state or query data, compute it during render [K4, R3, T4].
- Keep state minimal, flat and non-redundant [R1, R6].
- Context is for dependency injection and low-frequency values (theme, current repo), not a global store. See `react-best-practices`.

## 7. Constants (MEDIUM)

- **Scope a constant like a variable**, at the narrowest level that covers its users [K1, W1]:
  1. Used by one component → module-level `const` at the top of that file (outside the component) [A1].
  2. Used by several files in one component folder or feature → `constants.ts` in that folder.
  3. Used across features → shared `constants/` or `config/`.
- **Env- and deployment-derived values** (API base URL, feature flags) go in `config/` (or `lib/`), read once, typed [B1].
- Use `as const` for literal unions. Derive types from constants (`type Tab = typeof TABS[number]`) instead of duplicating them.
- **No magic numbers or strings in JSX or logic.** Name them.
- **User-facing copy is not a constant.** It goes in i18n message files.
- Static config that drives markup (tab lists, column definitions) is a module-level constant array mapped in JSX [A1].

## 8. Helpers vs utils vs lib (MEDIUM)

| Folder/file | What goes there | Test |
|-------------|-----------------|------|
| `helpers.ts` (colocated) | Project/feature-specific pure functions (format a finding, group runs by status) | Knows domain types → helper [J1] |
| `utils/` (shared) | Generic, domain-agnostic pure functions (`clamp`, `groupBy`, date math) | Could be copy-pasted into another project → util [J1, W1] |
| `lib/` | Pre-configured third-party wrappers and app infrastructure (API client, query client, theme, toast) | Wraps a library or holds app wiring [W1, B1] |
| `hooks/` (shared) | Hooks reused by ≥2 features | "Only reusable hooks" go here [W1] |

- A helper starts in the component file, moves to the folder's `helpers.ts` when a sibling needs it, then to the feature or shared level on cross-feature reuse [J1, K1].
- Helpers and utils are **pure and React-free**. If it calls hooks, it's a hook.
- Every non-trivial helper gets a colocated `helpers.test.ts`.
- Don't create a `utils.ts` dumping ground. If a file mixes unrelated concerns, split it by topic (`date.ts`, `severity.ts`).

## 9. Imports, naming & public APIs (MEDIUM)

- Use absolute alias imports (`@/lib/...`) over `../../../` [P1, J1].
- **Barrel files:** a thin per-folder `index.ts` that re-exports a single component is acceptable as the folder's entry point. **Avoid aggregate barrels** (an `index.ts` that `export *`s many modules) in app code. They cause import cycles and slow builds and tests [T3, AT1, B1]. Prefer direct imports for new code.
- Naming: components and component files use `PascalCase`. Hooks use `useCamelCase`. Other modules use `camelCase` or `kebab-case`, whichever the package already uses [AB1, J1]. Folder names must match the export (case-sensitive CI filesystems will break on mismatches) [P1].
- Types: colocate them with the code that owns them. Shared API contracts come from the schema package, not hand-copied interfaces.

## 10. Next.js App Router specifics (HIGH)

- **`page.tsx` is thin.** It reads params and renders one feature component [N1].
- Route-specific UI goes in `_components/` private folders beside the route (excluded from routing) [N1, N2].
- Code shared by several routes moves up to the nearest common route folder's `_components/`, or to `src/components/` if it's domain-agnostic.
- Use route groups `(group)` to share layouts without affecting URLs [N1].
- RSC/client boundaries, `"use client"` placement and data-fetching rules are covered by `next-best-practices`.

## 11. Review checklist

- [ ] New code sits next to its only consumer, or has ≥2 real consumers if shared?
- [ ] No imports from one feature/route folder into a sibling feature?
- [ ] Shared `components/`, `lib/`, `utils/` free of domain or feature imports?
- [ ] Component body free of data reshaping, business rules and fetch calls? (Logic is in a hook or pure helper.)
- [ ] Helpers that don't need closures sit outside the component?
- [ ] Constants named, scoped narrowly and not user-facing copy?
- [ ] No new aggregate barrel files and no import cycles?
- [ ] Components split by responsibility, without one-use "generic" wrappers?
- [ ] Pure helpers have colocated unit tests?

## 12. DevDigest client mapping (`client/`)

The client already follows most of these rules. Match the existing convention:

| Rule | Where it lives in `client/src` |
|------|--------------------------------|
| Thin routes | `app/**/page.tsx` → delegates to one `_components/<Feature>View` |
| Feature colocation | `app/<route>/_components/<Name>/`, nested `_components/` for children only that parent uses |
| Component folder | `<Name>.tsx`, `index.ts` (single re-export), `constants.ts`, `helpers.ts`, `styles.ts`, `<Name>.test.tsx`, `helpers.test.ts`, `fixtures.test-data.ts` |
| Route-level shared helpers/constants | `app/repos/[repoId]/pulls/{helpers,constants}.ts`, shared by that route's components |
| Shared domain-agnostic UI | `components/` (`diff-viewer/`, `app-shell/`, `page-shell/`) and primitives in `vendor/ui` (`@devdigest/ui`) |
| Server state / data hooks | `lib/hooks/<domain>.ts` (TanStack Query), with fetch wrappers in `lib/api.ts` |
| Infrastructure (`lib/`) | `lib/providers.tsx`, `theme.tsx`, `toast.tsx`, `repo-context.tsx` |
| API contracts / types | `@devdigest/shared` (Zod), not hand-written interfaces |
| User-facing strings | `messages/<locale>/` via `next-intl` |

Watch-outs:
- `lib/hooks/index.ts` is an aggregate barrel. In new code, import from the domain file (`@/lib/hooks/reviews`) [T3].
- Don't import between sibling route trees (e.g. `app/agents/**` ↔ `app/repos/**`). Promote the piece to `components/` or `lib/` instead.
- New pure logic goes in the nearest `helpers.ts` with a `helpers.test.ts`, not in the `.tsx`.
