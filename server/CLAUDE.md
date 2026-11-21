# server — @devdigest/api

Fastify API (:3001): repos/PR import, repo-intel indexing, agents, review runs. Uses **pnpm**.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm build`
- `pnpm db:generate` (new migration from schema) · `pnpm db:seed` (idempotent demo data)
- `pnpm db:migrate` — **needs user approval, see Do not touch**
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker): `pnpm exec vitest run .it.test`

## Map
- `src/modules/<name>/` — feature plugin (routes · service · repository); registered in `src/modules/index.ts`
- `src/modules/reviews/run-executor.ts` — background review run (context → reviewer-core → persist)
- `src/modules/repo-intel/` — indexer pipeline + `repoIntel.*` facade
- `src/platform/` — DI container, config, job queue, SSE run bus, errors, local-only guard
- `src/adapters/` — ports to LLM / GitHub / git / ast-grep / tokenizer / secrets; mocks in `src/adapters/mocks.ts`
- `src/db/schema/` — Drizzle schema · `src/db/migrations/` — generated SQL
- `test/` — vitest suites; `test/helpers/pg.ts` = testcontainers Postgres

## Conventions (non-default)
- Validate with the route's zod schemas (`fastify-type-provider-zod`); never hand-roll `Schema.parse(req.body)`.
- Reach external services only through `Container` getters; tests inject via `ContainerOverrides`.
- Read secrets only via `SecretsProvider` — never put keys in the DB, `AppConfig`, or git.
- Review logic (prompt assembly, grounding, structured output) belongs in `reviewer-core`, not here.
- Throw `AppError` subclasses (`src/platform/errors.ts`); the global handler builds the error envelope.

## Gotchas
- A test that imports `test/helpers/pg.ts` MUST be named `*.it.test.ts`, or the unit/integration CI split breaks.
- Migrations are NOT applied on boot.
- The global rate limit is disabled under `NODE_ENV=test` — don't assert on it in tests.
- An unindexed repo silently degrades the review to diff-only (no error, no repo map).
- `src/platform/{grounding,prompt,structured}.ts` are re-export shims of reviewer-core — edit reviewer-core.

## Do not touch
- **Existing migrations are immutable.** Never edit, rename, delete, or regenerate files in
  `src/db/migrations/` (`*.sql` and `meta/*`). A schema change = edit `src/db/schema/**` → `pnpm db:generate`
  → a NEW migration file.
- **Never apply migrations without explicit user approval** — `pnpm db:migrate`, `drizzle-kit push`/`migrate`,
  or `./scripts/dev.sh` (migrates in every mode). Generate the migration, show the SQL, wait for a go-ahead.
  Allowed without asking: `*.it.test.ts` (throwaway testcontainers DB) and `./scripts/e2e.sh` (isolated DB).
- `src/platform/local-only.ts` Host/Origin checks — DNS-rebinding defense for an unauthenticated API.
- `src/vendor/shared/**` — changing a contract affects every package; mirror it in `client/src/vendor/shared`
  and typecheck all packages.

## Read when
- Adding/changing a route or module → read `README.md` (request/DI flow, API map, env).
- Touching indexing, repo map, file rank, or callers → read `src/modules/repo-intel/README.md`.
- Writing tests → read `../TESTING.md`.
- Making an architectural decision → check `docs/` first; record the decision there.
- Implementing a roadmap feature → find its spec in `specs/` (or `../specs/` if cross-module).
- Before starting work here → read `INSIGHTS.md`. When you learn something non-obvious, you MUST record it
  with the `engineering-insights` skill, and check again before finishing the task.
