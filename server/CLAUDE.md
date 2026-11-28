# server/ — `@devdigest/api` (Fastify 5 + Drizzle + Postgres)

Module guide. Root map: [../CLAUDE.md](../CLAUDE.md).

## Read when

- Any server task → first read [INSIGHTS.md](INSIGHTS.md) (agent-written lessons).
- Request/DI flow, API map, env vars, review context → [README.md](README.md)
- Repo indexing (repo map, callers, rank) → [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md)
- Deeper design notes → [docs/](docs/) · feature specs and plans → [specs/](specs/)
- Test strategy and suites → [../TESTING.md](../TESTING.md)

## Layout

```
src/server.ts, app.ts        Fastify bootstrap
src/modules/<feature>/       routes.ts · service.ts · repository.ts · helpers.ts · constants.ts
  pulls/                     GET /repos/:id/pulls (list + GitHub sync + latest run cost), GET /pulls/:id
  reviews/                   POST /pulls/:id/review, run-executor.ts, findings, runs, traces
  agents/ repos/ settings/ repo-intel/ workspace/ polling/ (polling is not used by the UI)
src/platform/                container (DI), run-logger, SSE RunBus, price-book, errors
src/adapters/                llm (openai/anthropic/openrouter + pricing.ts), github, git, mocks.ts
src/db/schema/*.ts           Drizzle tables (runs.ts = agent_runs + run_traces)
src/db/migrations/           generated SQL + meta/ (snapshots + _journal.json)
src/vendor/shared/           Zod contracts (server copy — the client has its own)
```

## Commands (run inside `server/`)

```sh
pnpm dev                                           # API on :3001 (tsx watch)
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit tests, no Docker
pnpm exec vitest run .it.test                      # integration, needs a running Docker daemon
pnpm exec vitest run test/<file>.test.ts           # one file
pnpm db:generate                                   # new migration from db/schema/*.ts
pnpm db:migrate                                    # NOT run on boot
pnpm db:seed                                       # idempotent demo data
```

If you touched `../reviewer-core/src`, also run its typecheck (the server compiles it).

## Conventions

- Imports use the `.js` suffix (`import { x } from './helpers.js'`).
- Routes are Fastify plugins (`export default async function xRoutes(app)`) with
  Zod schemas via `fastify-type-provider-zod`.
- Drizzle columns are camelCase in TS, snake_case in SQL
  (`tokensIn: integer('tokens_in')`); API JSON is snake_case — map explicitly
  (`reviewToDto`, `listRunsForPull`, …).
- Tests: `test/<area>.test.ts`; anything that needs Postgres **must** end in
  `.it.test.ts`. Use `src/adapters/mocks.ts` (MockLLMProvider, MockGitClient)
  instead of real network/keys.
- A contract change the client uses → edit `src/vendor/shared/` AND
  `../client/src/vendor/shared/`.

## Migrations

Never edit an existing file in `src/db/migrations/` or `meta/`. Why:
- `pnpm db:migrate` records applied migrations in `drizzle.__drizzle_migrations`
  and never re-runs them. An edited old migration is silently skipped on every
  database that already applied it, so dev machines, CI and prod drift apart.
- `meta/*_snapshot.json` is what `db:generate` diffs against; hand-edits make
  the next generated migration wrong (missing or duplicated DDL).
- Schema change = edit `src/db/schema/*.ts` → `pnpm db:generate` → review the new
  SQL (you may append a data backfill to the NEW file) → `pnpm db:migrate`.
- Prefer no schema change when a jsonb field (e.g. `run_traces.trace`) can carry
  display-only data; add a column when the value is queried or aggregated.

## Gotchas

- `relation ... does not exist` = migrations not applied: run `pnpm db:migrate`.
- Run cost: reviewer-core returns `costUsd` per run; OpenRouter gives real cost in
  `usage.cost`, other providers use `src/adapters/llm/pricing.ts` /
  `src/platform/price-book.ts`. It is stored in `agent_runs.cost_usd`.
- `package.json` is `skip-worktree` locally (a local variant diverges); do not
  rely on scripts that exist only locally.
