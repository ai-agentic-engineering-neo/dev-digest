# server/ — `@devdigest/api`

Fastify ^5.12 · Drizzle ORM ^0.45 (`postgres` driver) · Postgres 16 + pgvector ·
Zod ^3.25 via `fastify-type-provider-zod` · TypeScript ^5.9 · vitest ^2.1 ·
Node 22 · **pnpm 10**.

## Commands

- `pnpm dev` (API on :3001) · `pnpm typecheck`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (needs Docker): `pnpm exec vitest run .it.test`
- `pnpm db:generate` (new migration from schema) · `pnpm db:migrate` · `pnpm db:seed`

Use the `pnpm exec vitest …` forms above, not `test:unit`/`test:integration`
scripts. Don't commit changes to `package.json` without asking — per `TESTING.md`
a local variant is kept `skip-worktree`.

## Where things live

- `src/app.ts` — Host/Origin guard, plugins, error handler, stale-run reaper, module registration
- `src/modules/index.ts` — static module registry; a new module is added here (no autoload)
- `src/modules/<name>/` — `routes.ts` → `service.ts` → `repository.ts` (+ `helpers.ts`, `constants.ts`)
- `src/platform/` — `container.ts` (DI), `config.ts`, `sse.ts` (RunBus), `jobs.ts`, `errors.ts`
- `src/adapters/` — implementations of interfaces in `vendor/shared/adapters.ts`; test doubles in `mocks.ts`
- `src/db/schema/` (by domain) · `src/db/migrations/` (generated) · `src/db/seed.ts`
- `src/vendor/shared/` — canonical `@devdigest/shared` contracts (client holds a copy)

## Conventions

- Validate route input with a Zod `schema: { params, body }`, not `Schema.parse(req.body)`.
- Throw `AppError` subclasses from `platform/errors.ts`; never `reply.status(...)` for errors.
- Every route calls `getContext(container, req)` and scopes queries by `workspaceId`.
- Reach shared services through `app.container`; never import another module's folder.
- External calls (LLM, GitHub, git, fs indexing) go through an adapter interface so
  tests can override them via `ContainerOverrides`.
- Read secrets only via `container.secrets` (`SecretsProvider`), never `process.env`;
  don't add secret keys to `EnvSchema` in `platform/config.ts`.
- After saving a secret, call `container.invalidateSecretCaches()`.

## Gotchas

- A test that imports `test/helpers/pg.ts` must be named `*.it.test.ts`, or the unit lane breaks.
- Schema changes: edit `src/db/schema/*`, then `pnpm db:generate`. Never edit an
  existing file in `src/db/migrations/`.
- The schema defines ~40 tables; most are empty on purpose (later milestones). Don't delete them.
- `repoIntel.*` facade methods must degrade (return `[]` / `degraded: true`), never
  throw — reviews call them best-effort.
- `GET /repos/:id/pulls` writes: it syncs PRs from GitHub and backfills stats on read.
- Background work goes through `container.jobs.enqueue(kind, payload)`; the handler
  must be registered at plugin load (see `repos/routes.ts`, `repo-intel/routes.ts`).
- Reviews (`modules/reviews/`):
  - `POST /pulls/:id/review` returns run IDs before the review runs; execution is
    fire-and-forget in `run-executor.ts`. Clients learn progress via SSE + polling.
  - Every exit path of a run (done, failed, cancelled) must call `completeAgentRun`,
    `saveRunTrace` and `runBus.complete(runId)`, or the run hangs as "running".
  - The agent row's `strategy` overrides the engine default (`agent.strategy ?? REVIEW_STRATEGY`).
  - The boot-time reaper marks every `running` run as stale: it assumes one API
    instance per DB. RunBus state is in-memory only.

## Read when…

- Read `README.md` (this package) when adding an env var, a route or a module, or
  changing how secrets are loaded.
- Read `src/modules/repo-intel/README.md` when calling or changing any `repoIntel.*`
  method or the indexing pipeline.
- Read `../reviewer-core/CLAUDE.md` when changing what `run-executor.ts` passes to
  `reviewPullRequest`.
- Read `INSIGHTS.md` before debugging here; append a dated entry (Status: unverified)
  when you find non-obvious behaviour.
- Read `specs/` before implementing a server feature that has a spec; `docs/` for
  long-form design notes.
