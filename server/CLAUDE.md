# server — `@devdigest/api`

Fastify 5 · Drizzle ORM 0.45 + `postgres` · Postgres 16 + pgvector · Zod 3 via
`fastify-type-provider-zod` · p-queue · fastify-sse-v2 · octokit · simple-git ·
@ast-grep/napi · dependency-cruiser · graphology · tsx · vitest 2 + testcontainers. ESM.

## Commands (pnpm)
```sh
pnpm dev                                          # tsx watch → :3001
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'  # unit, no Docker
pnpm exec vitest run .it.test                     # integration, needs Docker
pnpm db:generate                                  # after editing src/db/schema/*.ts
pnpm db:migrate && pnpm db:seed                   # NOT run on boot
```

## Map
```
src/app.ts              buildApp: host/origin guard, plugins, error handler, modules
src/modules/index.ts    static module registry
src/modules/<name>/     routes.ts → service.ts → repository.ts (+ constants, helpers)
src/platform/           container (DI), config, jobs, sse, errors, run-logger
src/adapters/           llm, github, git, astgrep, depgraph, secrets…; mocks.ts for tests
src/db/schema/*.ts      Drizzle tables split by domain; migrations/ is generated
src/vendor/shared/      Zod contracts (@devdigest/shared) — canonical copy
test/                   vitest; test/helpers/pg.ts = testcontainers Postgres
```

## Conventions (non-default)
- New module = `modules/<name>/routes.ts` (default-export plugin) + one line in
  `modules/index.ts`. No autoload.
- Routes: `appBase.withTypeProvider<ZodTypeProvider>()` + zod `schema.params/body`.
  Don't hand-roll `Schema.parse(req.body)`.
- Errors: throw `AppError` subclasses (`platform/errors.ts`: NotFound, Validation,
  ExternalService, Config). The global handler maps them to `{ error: { code, message, details } }`.
- Services get adapters and cross-module repos from `container` only
  (`container.agentsRepo`, `container.repoIntel`, `container.llm(id)`…). Never import
  another module's repository file.
- Secrets only through `container.secrets` — never read keys from `process.env` directly.
- Relative imports carry the `.js` extension.
- Expensive routes set a per-route cap: `config: { rateLimit: { max, timeWindow } }`.
- A test that touches the DB must be named `*.it.test.ts`, or it leaks into the unit lane.

## Gotchas
- Review runs are fire-and-forget (not on JobRunner). Orphaned `running` rows are reaped
  on boot. This assumes ONE API instance per DB.
- JobRunner's queue lives in memory (mirrored to `jobs`): queued clone/index jobs are lost on restart.
- `platform/{grounding,prompt,structured}.ts` are re-export shims → edit `reviewer-core` instead.
- `platform/model-router.ts` and `platform/trace-builder.ts` are currently unused.
- Unindexed repo → repo-intel returns empty and the review silently degrades to diff-only.

## Do not touch
- `src/db/migrations/**` (incl. `meta/`) — never hand-edit; change `schema/*.ts` and run `pnpm db:generate`.
- `src/modules/repo-intel/**` — starter infrastructure; consume it via `container.repoIntel`, don't rewrite.
- `src/vendor/shared` — never change without updating `client/src/vendor/shared` too.

## Read when
- You add or change a route, or an env var → `README.md` (API map, Environment).
- You touch what goes into the review prompt → `README.md` (Review context).
- You need repo-intel data (repo map, rank, callers, blast radius) → `src/modules/repo-intel/README.md`.
- You change engine behaviour (prompt, grounding, parsing) → `../reviewer-core/CLAUDE.md`.
- You write tests → `../TESTING.md`.
- You start a feature → write the spec in `specs/` first; design notes and ADRs → `docs/`.
- Before a non-trivial change → `INSIGHTS.md`; append what you learn.
