# server — @devdigest/api

Fastify 5 · Drizzle 0.45 / drizzle-kit 0.31 · postgres.js · Zod 3 (fastify-type-provider-zod)
· Vitest 2 · testcontainers · tsx. Package manager: pnpm.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm test`
- Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (needs Docker): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` (after schema edit) · `pnpm db:migrate` · `pnpm db:seed`

## Map
- `src/app.ts` — buildApp: plugins, host/origin guard, error envelope
- `src/platform/container.ts` — DI container; every adapter resolved here
- `src/modules/<name>/` — routes → service → repository; registry in `modules/index.ts`
- `src/adapters/` — external systems (git, github, llm, codeindex…); `mocks.ts` for tests
- `src/db/schema/*.ts` — Drizzle schema · `src/db/migrations/` — generated SQL
- `src/modules/repo-intel/` — codebase indexer (own README)

## Conventions
- New module: `modules/<name>/routes.ts` default plugin + one entry in `modules/index.ts` (static, no autoload).
- Routes: `app.withTypeProvider<ZodTypeProvider>()` + `schema: { params, body }`.
- Errors: throw AppError subclasses (`platform/errors.ts`); don't hand-build error replies.
- Services depend on adapter interfaces from `@devdigest/shared`, never concrete classes.
- Tests: `*.it.test.ts` = real Postgres; everything else hermetic via `adapters/mocks.ts`.

## Read when…
- Adding/changing an endpoint → README.md (API map)
- Touching repo-intel or review context → src/modules/repo-intel/README.md
- Feature work → specs/ · Deep how-it-works → docs/
- Before any change → INSIGHTS.md

## Gotchas
- Canonical shared contracts live here (`src/vendor/shared`) — mirror changes to client/.
- reviewer-core is imported as TS source via alias; its deps install with `npm ci`.
- Boot reaps 'running' runs — assumes a single API instance per DB.

## Do not touch
- Existing migration files and `migrations/meta/*` (change only via `db:generate`).
