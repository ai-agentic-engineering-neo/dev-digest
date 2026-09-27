# Module Boundaries

What a module exposes, what may import it, and how to make that mechanical. Sources: `README.md` § Boundaries.

## A module without a public API is not a module

Organization is not modularity. Putting files in a folder groups them; it does not stop anything outside from reaching in. Modularity needs two things: **information hiding** (a declared surface) and **guardrails** (something that fails when the surface is bypassed).

An unenforced boundary is a suggestion, and suggestions lose to deadlines. If a boundary matters, it belongs in CI, not in review comments.

## Barrels (`index.ts`) — contested, and the split is by toolchain

This is a live disagreement, and presenting either side as settled misrepresents the evidence.

**Against, with measurements.** The cost is module-graph size, not bundle size — tree-shaking is a bundler feature, while the cost is paid by the dev server, the test runner and the Node runtime. Removing internal barrels took one Next.js app from ~11,000 to ~3,500 modules per page. Module-graph resolution is superlinear: ~0.3s at 1,000 modules, ~3s at 10,000, ~17s at 25,000 — and **every test worker rebuilds the graph**, so a 100-file suite multiplies it. Barrels also generate circular imports, and `optimizePackageImports` is not a general fix: it bails on any barrel containing a non-re-export statement, it targets packages rather than local files, and it is still flagged experimental.

**For.** A slice's `index.ts` is a contract: it protects consumers from internal refactors and makes an API change visible as an API change. Tooling that bans deep imports needs an entry point to point at. And the 2026 counter-argument is real: much of the measured slowdown was a webpack property, and lazily-walking dev servers (Vite, Turbopack, Rspack) plus symbol-level tracking recover most of it.

**What both sides actually agree on.** Nobody defends a `components/index.ts` re-exporting 200 components. Nobody attacks a five-export `index.ts` on one cohesive module. Even the harshest critic concedes that "having only a handful of barrel files in your code is usually fine" — the problem is when *every folder* has one. The rules below fall out of that agreement:

- One barrel per **cohesive module**, sized to its real API. Past ~20 re-exports, it is not one module.
- Never a barrel over an unrelated collection: no `features/index.ts`, no `hooks/index.ts`, no `utils/index.ts`.
- **Never import through your own barrel from inside the module.** `tab-panel.ts → index.ts → tab-panel.ts` is the cycle generator, and it is the single most common source of circular imports in feature-based code.
- Never `export *`. It hides what the module exposes, defeats dead-export detection, and disables import optimization.
- Never `import * as X` from a barrel — it forces full module evaluation and kills every optimization.
- Keep barrels **pure re-exports**. Bundlers still mis-chunk a barrel that mixes inline exports with re-exports.

If you need the decision for a specific repo, measure two numbers: modules-per-page in the dev server, and test-suite startup time. They settle it faster than the argument does.

## Cross-feature imports

The moment `features/a` imports `features/b`, neither can be deleted, tested or reasoned about independently, and "feature" quietly degrades into a naming convention.

Two escape hatches, both of which preserve the direction:

**1. Compose one layer up.** The route imports both and wires them with props and callbacks. Don't write `getPostWithComments`; keep `getPost` and `getComments` in their own features, pass the id down, and let the page orchestrate — `Promise.all` at the composition point.

**2. Lift the shared part down a layer.** Move what both genuinely need into the shared tier. Shared must not import back up.

Treat a *wanted* cross-feature import as a diagnosis, not a problem: either a shared module is missing, or the composition point is at the wrong level.

The only well-specified sibling escape hatch in the literature is FSD's `@x` notation, deliberately scoped to the Entities layer (`entities/a/@x/b.ts`, readable as "a crossed with b"), and even FSD says to minimize it.

## Imports: relative inside, absolute across

- **Relative, with full paths, inside a module.** Keeps the module movable — copy the folder elsewhere and imports still resolve — and makes an accidental import through your own barrel visually obvious.
- **Absolute aliases across modules.** Survives file moves, makes the layer legible at the import site (`@/shared/…` vs `@/features/…`), and — the reason that matters most — **gives boundary lint rules a stable string to match**.

Two mechanical traps:

- TypeScript's `paths` does **not** rewrite imports at emit. The bundler or runtime must implement the same mapping independently; mismatched config is a leading cause of "works in the IDE, fails at build".
- `import/no-restricted-paths` matches the **resolved file path**, not the literal import string. Your globs must describe the filesystem, not what people type.

## Enforcement

Pick by how much machinery the repo can carry:

| Tool | Model | Fits |
|---|---|---|
| `import/no-restricted-paths` | `zones: [{ target, from, except }]` | single repo, zero extra deps — the usual starting point |
| `import/no-internal-modules` | allow/forbid globs | "import only from the entry point" |
| `eslint-plugin-boundaries` | element types + `boundaries/dependencies` | richer layer taxonomies |
| Sheriff | module = folder with `index.ts` or `internal/`; tags + rules | Nx-style rules without Nx |
| `@nx/enforce-module-boundaries` | project tags + `depConstraints` | monorepos already on Nx |
| dependency-cruiser | graph rules, severity, visual output | cycles, orphans, CI reporting — what ESLint cannot see |

Note `boundaries/entry-point` and `boundaries/external` are deprecated in favour of `boundaries/dependencies`.

Minimum viable setup for the default architecture: restrict `shared → features`, restrict `features → features`, restrict everything `→ app/routes`, and add cycle detection.

## Circular dependencies

- Detect in lint with `import/no-cycle`. It is computationally expensive by its own documentation, and barrels multiply that cost — cap it with `maxDepth` if it hurts.
- Detect in CI with dependency-cruiser's `no-circular`, or `madge --circular`. `dpdm` handles path aliases and `import type` better out of the box.
- Prevent rather than detect: enforce a layer direction, keep barrels pure, never import your own directory's `index.ts`, and convert type-only edges to `import type`.

Barrels also *hide dead code*: a re-export always looks like a use from a per-file lint's perspective. Whole-graph unused-export detection (Knip) is what finds it.

## The second, orthogonal boundary in Next.js

`'use client'` is a boundary in the **module graph**, not a folder and not the render tree. It is independent of your feature boundaries and can cut straight across them.

- `import 'server-only'` turns an accidental server→client import into a **build error**. `client-only` does the reverse. This is the only mechanical enforcement of the boundary — types will not do it.
- Signal environment by **file naming**, not folders: `lib/stripe/client.ts` and `lib/stripe/server.ts`.
- **Never** partition by environment with route groups. `(client)/` and `(server)/` do not stop anything being routable — a `page.tsx` inside either is a live URL.

Details in [app-router.md](app-router.md).
