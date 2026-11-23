# Imports and boundaries

Contents: [Dependency direction](#dependency-direction) · [Public API and barrels](#public-api-and-barrels) · [Aliases](#aliases) · [Cross-feature rules](#cross-feature-rules) · [Enforcing with lint](#enforcing-with-lint) · [Scaling path](#scaling-path)

## Dependency direction

Imports point **one way**, toward more general, more stable code: [R2][F1]

```
app (routes)  →  route/feature components  →  src/components (shared UI)  →  src/lib  →  vendor
```

- A lower layer never imports from a higher one (`lib` must not import a route component; shared `components` must not import from `app/`).
- Siblings don't import each other's internals. If two route folders need the same thing, it **moves down** a layer (to `src/components` or `src/lib`).
- Why: a one-way graph means a change can only break things *above* it, so the blast radius is knowable, and circular dependencies can't form. [R2][F1]

## Public API and barrels

- Every component folder exposes an `index.ts`; outside code imports the folder (`./FindingCard`), not its files. This lets you reorganize the inside freely. [R3][R8][F1]
- **Keep barrels small and local.** A barrel that re-exports one folder's public surface is cheap and clear.
- **Avoid wide root barrels** (`src/components/index.ts` re-exporting 80 things). They make every import pull the whole graph in tooling, hide who depends on what, and are a classic source of import cycles. Bulletproof React advises against barrel files for this reason; Next.js ships `optimizePackageImports` precisely because large barrels (esp. in libraries) slow dev and builds. [R2][B1][N4]
- The honest middle: **per-folder `index.ts` yes; sprawling aggregation barrels no.** One deliberate exception is acceptable when it is the project's documented single entry point (e.g. a `hooks/index.ts` that mirrors domain modules) — but new code may also import the domain module directly.
- Prefer **named exports**; avoid default exports except where the framework requires them (`page.tsx`, `layout.tsx`). Named exports rename safely and grep cleanly. [G1]

## Aliases

- Use the project alias (`@/…`) for anything outside the current feature; use `./` for the same folder. Avoid `../../../../` chains — they break when files move and obscure which layer you're touching. [R5]
- Don't mix styles in one file (`@/lib/api` next to `../../../../../lib/hooks`); pick the alias.
- Aliases to vendored packages (`@devdigest/shared`, `@devdigest/ui`) are the only way to reach them — never deep-import into their folders.

## Cross-feature rules

1. A feature/route may import **down** (shared components, lib, vendor), never **sideways** into another feature's internals, never **up**. [R2]
2. To share between features, compose them at a **higher level** (the page) or extract the shared part **downward**. [R2][R3]
3. Shared code must not know about any specific feature (no `if (feature === "x")` in `src/lib`). [F1]
4. Server-only modules (`server-only`) can only be imported by server code; the build enforces it. [N3]

## Enforcing with lint

Rules that only live in prose erode. Pick the lightest tool that works: [L1][L2]

- **`import/no-restricted-paths`** — a few `zones` (`target`/`from`) expressing "shared must not import features", "features must not import `app`". Good first step; a handful of lines. [L2][R2]
- **`eslint-plugin-boundaries`** — classify files into element types (`route`, `component`, `lib`, `vendor`) and declare which may import which. Better when you have many layers. Read the current docs/migration guide before configuring — the config format changed between major versions. [L1]
- **Steiger** — only if you adopt Feature-Sliced Design wholesale; it lints FSD conformance (beta). [S1][F1]

Add enforcement **after** the team agrees on the structure, and start with warnings if the codebase already has violations. (Introducing lint config is a project decision — propose it, don't add it unasked.)

## Scaling path

Grow only when the current shape hurts: [R3][F1]

1. Few files → flat folder.
2. Components multiply → **folder per component** with `index.ts`.
3. Routes/features multiply → **feature or route folders** that own their components, hooks, helpers, constants.
4. Many features with shared concepts → shared layers (`components`, `lib`) with enforced direction.
5. Large/long-lived/multi-team → consider **FSD-style layers/slices/segments** and a linter. Don't start here. [F1]

Signals it's time to step up: files are hard to find, a change touches many unrelated folders, two features keep importing each other, or reviewers repeatedly ask "where should this go?".
