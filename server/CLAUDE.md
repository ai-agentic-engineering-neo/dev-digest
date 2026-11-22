# server — `@devdigest/api` (Fastify + Drizzle + Postgres)

## Commands (run in `server/`)
- `pnpm dev` (:3001, tsx watch) · `pnpm typecheck` · `pnpm test`
- Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration only (Docker): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` after a schema change · `pnpm db:migrate` · `pnpm db:seed`

## Layout
- `src/modules/<name>/` — feature plugin: `routes.ts` → `service.ts` → `repository.ts`
- `src/adapters/` — ports for LLM, GitHub, git, ast-grep, secrets…; mocks in `adapters/mocks.ts`
- `src/platform/` — `container.ts` (DI), `config.ts` (env), resilience
- `src/db/` — `schema/` (Drizzle tables), `migrations/` (generated), `seed.ts`
- `src/vendor/shared/` — canonical Zod contracts (`@devdigest/shared`)
- `src/modules/repo-intel/` — codebase indexer; read its README.md before changing it

## Conventions
- New module: create `modules/<name>/`, then add one import + one `app.register`
  in `src/modules/index.ts` (static registration, no autoload).
- Routes declare Zod `params`/`body` schemas (fastify-type-provider-zod); don't
  hand-parse `req.body`. Invalid input → 422 before the handler.
- Every query is scoped by `workspaceId` from `getContext(container, req)`.
- External calls go through the container (`container.github()`, `container.llm(id)`),
  never by constructing SDK clients in a module.
- Secrets only via `container.secrets` — never in `AppConfig`, the DB, or logs.
- DB-backed tests (import `test/helpers/pg.ts`) MUST be named `*.it.test.ts`.

## Gotchas
- Migrations are not applied on boot — run `pnpm db:migrate`.
- `loadConfig` makes every secret optional: the API boots with no keys.
- Global rate limit 120/min (off when `NODE_ENV=test`); expensive routes have tighter caps.
- Agent prompts live in `src/db/seed-prompts.ts` AND `docs/agent-prompts/*.md` — edit both.
- Embeddings are off by default (`EMBEDDINGS_ENABLED=false`) → zero OpenAI calls.
- Integration tests use testcontainers, which ignores Docker contexts: on Colima set
  `DOCKER_HOST` + `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`, or they fail instead of skipping.

## Read when relevant
README.md (request/DI flow, API map, env vars) · src/modules/repo-intel/README.md ·
src/modules/repo-intel/INSIGHTS.md · docs/ · INSIGHTS.md · ../specs/
