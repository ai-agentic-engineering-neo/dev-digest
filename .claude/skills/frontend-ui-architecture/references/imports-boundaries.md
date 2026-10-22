# Imports and module boundaries

Contents: [Direction](#dependency-direction) · [Public API](#public-api-of-a-folder) ·
[Barrels](#barrel-files) · [Paths](#import-paths) · [Exports](#named-vs-default-exports) ·
[Enforcing](#enforcing-boundaries)

## Dependency direction

```
app/<route>  ──▶  app/<route>/_components  ──▶  src/components  ──▶  src/lib  ──▶  packages
```

- A module may import from its own level or **lower**; never higher (Feature-Sliced Design's
  layer rule).
- Siblings at the same level don't import each other's internals: route A ↛ route B,
  feature A ↛ feature B. Shared code moves down; composition happens up in the route.
- `src/lib` never imports from `src/components` or `app/`. `src/components` never imports from
  `app/`.
- Circular imports are a placement bug — move the shared piece down.

## Public API of a folder

- A component/module folder exposes its public surface via `index.ts`
  (`export { FindingCard } from "./FindingCard";`).
- Outsiders import the folder (`@/components/severity-counts`), not files inside it.
- Files inside the folder import each other relatively (`./helpers`).
- Keep `index.ts` explicit — list exports, avoid `export *` from component folders so the public
  surface is intentional.

## Barrel files

A barrel re-exports many modules from one file. Costs (TkDodo): slower dev server and tests
(importing one thing loads everything), weaker tree-shaking, circular-import risk, "go to
definition" lands on the barrel.

- ✅ One `index.ts` per component/module folder as its entry (small, explicit).
- ⚠️ Domain-level barrels like `src/lib/hooks/index.ts` exist in DevDigest — keep them, but
  importing the specific domain file (`@/lib/hooks/reviews`) is equally valid.
- ❌ No app-wide barrels (`src/components/index.ts`, `src/lib/index.ts`) that re-export
  everything.

## Import paths

- Across folders: the tsconfig path alias (`@/lib/api`, `@/components/app-shell`).
- Within the same component/route folder: relative (`./constants`, `../helpers` at most one up).
- Long relative chains (`../../../../lib/x`) are a smell — replace with the alias.
- Cross-package code: the package alias (`@devdigest/shared`, `@devdigest/ui`), never a relative
  path into another package.

## Named vs default exports

- Named exports for components, hooks, helpers, constants: refactor-safe, consistent import
  names, better auto-import.
- Default exports only where the framework requires them (`page.tsx`, `layout.tsx`,
  `loading.tsx`, `error.tsx`, `not-found.tsx`, `next.config`).

## Enforcing boundaries

When conventions start to drift, encode them:
- `eslint-plugin-boundaries` — element types by folder pattern + allowed dependencies;
  `no-private` blocks imports of another element's internals.
- `no-restricted-imports` (ESLint core) — simple bans like `app/*/_components` from outside.
- `dependency-cruiser` — whole-graph rules and cycle detection in CI.

Add a lint rule only with team agreement; until then, the checklist in `SKILL.md` applies.
