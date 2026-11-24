# server — `@devdigest/api`

Fastify 5 API + Drizzle/Postgres. Repo-wide rules are in
[../CLAUDE.md](../CLAUDE.md); project overview in [../README.md](../README.md);
API map, DI flow and env vars in [README.md](README.md). Do not repeat them here.

## Commands (pnpm, run from `server/`)

```sh
pnpm dev                                            # API on :3001 (tsx watch)
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'    # unit, no Docker
pnpm exec vitest run .it.test                       # integration, needs Docker
pnpm db:generate                                    # new migration from schema/
pnpm db:migrate && pnpm db:seed
```

## Where things live

- `src/modules/<name>/` — one feature = one Fastify plugin (`routes.ts`,
  `service.ts`, `repository.ts`)
- `src/modules/index.ts` — static module registry
- `src/platform/` — config, DI container, errors, SSE, jobs
- `src/adapters/` — ports for LLM, GitHub, git, ast-grep, secrets; `mocks.ts`
- `src/db/schema/` — Drizzle tables; `src/db/migrations/` — generated SQL
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts

## Conventions

- A new module needs one import and one entry in `src/modules/index.ts`.
  Registration is static on purpose; do not switch to autoload.
- Relative imports carry a `.js` suffix (ESM), even though the files are `.ts`.
- Routes declare Zod `params`/`body`/response schemas from `@devdigest/shared`.
  Do not call `Schema.parse(req.body)` inside handlers.
- Services reach the outside world only through the DI container
  (`platform/container.ts`). Do not import an SDK client into a service.
- Throw `AppError` (`platform/errors.ts`); the shared handler builds the envelope.
- A milestone feature is a new `modules/<name>/`; it should not edit other modules.

## Gotchas

- Migrations do not run on boot. `relation ... does not exist` means
  `pnpm db:migrate` was not run.
- The schema already contains every table for M1–M8. Check `src/db/schema/`
  before adding a table; the one you need probably exists and is empty.
- A test that imports `test/helpers/pg.ts` must be named `*.it.test.ts`, or it
  lands in the unit lane and breaks CI.
- CI runs the test split with `pnpm exec vitest run …`; do not rely on
  `test:unit` / `test:integration` scripts in `package.json`.
- `platform/grounding.ts`, `prompt.ts` and `structured.ts` are re-export shims.
  The real code is in `../reviewer-core/src`; edit it there.
- `reviewer-core` type-checks against `src/vendor/shared`, so a contract change
  here can break that package too.
- Repo-intel context is added to prompts only for indexed repos; an unindexed
  repo silently degrades to diff-only.

## Do not touch

- `src/db/migrations/**` and `meta/` — generated; never hand-edit applied ones.
- `src/modules/repo-intel/pipeline/**` — starter infrastructure. Build on the
  `repoIntel.*` facade (`service.ts`) instead of changing or re-running indexing.
- `.env` and anything read by `adapters/secrets/local.ts`.
- `clones/` — runtime data.

## Read when

- Adding a route, env var or adapter → read `README.md`.
- Adding a cross-package dependency → read `../docs/architecture.md`.
- Touching review execution → read `docs/architecture.md`, then
  `src/modules/reviews/run-executor.ts`.
- Calling the indexer → read `src/modules/repo-intel/README.md`.
- Building a milestone module → read its spec in `specs/` (write it first).
- Writing tests → read `../TESTING.md`.
- Before starting → read `INSIGHTS.md`; treat it as high-confidence guidance.
- When a task ends or something non-obvious happens → run the
  `engineering-insights` skill (appends to `INSIGHTS.md`). Indexer lessons go to
  `src/modules/repo-intel/INSIGHTS.md`.
