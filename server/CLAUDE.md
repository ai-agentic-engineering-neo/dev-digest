# server — @devdigest/api (Fastify 5 + Drizzle + Postgres/pgvector)

## Commands (pnpm)
pnpm dev · pnpm typecheck · pnpm db:migrate · pnpm db:seed · pnpm db:generate
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, no Docker
pnpm exec vitest run .it.test                      # integration, needs Docker
Migrations are NOT applied on boot; seed is required (no seed → every request throws).

## Layout
src/app.ts               buildApp(): plugins → error handler → modules (tests use app.inject)
src/modules/index.ts     static module registry (new module = 1 import + 1 entry)
src/modules/<name>/      routes.ts → service.ts → repository.ts (+ helpers.ts, constants.ts)
src/platform/            container.ts (DI) · jobs.ts (JobRunner) · sse.ts (RunBus) · config · errors
src/adapters/            llm · github · git · astgrep · depgraph · secrets · mocks.ts
src/modules/repo-intel/  indexer pipeline + facade (container.repoIntel.*)
src/db/schema/           one file per domain; src/db/schema.ts is the barrel
src/vendor/shared/       @devdigest/shared — SOURCE OF TRUTH for contracts
test/                    *.test.ts (hermetic) · *.it.test.ts (testcontainers Postgres)

## Rules
- Validate with Zod route schemas (`schema: { params, body }`), not `Schema.parse(req.body)` in handlers.
- Throw AppError / NotFoundError; the global handler builds the error envelope (422/4xx/500).
- Scope every query by workspaceId from `getContext(container, req)`.
- Get deps from `container` (llm/github/git/repoIntel/…); never `new` an adapter inside a module.
- New external dependency → interface in vendor/shared/adapters.ts + mock in adapters/mocks.ts.
- A test importing test/helpers/pg.ts MUST be named *.it.test.ts.
- Background work → container.jobs (register handler + enqueue); run progress → container.runBus.
- repo-intel enrichment is best-effort: catch, log, degrade — never fail a review run.
- Relative imports use the `.js` suffix (ESM).

## Do not touch
- src/db/migrations/** — generate new ones only.
- Tables in src/db/schema that look unused — they belong to later lessons.
- platform/{grounding,prompt,structured}.ts — re-export shims kept for existing importers.

## Read when
- API map / DI flow / env vars / review-context details → README.md
- Touching the indexer or the repo-intel facade → src/modules/repo-intel/README.md
- Designing a feature in this package → specs/ · background notes → docs/
- Before a non-trivial change → skim INSIGHTS.md
