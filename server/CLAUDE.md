# server (@devdigest/api)

## Before answering

Search `server/docs/`, `server/specs/`, `server/INSIGHTS.md` first.

## Tech stack

Fastify 5 (`@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`,
`fastify-sse-v2` for streaming run traces), Drizzle ORM, `postgres`,
pgvector. Zod contracts from `src/vendor/shared` (`@devdigest/shared`)
double as route schemas via `fastify-type-provider-zod`. No API keys
required to boot — every secret is optional and settable at runtime.

## Commands

- Run: `pnpm dev` (`:3001`).
- Migrate/seed: `pnpm db:migrate`, `pnpm db:seed`.
- Test: `pnpm test` — unit (`vitest run --exclude '**/*.it.test.ts'`, no
  Docker) + integration (`vitest run .it.test`, real Postgres via
  testcontainers, self-skips without Docker). `pnpm test` runs both.
- Typecheck: `pnpm typecheck`.
- Lint: `pnpm lint` (eslint).

## Naming conventions

- Relative imports carry the `.js` extension even though the source is `.ts`
  (ESM, matches client/reviewer-core).
- A DB-backed test (imports `test/helpers/pg.ts`) **must** use the
  `*.it.test.ts` suffix or the unit/integration split breaks.
- Modules are registered statically, one import + one `app.register` each,
  in `src/modules/index.ts` — no filesystem autoload.

## Do-not-touch

- `src/db/migrations/`, `src/db/schema/*` — never hand-edit an applied
  migration; add new tables via a new domain file, don't restructure.
- `pnpm-lock.yaml` — never hand-edit, only regenerate via `pnpm install`.
- `src/vendor/**` — see root `CLAUDE.md`'s do-not-touch (synced-copy convention).

## Conventions (not obvious from code)

- Adapters (llm, github, git, astgrep, secrets, tokenizer, …) sit behind the
  DI container (`platform/container.ts`) — services depend on interfaces,
  never concrete classes; tests swap in `adapters/mocks.ts`.
- Route validation is schema-first: Zod schemas from `src/vendor/shared`
  double as both request validation and response serialization
  (`fastify-type-provider-zod`) — don't hand-roll `Schema.parse(req.body)`.
- Secrets never come from `AppConfig` — they go through `SecretsProvider`
  (`~/.devdigest/secrets.json`, `process.env` fallback).

## Use when

- Stack, request/DI flow, API map, env vars → read `README.md`
- Indexing pipeline / repo map / blast radius → `src/modules/repo-intel/README.md`
- Deep-dives / specs / running notes → `docs/` · `specs/` · `INSIGHTS.md`
- Cross-package rules (vendoring, migrations, ESM imports) → `../CLAUDE.md`
