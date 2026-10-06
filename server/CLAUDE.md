# server — @devdigest/api

Fastify 5 API + Drizzle ORM 0.38 over Postgres (pgvector), port 3001. Package manager: **pnpm**.

## Docs — read when relevant
- [README.md](README.md) — request & DI flow, API map, env vars, review context. Read before touching routes, DI or the reviewer.
- [docs/](docs/) — deeper module/architecture notes.
- [specs/](specs/) — feature specs. **Find the spec before implementing a feature.**
- [../TESTING.md](../TESTING.md) — test philosophy.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm test` (unit + integration)
- Unit only (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` (after schema change) → `pnpm db:migrate` → `pnpm db:seed` (idempotent)

## Where things live
- `src/modules/<name>/` — one Fastify plugin per feature (`routes.ts` + service); registered in `src/modules/index.ts`
- `src/adapters/` — ports (llm, github, git, astgrep, secrets…); test doubles in `src/adapters/mocks.ts`
- `src/platform/` — config, DI container · `src/db/` — schema, migrations, seed · `src/vendor/shared` — Zod contracts

## Conventions
- Route validation via Zod schemas (`fastify-type-provider-zod`); never `Schema.parse(req.body)` in handlers. Invalid → 422.
- New external dependency → new adapter behind DI + a mock in `mocks.ts`.
- Tests importing `test/helpers/pg.ts` **must** be named `*.it.test.ts`.
- Secrets only via `SecretsProvider`, never in `AppConfig`, DB or logs.

## Gotchas
- Migrations are not applied on boot.
- Unindexed repo → reviewer silently degrades to diff-only context.
- Prompt-injection defense is `INJECTION_GUARD` in reviewer-core — don't add keyword scanning.
- Grounding drops findings that cite lines not in the diff; score is recomputed, model score ignored.

## Do not touch
- `src/db/migrations/*` already applied — add a new migration instead.
- `clones/` — user's repo checkouts.

## Insights
@INSIGHTS.md
