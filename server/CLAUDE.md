# server — @devdigest/api

Before changing this package read `docs/README.md`.
Feature contracts: `specs/` (one file per feature).

Fastify 5 · Drizzle ORM 0.38 · postgres.js · pgvector (pg16) · Zod 3 + fastify-type-provider-zod · vitest 2

## Commands (pnpm)
- `pnpm dev` (:3001) · `pnpm lint` (ESLint 9 flat, `eslint.config.mjs`) · `pnpm typecheck` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker, testcontainers): `pnpm exec vitest run .it.test`

## Map
- `src/app.ts` buildApp (plugins → container → modules) · `src/platform/` DI, config, SSE, jobs
- `src/modules/<name>/` routes.ts → service.ts → repository.ts; registry in `src/modules/index.ts`
- `src/modules/reviews/run-executor.ts` review run: diff → repo-intel context → reviewer-core → persist
- `src/adapters/` port implementations (llm, github, git, astgrep, secrets…) · mocks in `src/adapters/mocks.ts`
- `src/modules/repo-intel/` indexer + facade · `src/db/schema/` all tables (incl. future lessons)
- `src/vendor/shared/` `@devdigest/shared` Zod contracts used by every package

## Non-default conventions
- New module = `modules/<name>/routes.ts` + ONE entry in `modules/index.ts` (no autoload).
- Validation via route zod schemas only — never `Schema.parse(req.body)` in handlers.
- Services depend on container interfaces, never on concrete adapters.
- Read repo-intel ONLY through the facade (`repoIntel.*`), never pipeline internals.

## Gotchas
- Migrations are NOT applied on boot — run `pnpm db:migrate`.
- A test importing `test/helpers/pg.ts` MUST be named `*.it.test.ts` (CI split depends on it).
- Unindexed repo → review prompt silently degrades to diff-only.
- Boot reaps `running` runs — assumes a single API instance per DB.
- Global rate limit is disabled under `NODE_ENV=test`.

## Read when
- Adding/changing a route, env var, or review prompt context → `README.md`
- Touching indexing, repo map, file rank → `src/modules/repo-intel/README.md`
- Designing a new module or lesson feature → `specs/`, then `docs/`
- Before changing run-executor, adapters, or DB schema → `INSIGHTS.md`
