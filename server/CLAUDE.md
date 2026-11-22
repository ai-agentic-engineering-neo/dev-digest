# server (`@devdigest/api`) — instructions for Claude

Fastify 5 API over Postgres (pgvector). Source of truth: `server/README.md`.

## Commands

- Dev server (`:3001`): `pnpm dev`
- Migrate: `pnpm db:migrate` (required before first run; **not** automatic on boot)
- Seed (idempotent): `pnpm db:seed`
- Generate a migration after schema changes: `pnpm db:generate`
- Typecheck: `pnpm typecheck` · Build: `pnpm build`
- Unit tests (hermetic, no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration tests (real Postgres via testcontainers, needs Docker): `pnpm exec vitest run .it.test`
- `pnpm test` runs both.

## Module pattern

- Each feature is `src/modules/<name>/` with `routes.ts`, `service.ts`, `repository.ts`.
- Register new modules once in `src/modules/index.ts`.
- Plugins register before modules so they inherit helmet, cors, rate-limit, SSE and the error handler.
- Route schemas are Zod (`params`/`body`/response); one definition drives validation and serialization.
- Adapters (LLM, GitHub, git, secrets, tokenizer, ast-grep) are injected via `src/platform/container.ts`. In tests, use `src/adapters/mocks.ts`.

## Rules

- A DB-backed test imports `test/helpers/pg.ts` and **must** be named `*.it.test.ts`.
- Secrets are read only through `LocalSecretsProvider` (`src/adapters/secrets/local.ts`). `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is a fallback.
- Rate limit is 120/min globally, disabled under `NODE_ENV=test`. Expensive routes (e.g. `POST /pulls/:id/review`) have tighter caps. SSE and `/health*` are exempt.
- The review engine lives in `reviewer-core`; don't reimplement prompt, grounding or scoring logic here.
- Schema changes: edit `src/db/schema/*.ts`, run `pnpm db:generate`, then `pnpm db:migrate`.
