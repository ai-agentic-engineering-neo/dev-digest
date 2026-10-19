# Enforcement — dependency-cruiser

Rules that live only in prose erode. The layer rules are checked mechanically
with dependency-cruiser (already a server dependency).

| File | Purpose |
|------|---------|
| `server/.dependency-cruiser.cjs` | the `forbidden` rules |
| `server/.dependency-cruiser-known-violations.json` | baseline of legacy violations (36 on 2026-10-18) |
| `pnpm arch:check` | `depcruise src --config .dependency-cruiser.cjs --ignore-known --output-type err` |
| `pnpm arch:baseline` | `depcruise-baseline src --config .dependency-cruiser.cjs` |
| CI | `.github/workflows/server-unit.yml` → typecheck job → "Architecture boundaries" |

## Rules

| Rule | Forbids | Skill rule |
|------|---------|------------|
| `domain-is-pure` | `domain.ts`/`domain/**` → db, drizzle, fastify, zod, SDKs, adapters, platform, other modules (own `constants.ts`/`types.ts` OK) | 1, 6 |
| `domain-contracts-type-only` | domain → runtime import of `@devdigest/shared` (type-only OK) | 6 |
| `ports-are-pure` | `ports.ts` → db, fastify, SDKs, adapters, container | 1 |
| `service-no-infrastructure` | `service.ts`/`*.service.ts` → db, drizzle, fastify, SDKs, `src/adapters` | 1, 4, 10 |
| `service-no-container` | service → `platform/container.ts` (even `import type`) | 2 |
| `service-no-concrete-repository` | service → repository/mapper files | 2, 4 |
| `drizzle-only-in-repositories` | any module file except repository/mappers → drizzle, `src/db` | 4 |
| `fastify-only-in-routes` | any module file except `routes.ts`, `_shared/` → fastify packages | 5 |
| `no-cross-module-internals` | module A → module B's repository/service/routes/compose/run-executor | 11 |
| `adapters-know-no-modules` | `src/adapters/**` → modules, container | 10 |
| `modules-no-concrete-adapters` | module files (except `compose.ts`/`index.ts`) → `src/adapters/**` (mocks OK) | 10 |

File-role detection is **by file name** (`service.ts`, `routes.ts`,
`repository.ts`, `*.repo.ts`, `mappers.ts`, `ports.ts`, `domain.ts`,
`compose.ts`) — follow the naming in the module template or the rules can't see
your layers. `tsPreCompilationDeps: true` means type-only imports count.

## Reading a failure

```
error service-no-container: src/modules/notes/service.ts → src/platform/container.ts
```

Fix the dependency, don't silence it: inject the dep through the constructor
and wire it in `compose.ts`. Each rule's `comment` in the config says what to
do instead. `--output-type text` or `dot` helps to see the graph.

## Baseline policy

- `pnpm arch:baseline` is for **after you removed legacy violations** (to shrink
  the file) — commit the smaller baseline in the same PR as the fix.
- Never re-baseline to make a new violation pass. A reviewer should reject a PR
  where the known-violations file grows.
- Baseline entries contain resolved npm paths (e.g.
  `drizzle-orm@0.38.4_postgres@3.4.9`). After bumping such a dependency, old
  violations reappear as "new" — re-baseline in the bump PR, verifying the
  count did not grow.
- To see everything, including baselined: `pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err`.

## Changing the rules

Tighten freely; loosening a rule needs a reason in the PR description and a
matching edit to `SKILL.md`. Rules reference: dependency-cruiser
`doc/rules-reference.md`.
