# server/ — `@devdigest/api` (Fastify 5 + Drizzle + Postgres/pgvector)

## Before answering

Search `server/docs/`, `server/specs/`, `server/INSIGHTS.md` for the topic before reading code.

## Commands (pnpm, run in `server/`)

- `pnpm dev` (tsx watch, `:3001`) · `pnpm typecheck` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker, testcontainers): `pnpm exec vitest run .it.test`

## Layout

- `src/app.ts` — buildApp: plugins → error handler → modules. `src/server.ts` — entrypoint.
- `src/modules/<name>/` — `routes.ts` → `service.ts` → `repository.ts` (+ `helpers.ts`, `constants.ts`).
  Registered statically in `src/modules/index.ts`.
- `src/platform/` — DI `container.ts`, `jobs.ts` (p-queue JobRunner), `sse.ts` (RunBus), errors, config.
- `src/adapters/` — ports implementations (llm, github, git, astgrep, depgraph, secrets…) + `mocks.ts`.
- `src/db/schema/*.ts` — Drizzle tables (all lessons' tables already exist).
- `src/modules/repo-intel/` — codebase indexer (symbols, import graph, PageRank, repo map).

## Conventions

- New module = `modules/<name>/routes.ts` default-exporting a Fastify plugin + one line in `modules/index.ts`.
  No filesystem autoload.
- Routes use `app.withTypeProvider<ZodTypeProvider>()` and declare `schema: { params, body }` with Zod —
  don't hand-parse `req.body`. Throw `AppError` subclasses from `platform/errors.ts`; never `reply.status` ad hoc.
- Multi-tenancy: there is NO automatic guard. Every query on a table with `workspace_id` must filter by the
  `workspaceId` from `getContext(container, req)` explicitly; child tables (`findings`, `pr_files`,
  `run_traces`, repo-intel tables…) have no `workspace_id` — scope them through the already-checked parent.
- repo-intel is reached ONLY through the facade `container.repoIntel.*` — never import its pipeline/repository.
- Context enrichment is best-effort: on error / unindexed repo, omit the prompt section, don't throw.
- New columns/tables = your own generated migration (`pnpm db:generate`), never edit an existing one.
- Services depend on the container, never on concrete adapters; cross-module data goes through
  `container.agentsRepo` / `container.reviewRepo`, not imports from another module's folder.
- Secrets only via `container.secrets` (never `process.env` directly; never stored in DB).
- DB-backed test ⇒ filename MUST end in `.it.test.ts`. Mock LLM/GitHub/git via `src/adapters/mocks.ts`.

## Gotchas

- Migrations are NOT run on boot; seed is required (no-auth mode resolves the seeded user/workspace).
- Seeded agents use `openrouter / deepseek/deepseek-v4-flash` → needs `OPENROUTER_API_KEY`.
- Review runs are fire-and-forget (`void executor.executeRuns`), NOT JobRunner jobs; clone/index ARE jobs.
- `RunBus` is an in-memory singleton; single API instance per DB is assumed (stale runs reaped on boot).
- `platform/{prompt,grounding,structured}.ts` are re-export shims — edit logic in `reviewer-core`.
- `@ast-grep/napi` needs a platform prebuilt; Windows install failures come from there.

## Do not touch

- `src/vendor/shared/` and `src/db/migrations/` — never hand-edit without coordination (ask first).
- `clones/**` — runtime git checkouts.

## Read when

- Adding/changing a route or env var → read `README.md` (API map, Environment).
- Touching review prompt context or grounding → read `README.md` § "Review context (non-obvious)".
- Working in repo-intel → read `src/modules/repo-intel/README.md`.
- Deep-dives → read `docs/` · feature specs/acceptance → read `specs/` · gotchas/findings → read `INSIGHTS.md`.
