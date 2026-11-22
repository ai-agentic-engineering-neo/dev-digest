# server — @devdigest/api

## Stack
Node ≥22 · TypeScript 5.9 · Fastify 5 · Drizzle ORM 0.45 / drizzle-kit 0.31 ·
Postgres + pgvector · Zod 3.25 + fastify-type-provider-zod 4 · Vitest 2 · tsx · pnpm

## Commands
- `pnpm dev` (:3001) · `pnpm typecheck` · `pnpm test` (unit + integration)
- Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration only (needs Docker): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` → `pnpm db:migrate` · `pnpm db:seed` (idempotent)

## Map
- `src/modules/<name>/` — feature = Fastify plugin (`routes.ts` + `service.ts`),
  registered statically in `src/modules/index.ts`
- `src/adapters/` — ports to the outside world (llm, github, git, astgrep, secrets…);
  test doubles in `src/adapters/mocks.ts`
- `src/platform/` — DI container, config, JobRunner (`jobs.ts`), resilience, logging
- `src/db/schema/` + `src/db/migrations/` — Drizzle schema and SQL migrations
- `src/modules/repo-intel/` — codebase indexer (starter infra)
- `src/vendor/shared/` — Zod contracts (`@devdigest/shared`)

## Conventions
- Validate via zod `params`/`body` schemas on the route; never `Schema.parse(req.body)` in handlers.
- All external I/O goes through an adapter resolved from the DI container (mockable in tests).
- A test that imports `test/helpers/pg.ts` MUST be named `*.it.test.ts`.
- Secrets only via `SecretsProvider` (`~/.devdigest/secrets.json`); never in AppConfig, DB or git.
- Background work (clone, import, indexing) goes through `JobRunner`, not bare promises.

## Gotchas
- Migrations are NOT applied on boot — run `pnpm db:migrate`.
- The schema already contains tables for ALL milestones; check before adding a new one.
- Global rate limit is off under `NODE_ENV=test`; `POST /pulls/:id/review` has a tighter cap.
- The review route does not await the run; results arrive via SSE + DB.
- Repo-map context is empty until the repo is indexed (degrades silently to diff-only).

## Do not touch
- Existing files in `src/db/migrations/` — generate a new migration instead.
- `src/vendor/shared/` without mirroring the change into `client/src/vendor/shared/`.
- `clones/` — runtime data (git-ignored).
- repo-intel internals — build on its facade (`repoIntel.*`), don't re-index.

## Read when
| When | Read |
|---|---|
| API map, env vars, how review context is assembled | `README.md` |
| Touching indexing / repo map | `src/modules/repo-intel/README.md` |
| Test strategy, CI | `../TESTING.md` |
| Deep reference for a module | `docs/` |
| Implementing a milestone | `specs/` |
| Before changing jobs, DB or reviews | `INSIGHTS.md` |
