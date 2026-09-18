# @devdigest/api

Fastify 5 + Drizzle + Postgres on port 3001. Ports-and-adapters architecture.

## Layout

```
src/app.ts              buildApp() — the whole bootstrap on one screen
src/platform/           container (DI root) · jobs · sse · config · errors
src/adapters/           ports: git github llm astgrep ripgrep depgraph secrets
src/modules/<name>/     routes.ts → service.ts → repository.ts (+helpers/constants)
src/db/schema/          domain files, re-exported through schema.ts
src/vendor/shared/      Zod contracts (canonical copy)
```

## Read when

- **Overview, request flow or the API map** → read `README.md` (has the diagrams).
- **Adding a table, a column or tenancy scoping** → read `docs/db-schema.md`.
- **Touching the indexer, repo map or file ranking** → read `docs/repo-intel.md`.
- **Adding an adapter or wiring a dependency** → read `docs/di-container.md`.
- **Starting a task in this module** → read `specs/`.
- **Debugging something that smells familiar** → read `INSIGHTS.md`; run the
  `engineering-insights` skill at the end of the task to add to it.

## Conventions (non-default)

- Modules register **statically** in `src/modules/index.ts` — no autoload.
  A new module is `modules/<name>/routes.ts` plus one import and one entry.
- Directories are lowercase kebab-case (`pulls`, `repo-intel`, `github`) and the
  layer filenames are fixed: `routes.ts`, `service.ts`, `repository.ts`,
  `helpers.ts`, `constants.ts`. Anything extra is a kebab-case module
  (`diff-loader.ts`, `run-executor.ts`).
- Layer duties are strict: routes = HTTP, service = logic, repository = all
  persistence, helpers = pure transforms, constants = every literal.
  **No raw SQL and no HTTP inside a service.**
- A route's Zod schema drives request validation *and* response serialization.
  Declare `schema.body`/`schema.params` — do not hand-roll `Schema.parse(req.body)`.
- Every handler starts with `getContext(container, req)` to get `workspaceId`.
- Secrets only through `container.secrets`. Reading `process.env` for a key is banned.
- Take dependencies from `container`, never import a concrete adapter class —
  otherwise tests cannot swap it through `ContainerOverrides`.

## Gotchas

- `buildApp()` **awaits** reaping of stale `running` runs on boot. That is correct
  only for a SINGLE API instance per database; replicas would break it.
- `POST /pulls/:id/review` is fire-and-forget: it returns `runId` immediately and
  the review continues in the background. Do not make it synchronous.
- `RunBus` keeps an in-memory buffer; SSE replays the buffer first, then streams
  live. On completion the whole log is persisted as ONE jsonb doc in `run_traces`.
- After storing a new key call `container.invalidateSecretCaches()`, or the
  cached provider client keeps the old one.
- `repo-intel` always degrades, never throws: object methods carry `degraded`,
  array methods return `[]`. A consumer must not fail on a missing index.
- Changing the AST extractor or symbol schema requires bumping `INDEXER_VERSION`,
  otherwise no repo is re-indexed.

## Tests

`pnpm test` runs everything. Hermetic only:
`pnpm exec vitest run --exclude '**/*.it.test.ts'`.
DB-backed (testcontainers): `pnpm exec vitest run .it.test`.
Mock adapters live in `src/adapters/mocks.ts`.
