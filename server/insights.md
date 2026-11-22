# server — insights

Read via the `engineering-insights` skill. Rules live in `server/CLAUDE.md`; setup in `server/README.md`.

## What works

- **Unit tests run without Docker**: `pnpm exec vitest run --exclude '**/*.it.test.ts'`. DB tests are the only ones that need Docker. [2026-11-20]

## What does not work

- **Starting the API on a fresh DB without migrating**: `relation "…" does not exist` on first request. Run `pnpm db:migrate` first. [2026-11-20]

## Codebase patterns

- **Migrations are never applied on boot.** The server does not run migrations when it starts. Schema change: edit `src/db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`. Why: keeps boot side-effect free. [2026-11-20]
- **Secrets are read only through `LocalSecretsProvider`** (`src/adapters/secrets/local.ts`). Keys live in `~/.devdigest/secrets.json` (mode 0600), with `process.env` as fallback. `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is the fallback. Never store a key in `AppConfig` or the DB. Why: keeps credentials out of git and DB backups. [2026-11-20]
- **New module wiring**: each feature is `src/modules/<name>/` with `routes.ts`, `service.ts`, `repository.ts`. Register it once in `src/modules/index.ts`. Plugins register before modules so they inherit helmet, cors, rate-limit, SSE and the error handler. [2026-11-20]
- **Tests get adapters from `src/adapters/mocks.ts`**, injected via `src/platform/container.ts`. Do not import real adapters in hermetic tests. [2026-11-20]
- **Rate limit is 120/min globally and is off when `NODE_ENV=test`.** `POST /pulls/:id/review` has a tighter cap. SSE and `/health*` are exempt. Watch for: a test that passes locally but would be throttled in production. [2026-11-20]

## Tool and library notes

- **Fastify route validation**: Zod schemas for `params`/`body`/response via `fastify-type-provider-zod`. One schema does both validation and serialization. Invalid input returns 422 before the handler runs. [2026-11-20]

## Recurring errors and fixes

- **`relation "…" does not exist` on first run** → cause: migrations skipped → fix: `pnpm db:migrate`. [2026-11-20]
- **Run stuck in `running` after a crash** → expected: runs left in `running` are marked failed when the engine starts → fix: restart the server; no manual DB edit needed. [2026-11-20]

## Session notes

- _None yet._

## Open questions

- _None yet._

## Legacy entries

## 2026-11-20 — Migrations are not applied on boot
The server never migrates on start. First-run errors like `relation ... does not exist`
mean `pnpm db:migrate` was skipped.
Why: keeps boot side-effect free and makes migrations an explicit step.

## 2026-11-20 — Secrets are never in AppConfig or the DB
Keys live in `~/.devdigest/secrets.json` (0600), with `process.env` as fallback. Entered
via Settings or `.env`. `LocalSecretsProvider` is the only read point.
Why: keeps credentials out of git and out of database backups.

## 2026-11-20 — Orphaned runs are reaped on boot
Runs left in `running` (e.g. after a crash) are marked failed when the engine starts.
Watch for: a run stuck "running" after restart is expected to be reaped, not a hang.

## 2026-11-20 — Rate limit is off in tests
Global 120/min limit is disabled under `NODE_ENV=test`. SSE and `/health*` are exempt.
Watch for: a test that passes locally but would hit the limit in production.
