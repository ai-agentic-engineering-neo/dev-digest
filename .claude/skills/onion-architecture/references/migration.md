# Migrating a legacy module

Most of `server/src/modules/*` predates this skill. Migrate **one module per PR**, behaviour-
identical, with existing tests green before and after. Don't mix a migration with feature work.

## Inventory (grep, 2026-11-24)

| Violation | Files |
|---|---|
| Service/helper takes the whole `Container` | `repos/service.ts`, `reviews/service.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repo-intel/service.ts`, `repo-intel/pipeline/{full,incremental}.ts`, `_shared/context.ts` |
| Service constructs its own Drizzle repo (`new XRepository(container.db)`) | `repos/service.ts:33`, `repo-intel/service.ts:105`, `reviews/service.ts:34` |
| Drizzle / `db/schema` outside a repository | `repos/helpers.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `_shared/schemas.ts` |
| Cross-module import | `repos/service.ts` → `../repo-intel/constants.js` |
| Adapter depends on a feature module | `adapters/depgraph/index.ts`, `adapters/astgrep/index.ts` → `modules/repo-intel/constants.ts` (move `SUPPORTED_EXT` etc. to `_shared` or pass it in) |
| Import cycles via the Container | `platform/container.ts` ⇄ `repo-intel/service.ts`, `pipeline/{full,incremental}.ts` |
| HTTP status inside domain errors | `platform/errors.ts` (`AppError.statusCode`) |
| Composition outside the root | `app.ts:82` `new ReviewService(container).reapStaleRuns()` (acceptable — `app.ts` is the root — but must use the new constructor) |

The authoritative, always-current list is the baseline itself — print it with:
```bash
cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --no-ignore-known --output-type err
```

## Order

1. **agents** — pilot, **done 2026-11-24**: `domain/ application/ infrastructure/ http/` + `index.ts`; UoW (`_shared/domain/unit-of-work.ts`, `DrizzleAgentsUnitOfWork`), `DomainError` + `DOMAIN_STATUS` in `platform/errors.ts`. Use it as the reference module. Leftover: `reviews` still types agents as `AgentRow` (works because the domain `Agent` mirrors the row) — switch it to the `AgentsRepository` port when `reviews` migrates.
2. **settings**, **workspace**, **polling**, **pulls** — **done 2026-11-24**. Shared kernel grew: `RepoNotFound`, `DomainError.details`, `Logger` port (`_shared/domain/`). Patterns worth copying: a single-aggregate atomic write may run `db.transaction` inside the repository method (`recordPoll`, `storeDetail`, settings `upsert`) — use a UoW only when a use case spans several repository calls; jsonb is parsed in infrastructure (`settings` `featureModelOverride`); secrets/SDK probes become small ports adapted in `index.ts` (`settings`).
3. **repos** — also fix the cross-module import (move the shared constant to `_shared/` or behind a `RepoIntel` port).
4. **repo-intel** — already has a facade interface (`types.ts` `RepoIntel`); pipeline files take `Container` → pass narrow deps.
5. **reviews** — last: `run-executor` is the most coupled (LLM, git, RunBus, DB, pricing).
6. `platform/errors.ts` — once no module relies on `AppError.statusCode` from inner code, keep `AppError` for delivery only.

## Steps for one module

1. **Read** its routes, service, repository, helpers, tests. List use cases (one per route-intent).
2. **Domain**: create `domain/types.ts` (camelCase domain types, `import type` vocab from shared),
   `domain/errors.ts` (`XNotFound` etc.), move pure rules from `helpers.ts`/repository into
   `domain/policies.ts`. Unit-test policies.
3. **Ports**: `domain/ports.ts` with the repository interface the use cases need (domain types in/out).
4. **Infrastructure**: move the Drizzle repository to `infrastructure/`, make it `implements` the
   port, return domain types via `infrastructure/mappers.ts`. Strip business decisions out.
   Add a UoW where a use case writes more than once.
5. **Application**: rewrite the service to take `XDeps` (ports + factories); throw domain errors
   instead of returning `undefined` for "not found". Unit-test it with in-memory fakes.
6. **HTTP**: move `routes.ts` to `http/`, add `presenter.ts` (domain → contract; reuse the old
   `toXDto` logic) and command mapping; routes take `{ service, auth }` via plugin options.
7. **Wiring**: `index.ts` factory builds the service from `app.container`; `modules/index.ts`
   imports `./<f>/index.js` instead of `./<f>/routes.js`; container getters become port-typed.
   Note `repo-intel/index.ts` already exists as a facade export — merge carefully, don't overwrite.
8. **Errors**: add the new codes to the domain-code → status table; check responses are unchanged
   (same status, same `{ error: { code, message } }` body) — the client depends on them.
9. **Verify**: `pnpm typecheck`, unit tests, the module's `*.it.test.ts`. The architecture test
   will now fail with "baseline entries no longer occur" — that's expected: shrink the baseline with
   `pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs` and check its diff only
   **removes** lines. Any added line means the refactor introduced a violation.
10. Update `server/README.md` ("API map", "Request & DI flow") if wiring changed.

## Pitfalls

- **Contract drift.** Presenters must reproduce today's DTOs byte-for-byte (snake_case keys,
  `null` vs missing, ISO dates). Snapshot a few responses before refactoring.
- **Silent 404 → 500.** When replacing `return undefined` + route `NotFoundError` with a domain
  error, make sure the code is mapped, or the handler falls through to 500.
- **Shared repositories.** `container.agentsRepo` / `container.reviewRepo` are used by other
  modules (e.g. reviews reads agents). Change their type to the port and update consumers in
  the same PR, or keep a temporary adapter.
- **Scope creep.** Don't redesign tables or contracts during a migration; that's a separate change.
