# Migrating legacy code — "fix on touch"

Policy (2026-10-18): new code strict; legacy moves toward the target **only in
code you are already changing**. No big-bang rewrites, no drive-by refactors.
Each step should keep tests green and shrink the baseline a little.

## Known legacy shapes (from the 2026-10-18 baseline)

| Smell | Where | Target |
|-------|-------|--------|
| Service takes `Container` (service locator) | `agents`, `repos`, `reviews`, `repo-intel` services | `constructor(deps: XDeps)` + `compose.ts` |
| Service does `new XRepository(container.db)` | same | injected `XStore` port |
| Drizzle in routes | `pulls`, `workspace`, `settings`, `polling` routes; `settings/feature-models.ts` | repository method + service |
| Row types in application code | `reviews/service.ts`, `run-executor.ts`, `diff-loader.ts`, `repos/helpers.ts` | read models in `ports.ts` |
| Modules import concrete adapters / pure helpers from `src/adapters` | `reviews/diff-loader.ts` (`diff-parser`), `repo-intel/**` (`extract`, `astgrep`, `tokenizer`) | port via container, or move the pure helper out of `adapters/` |
| Adapters import a module | `adapters/{astgrep,depgraph}` → `repo-intel/constants.ts` | move constants next to the port |
| `AppError` with HTTP status thrown from services | everywhere | domain error with `code`; map at the route |

## Recipes

**Service locator → explicit deps** (smallest useful step)

1. Add `export interface XDeps { … }` listing only what the service actually
   uses (`store`, `jobs`, `git`, `secrets`…).
2. Change the constructor to `constructor(private deps: XDeps)`; replace
   `this.container.jobs` with `this.deps.jobs`, etc.
3. Create `compose.ts` with `createXService(c: Container)`; update `routes.ts`
   (and the container getter, if the service is exposed there).
4. Declare the store interface in `ports.ts`, `implements` it in the repository.
5. `pnpm arch:check`, tests, then `pnpm arch:baseline` to drop the fixed entries.

**Drizzle in a route → repository**

1. Move the query verbatim into a repository method (create `repository.ts` if
   the module has none), scoped by `workspaceId`.
2. Add a service method the route calls; the route keeps only parse → call → map.
3. Return a read model; map to DTO in `helpers.ts`.

**Row type leaking → read model**

1. Define `XRecord` in `ports.ts` with the fields the caller uses.
2. Add `toRecord(row)` in the repository; return it from the touched method.
3. Change the DTO mapper to take `XRecord`.

## Don'ts

- Don't convert a module you're not otherwise changing.
- Don't add `domain.ts` to CRUD modules during migration.
- Don't change public HTTP contracts as part of an architectural refactor —
  keep the wire shape identical and prove it with existing route tests.
- Don't regenerate the baseline unless it got **smaller**.
