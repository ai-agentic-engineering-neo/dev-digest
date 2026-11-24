# server — @devdigest/api (Fastify 5, :3001)

## Commands
- `pnpm dev` · `pnpm typecheck`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker, testcontainers): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` → `pnpm db:migrate` (migrations are NOT applied on boot) · `pnpm db:seed` (idempotent)

## Map
- `src/modules/<name>/` — feature = `routes.ts` → `service.ts` → `repository.ts`
- `src/modules/repo-intel/` — codebase indexer + facade → [its CLAUDE.md](src/modules/repo-intel/CLAUDE.md)
- `src/modules/reviews/run-executor.ts` — glue between DB/repo-intel and `@devdigest/reviewer-core`
- `src/platform/` — DI `container.ts`, `jobs.ts` (p-queue), `sse.ts`, `config.ts`, errors
- `src/adapters/` — port implementations (llm, github, git, astgrep, secrets…); test doubles in `adapters/mocks.ts`
- `src/db/schema/` — Drizzle schema split by domain · `src/vendor/shared/` — Zod contracts (source of truth)

## Conventions
- New module: create `modules/<name>/routes.ts` AND register it in `modules/index.ts` (static registry, no autoload).
- Validate via route `schema: { params, body }` (fastify-type-provider-zod) — no `Schema.parse(req.body)` in handlers (sole deliberate exception: `POST /pulls/:id/review`, tolerant body parse).
- Get adapters/repos from `container` — never `new OpenAIProvider()` / `new XRepository()` inside a service.
- Read secrets only via `container.secrets` — never `process.env.*_KEY` directly.
- A test that imports `test/helpers/pg.ts` MUST be named `*.it.test.ts` (CI splits unit/integration by suffix).
- Throw `AppError` subclasses from `platform/errors.ts`; the shared handler maps them to status codes.

## Gotchas
- `platform/{grounding,prompt,structured}.ts` are re-export shims → import from `@devdigest/reviewer-core` instead.
- Default review strategy is `single-pass` (`modules/reviews/constants.ts`), despite older "map-reduce" comments.
- Use the ROOT `docker-compose.yml`; `server/docker-compose.yml` binds 5432 on all interfaces.
- Changing a contract in `src/vendor/shared` the UI uses → mirror it to `client/src/vendor/shared`.

## Deeper
[README.md](README.md) (request/DI flow, API map, env vars, review context) · [INSIGHTS.md](INSIGHTS.md) · [docs/](docs/) · [specs/](specs/)
