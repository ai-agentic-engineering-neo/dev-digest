# server — @devdigest/api

Fastify API + Drizzle/Postgres. Human docs: `README.md` (source of truth).

## Where things live
- `src/modules/<name>/`  feature plugins: routes → service → repository
- `src/platform/`        `container.ts` (DI composition root), jobs, SSE bus, config, errors
- `src/adapters/`        ports → impls (llm, github, git, astgrep, …); `mocks.ts` for tests
- `src/db/schema/`       ALL course tables (most stay empty until a lesson fills them)
- `src/vendor/shared/`   Zod contracts — copy #1 of 2 (see root CLAUDE.md)
- `test/`                vitest; `test/helpers/pg.ts` = testcontainers Postgres

## Conventions (non-default)
- New module: `src/modules/<name>/routes.ts` + one entry in `src/modules/index.ts`.
  Registration is static on purpose — do not switch to autoload.
- Routes declare zod `params`/`body`/`response` schemas; never call
  `Schema.parse(req.body)` inside a handler.
- Take dependencies from `container.*`; never import another module's repository.
- A test that imports `test/helpers/pg.ts` MUST be named `*.it.test.ts`.

## Gotchas
- Reviews run fire-and-forget (not via JobRunner) and `runBus` is in-memory —
  a crash leaves `running` rows, which are reaped on boot.
- `src/platform/{grounding,prompt,structured}.ts` are re-export shims — put logic
  in reviewer-core, not here.
- Repo-intel context is empty until the repo is indexed — a diff-only review
  for an unindexed repo is expected, not a bug.
- `polling/routes.ts` queries Drizzle directly — legacy, don't copy that pattern.

## Read when
- Adding/changing a module's structure (route, service, repository, port,
  adapter, wiring) → `onion-architecture` skill; run `pnpm arch:check` before a PR.
- Adding or changing a route → README.md §API map and §Request & DI flow.
- Touching what goes into the review prompt → README.md §Review context.
- Touching indexing, repo map, file rank or callers → src/modules/repo-intel/README.md.
- Env vars or secrets questions → README.md §Environment.
- Implementing a server feature → its spec in `specs/`.
- Before any edit here → INSIGHTS.md.
