# server (`@devdigest/api`) — agent map

Fastify API: imports repos/PRs, indexes repos (`repo-intel`), stores agents, runs reviews
through `reviewer-core`. Overview, request/DI flow, API map, env vars: [README](README.md).

## Stack

Node ≥ 22 · TypeScript · Fastify 5 (helmet, cors, rate-limit, `fastify-sse-v2`) ·
`fastify-type-provider-zod` · Zod 3 · Drizzle ORM 0.38 · Postgres 16 + pgvector ·
Vitest + testcontainers · pnpm.

## Commands

```sh
pnpm install
pnpm dev                                              # :3001 (tsx watch)
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'      # unit — hermetic, no Docker
pnpm exec vitest run .it.test                         # integration — needs Docker
pnpm db:generate   # after editing src/db/schema
pnpm db:migrate    # NOT applied on boot
pnpm db:seed       # idempotent demo data (acme/payments-api, PR #482)
```

## Where things live

- `src/modules/<name>/` — feature plugins: `routes.ts` → `service.ts` → `repository.ts`
- `src/modules/repo-intel/` — codebase indexer ([its README](src/modules/repo-intel/README.md))
- `src/adapters/` — ports to the outside world (LLM, GitHub, git, ast-grep, secrets…); `mocks.ts` for tests
- `src/platform/` — DI container, config, errors, SSE, jobs, model router, run traces
- `src/db/schema/` + `src/db/migrations/` — Drizzle schema and generated migrations
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (canonical copy)
- `test/` — `*.test.ts` unit, `*.it.test.ts` integration (`test/helpers/pg.ts`)

## Conventions

- New module = folder in `src/modules/` + one static `app.register` in `src/modules/index.ts`.
- Validate with route-level Zod schemas (`params`/`body`/`response`); don't hand-roll `Schema.parse(req.body)`.
- External I/O only through adapters resolved from `src/platform/container.ts`; tests swap in `src/adapters/mocks.ts`.
- Read repo-intel only via the `repoIntel.*` facade (`service.ts`), never pipeline internals.
- Any test that touches Postgres **must** be named `*.it.test.ts` (keeps the unit lane hermetic).
- Throw `AppError` or its subclasses (`src/platform/errors.ts`) — the shared handler builds the error envelope.

## Gotchas

- The schema already holds tables for future lessons (eval, memory, skills, ci…). They are
  empty on purpose — don't drop them as "unused".
- Contract change in `src/vendor/shared` → mirror it in `client/src/vendor/shared`.
- `reviewer-core` is compiled from source via path alias; its changes can break `pnpm typecheck` here.
- Repo Intel degrades silently to diff-only for unindexed repos — empty context is not a bug.
- Global rate limit is disabled under `NODE_ENV=test`.

## Do not touch

- Secrets: only via `LocalSecretsProvider` (`~/.devdigest/secrets.json`, `process.env` fallback).
  Never store keys in the DB, logs or git.
- Don't weaken the grounding gate or `INJECTION_GUARD`; don't add keyword scanning of untrusted text.
- Don't hand-edit `src/db/migrations/` — change the schema and run `pnpm db:generate`.
- `clones/` — runtime checkouts, git-ignored.

## Read before you work

- Feature spec for the task → [specs/](specs/README.md)
- Deeper reference → [docs/](docs/README.md) · test strategy → [../TESTING.md](../TESTING.md)
- Past learnings → [INSIGHTS.md](INSIGHTS.md) — read before non-trivial work; new entries are
  added by the `engineering-insights` skill (append-only, no duplicates).
