# CLAUDE.md — `@devdigest/api`

Fastify API + Drizzle/Postgres. Owns all I/O for a review: repos, PRs, agents, runs, persistence, streaming. The thinking lives in `@devdigest/reviewer-core`.

Package overview → [README.md](README.md) · internals → [docs/architecture.md](docs/architecture.md) · route + error contract → [specs/api-contract.md](specs/api-contract.md) · indexer → [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md) · hard-won findings → [INSIGHTS.md](INSIGHTS.md)

## Stack

Fastify 5 (helmet · cors · rate-limit · `fastify-sse-v2` · `fastify-type-provider-zod`) · Drizzle ORM + `postgres` + pgvector · Octokit · simple-git · ast-grep · dependency-cruiser · js-tiktoken · p-queue · vitest + testcontainers. ESM, run with `tsx`.

## Commands

```sh
pnpm dev          # tsx watch → :3001
pnpm db:migrate   # REQUIRED after a pull; never runs on boot
pnpm db:seed      # idempotent demo data
pnpm db:generate  # new migration from schema changes
pnpm test         # both suites
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit only (no Docker)
pnpm exec vitest run .it.test                      # integration only (needs Docker)
```

## Where things live

| Path | What |
|------|------|
| `src/app.ts` | `buildApp()` — plugin order, error handler, module registration |
| `src/server.ts` | process entry (listen) |
| `src/modules/<name>/` | feature plugins: `routes.ts` → `service.ts` → `repository.ts` (+ `helpers.ts`, `constants.ts`) |
| `src/modules/index.ts` | the static module registry — add a module here |
| `src/modules/repo-intel/` | the codebase indexer + its facade |
| `src/platform/` | container (DI), jobs, SSE bus, errors, config, price book, run logger |
| `src/adapters/` | ports → concrete clients (LLM, GitHub, git, code index, tokenizer, secrets) + `mocks.ts` |
| `src/db/schema/` | Drizzle tables, split by domain; `src/db/migrations/` is generated |
| `src/vendor/shared/` | `@devdigest/shared` contracts (vendored) |
| `src/prompts/`, `../docs/agent-prompts/` | system prompts |
| `test/` | `*.it.test.ts` = DB-backed, everything else hermetic |

## Non-default conventions

- **Modules are registered statically** in `src/modules/index.ts` (one import + one entry), not autoloaded — the same path has to work under tsx, the bundler, and vitest.
- **Schema-first validation.** Routes declare Zod `params`/`body`; invalid input is rejected with **422 before the handler runs**. Don't hand-roll `Schema.parse(req.body)` in a handler.
- **Layer discipline.** No SQL outside `repository.ts`, no HTTP outside `routes.ts`, no literals outside `constants.ts`.
- **Everything external is an adapter** resolved from `Container`. Services depend on the interface, tests inject mocks via `ContainerOverrides` — never construct a client inline.
- **Plugins register before modules** so encapsulated module plugins inherit them and the shared error handler.
- Errors are thrown as `AppError` subclasses and serialized to one envelope: `{ error: { code, message, details } }`.
- A test that imports `test/helpers/pg.ts` **must** be named `*.it.test.ts`, or the CI split breaks.
- Cross-module entities go through the container (`container.agentsRepo`, `container.reviewRepo`, `container.repoIntel`) — don't reach into another module's folder.

## Gotchas

- Migrations never run on boot. `relation ... does not exist` = you skipped `pnpm db:migrate`.
- Boot **awaits** reaping of orphaned `running` runs. This assumes a single API instance per database; multiple replicas would need heartbeats.
- Global rate limiting is disabled under `NODE_ENV=test` so `app.inject()` suites can hammer routes; per-route caps still apply. SSE and `/health*` are exempt everywhere.
- `container.llm()` / `container.github()` **throw** when the key is missing — that is the expected path, caught and persisted as a failed run.
- `container.invalidateSecretCaches()` must be called after storing a key, or the old client stays cached.
- Secrets are not part of `AppConfig`; they only come from `SecretsProvider`.
- `@ast-grep/napi` needs a platform prebuilt — install failures on Windows usually mean a missing win32 binary.
- Long work belongs on the `JobRunner` (clone, index, refresh, poll), not in a request handler.

## Do not touch

- `src/db/migrations/**` including `meta/_journal.json` — append-only; generate a new migration instead.
- `src/vendor/shared/**` — mirrored in `client/`; edit both sides together (they have already drifted; this copy is ahead).
- `clones/` — git-ignored working checkouts.
- Unused tables in `src/db/schema/` (`eval`, `ci`, `skills`, `knowledge`, parts of `context`) — reserved for later lessons, keep them.
