# server — patterns

## 1. Add an endpoint to an existing module
1. Contract first: add or extend the Zod schema in `src/vendor/shared/contracts/<domain>.ts`, then copy the same
   change into `client/src/vendor/shared/contracts/<domain>.ts` (two copies, see `INSIGHTS.md`).
2. In `src/modules/<name>/routes.ts` register on `appBase.withTypeProvider<ZodTypeProvider>()` with
   `schema: { params, body }`. Reuse `IdParams` from `src/modules/_shared/schemas.ts` for uuid ids.
   Example: `src/modules/agents/routes.ts` (`POST /agents`, `PUT /agents/:id`). Expensive routes add
   `config: { rateLimit: { max, timeWindow } }` as `POST /pulls/:id/review` does in `src/modules/reviews/routes.ts`.
3. Resolve tenancy with `await getContext(container, req)` (`src/modules/_shared/context.ts`) and pass
   `workspaceId` into the service. Never query without it.
4. Business logic in `service.ts`; SQL in `repository.ts` (Drizzle over `src/db/schema.ts`). Pure computations
   go into a `<noun>.ts` next to the route (`src/modules/pulls/cost.ts`) so they get a hermetic unit test.
5. Errors: throw `NotFoundError` / `AppError` from `src/platform/errors.ts`; the handler in `src/app.ts` maps them.
6. Tests: hermetic `test/<noun>.test.ts` for the helper; `test/<module>.it.test.ts` for the route against Postgres
   (`startPg` + `buildApp({ db, overrides })`, pattern in `test/reviews.it.test.ts`). Extend `src/db/seed.ts` if e2e needs data.
7. Gate: `pnpm lint` → `pnpm typecheck` → unit and integration lanes (`CLAUDE.md`).

## 2. Add a new module (a lesson feature)
1. Write `specs/NNN-<feature>.md` from the template in `specs/README.md`.
2. Create `src/modules/<kebab-name>/routes.ts` exporting a default `FastifyPluginAsync`; add `service.ts`,
   `repository.ts` as needed. Smallest example: `src/modules/workspace/routes.ts`.
3. Add one import + one key in `src/modules/index.ts`. There is no filesystem autoload.
4. Need another module's data? Use the shared repositories on the container (`container.agentsRepo`,
   `container.reviewRepo`) or the `repoIntel` facade, not another module's folder.
5. Need a new external dependency (API, binary)? Define the interface in `src/vendor/shared/adapters.ts`, implement
   under `src/adapters/<port>/`, expose it as a lazy getter on `src/platform/container.ts` with an entry in
   `ContainerOverrides`, and add a mock to `src/adapters/mocks.ts`.
6. Prompt context for reviews goes through `run-executor.ts` as a resolved string into a reviewer-core slot
   (`reviewer-core/docs/patterns.md` §1), not by editing the prompt on the server.

## 3. Add a DB column and migration
1. Edit the table in `src/db/schema/<domain>.ts` (Drizzle `camelCase` → SQL `snake_case`, e.g. `costUsd: doublePrecision('cost_usd')` in `schema/runs.ts`).
2. Run `pnpm db:generate`; commit the generated `src/db/migrations/NNNN_<name>.sql` and `meta/` as-is. Never rename or hand-edit existing migrations.
3. Apply locally with `pnpm db:migrate` (not automatic on boot). Integration tests migrate themselves via `test/helpers/pg.ts`.
4. Thread the field: repository write (`src/modules/reviews/repository/run.repo.ts` `completeAgentRun`), DTO in the contract, route response.
   Make the contract field `.nullable()`/`.nullish()` when legacy rows or old jsonb traces will lack it (`RunStats.cost_usd`).
5. If e2e or the client needs the value, add it to `src/db/seed.ts`. Note: the PR #482 fixtures are created only on a
   fresh DB (`seed.ts`, `if (!pr)` branch), so use `../scripts/e2e.sh` to see them.
6. Worked example across all steps: `specs/001-run-cost.md`.
