# server (`@devdigest/api`) — agent notes

Fastify 5 API + Drizzle/Postgres on :3001. **pnpm**.

Stack: TypeScript 5.7 (ESM) · Fastify 5 + cors/helmet/rate-limit, fastify-type-provider-zod,
fastify-sse-v2 · Drizzle ORM 0.38 + postgres 3 (Postgres 16 + pgvector) · Zod 3 · openai 4 ·
@anthropic-ai/sdk · octokit 4 · simple-git · @ast-grep/napi · p-queue · Vitest 2 + Testcontainers.

## Commands

```sh
pnpm dev                                          # tsx watch, :3001
pnpm typecheck && pnpm test                       # test = unit + DB-backed
pnpm exec vitest run --exclude '**/*.it.test.ts'  # hermetic units only
pnpm exec vitest run .it.test                     # DB-backed only (Docker)
pnpm db:generate && pnpm db:migrate               # schema change → migration → apply
pnpm db:seed                                      # idempotent demo data
```

## Conventions

- A feature is `src/modules/<name>/routes.ts` (default-exported plugin) plus
  service/repository, registered **statically** in `src/modules/index.ts` — no
  autoload.
- Routes opt in with `withTypeProvider<ZodTypeProvider>()` and take schemas from
  `@devdigest/shared`. Don't hand-parse `req.body`.
- Every handler gets `workspaceId` from `getContext(container, req)`
  (`src/modules/_shared/context.ts`).
- Take another module's repository from the container; don't import it from that
  module's folder.
- External I/O goes through adapters in `src/platform/container.ts`; tests swap
  them via `ContainerOverrides` + `src/adapters/mocks.ts`.
- Throw `AppError` subclasses (`src/platform/errors.ts`). Validation errors are
  **422**; every error body is `{ error: { code, message, details } }`.
- New table: add it in `src/db/schema/*.ts` **and** to the `schema` object in
  `src/db/schema.ts`, then `pnpm db:generate`.
- Secrets only via `src/adapters/secrets/local.ts`: `~/.devdigest/secrets.json`
  wins over env and is cached until restart.
- A test that imports `test/helpers/pg.ts` must be named `*.it.test.ts`. Reviews
  are fire-and-forget — `await waitForPrRuns(…)` before asserting.

## Naming

- Modules: `src/modules/<kebab>/` with fixed names `routes.ts` · `service.ts` · `repository.ts`;
  extra files kebab-case (`run-executor.ts`), per-entity repos `repository/<entity>.repo.ts`;
  cross-module code in `src/modules/_shared/`.
- DB: one schema file per domain, `src/db/schema/<kebab>.ts`; Drizzle table vars camelCase
  plural, SQL snake_case (`agentRuns = pgTable('agent_runs')`, `workspaceId: uuid('workspace_id')`).
- Routes: plural resources + `:id`, kebab multi-word segments, actions as a sub-path
  (`/repos/:id/pulls`, `/repos/:id/index-state`, `/runs/:id/cancel`).
- Errors `<Name>Error extends AppError` (`NotFoundError`, `ConfigError`). Tests
  `test/<kebab>.test.ts`, DB-backed `*.it.test.ts`. Migrations `NNNN_<name>.sql` are generated.

## Gotchas

- Boots with no API keys; a missing key surfaces on first use as a 500
  `config_error`.
- On boot every `running` agent run is marked `failed` (single-instance assumption).
- Many tables have no writer yet — pre-staged for later lessons, not bugs.

## Do not touch

(Root `CLAUDE.md` covers `clones/`, `vendor/`, migrations, lockfile, `.env`.)

- `src/modules/repo-intel/` internals — build on the `repoIntel.*` facade.

## Read when

- Read [`INSIGHTS.md`](INSIGHTS.md) before starting; append what you learned at
  the end.
- Write to `INSIGHTS.md` only through the `engineering-insights` skill — it
  appends and never edits existing entries.
- Read [`specs/`](specs/README.md) before implementing a feature or endpoint.
- Read [`docs/`](docs/README.md) before changing the run lifecycle, DI or secrets.
- Read [`README.md`](README.md) (API map, DI flow, env) when adding or changing a route.
- Read [`src/modules/repo-intel/README.md`](src/modules/repo-intel/README.md) when
  touching indexing or the repo map.
- Read [`src/modules/repo-intel/INSIGHTS.md`](src/modules/repo-intel/INSIGHTS.md)
  before touching indexing or the repo map; repo-intel findings go there.
- Read [`../TESTING.md`](../TESTING.md) before adding a test.
- Read [`../reviewer-core/README.md`](../reviewer-core/README.md) when changing
  how a review run is executed.
