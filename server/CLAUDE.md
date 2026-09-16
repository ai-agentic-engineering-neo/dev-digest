# server/CLAUDE.md — @devdigest/api

Fastify 5 + Drizzle ORM + Postgres (pgvector), port 3001. Repo-wide rules:
[../CLAUDE.md](../CLAUDE.md).

## Stack

Fastify 5 (`@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`,
`fastify-sse-v2`) · Drizzle ORM · `postgres` · `fastify-type-provider-zod` ·
Octokit (GitHub) · simple-git · ast-grep / dependency-cruiser / graphology
(repo-intel) · OpenAI/Anthropic SDKs via OpenRouter.

## Commands

```sh
pnpm dev                 # :3001, tsx watch
pnpm typecheck
pnpm db:migrate           # apply migrations — NEVER automatic on boot
pnpm db:seed              # idempotent demo data
pnpm db:generate           # after a schema change, before migrate
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit (hermetic, no Docker)
pnpm exec vitest run .it.test                       # integration (real Postgres via testcontainers)
```

## Where things live

- `src/modules/<name>/` — one Fastify plugin per domain (`routes.ts` +
  service), registered statically in `src/modules/index.ts`: `repos`,
  `pulls`, `polling`, `reviews`, `agents`, `repo-intel`, `settings`,
  `workspace`
- `src/platform/container.ts` — DI container; services depend on adapter
  *ports*, never concrete adapters
- `src/adapters/` — port implementations (`llm`, `github`, `git`, `astgrep`,
  `codeindex`, `depgraph`, `embedder`, `secrets`, `auth`, `tokenizer`); test
  doubles for all of them live in `src/adapters/mocks.ts`
- `src/db/schema/` — Drizzle schema, one file per domain
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (hand-copied, see
  root [CLAUDE.md](../CLAUDE.md))

## Non-default conventions

- Every route declares `params`/`body`/`response` Zod schemas via
  `fastify-type-provider-zod` — invalid input gets a `422` **before** the
  handler runs. Don't hand-roll `Schema.parse(req.body)`.
- Services receive every dependency via constructor injection from
  `platform/container.ts`. Never `new` an adapter directly inside a service.
- Secrets arrive only through the injected `SecretsProvider`
  (`src/adapters/secrets/local.ts` is the one chokepoint that reads
  `process.env`) — never read `process.env` elsewhere for a key.
- `reviewer-core` is consumed as TypeScript **source** via a tsconfig path
  alias, never built to JS.

## Gotchas

- First-run `relation ... does not exist` errors = forgot `pnpm db:migrate`
  (the server does not migrate on boot).
- `REPO_INTEL_ENABLED` defaults to `true`; an **unindexed** repo silently
  degrades the review prompt to diff-only — don't assume the repo-map
  section is present just because the flag is on.
- A DB-backed test file **must** end in `*.it.test.ts` or the unit/integration
  CI split silently miscounts it.

## Do-not-touch without reading first

- `platform/container.ts` — DI wiring; read [docs/architecture.md](docs/architecture.md) first.
- `adapters/mocks.ts` — shared test doubles; changes ripple into every unit test.
- `db/migrations/*.sql` — never edit an existing migration, always `db:generate` a new one.
- `vendor/shared/` — mirrored by hand in `client/src/vendor/shared`; see root [CLAUDE.md](../CLAUDE.md).

## Read When

- **Understanding DI flow, adapters, or the request lifecycle** → [docs/architecture.md](docs/architecture.md)
- **Adding/changing a route or SSE stream** → [docs/api-contracts.md](docs/api-contracts.md)
- **Tracing what "run a review" guarantees** → [specs/review-flow.md](specs/review-flow.md)
- **Hit unexpected behavior here** → [INSIGHTS.md](INSIGHTS.md)

## Docs map

- [README.md](README.md) — DI/request flow diagram, full API map, env vars
- [docs/](docs/) — deep-dive reference (architecture, API contracts)
- [specs/](specs/) — behavioral specs (what a flow must guarantee)
- [INSIGHTS.md](INSIGHTS.md) — append-only dev log of session findings
