# server — Fastify API: all side effects (DB, git, GitHub, LLM)

## Stack
Fastify 5 · Zod 3 (`fastify-type-provider-zod`) · Drizzle 0.45 + `postgres` · Postgres 16 + pgvector · Node 22 · pnpm

## Commands
- `pnpm dev` (`:3001`) · `pnpm typecheck`
- `pnpm exec vitest run --exclude '**/*.it.test.ts'` — unit, no Docker
- `pnpm exec vitest run .it.test` — integration, needs Docker (testcontainers)
- `pnpm db:generate` → `pnpm db:migrate` · `pnpm db:seed` (idempotent)

## Map
- `src/modules/<name>/` — feature modules (`routes → service → repository`)
- `src/platform/` — infrastructure: DI container, job queue, SSE bus, config
- `src/adapters/` — implementations of `@devdigest/shared` interfaces + test mocks
- `src/db/` — Drizzle schema, migrations, seed
- `src/vendor/shared/` — Zod contracts (also the source for reviewer-core)

## Conventions
- New module: add one line in `src/modules/index.ts` (static registry on purpose — no autoload).
- Modules don't import each other's internals; cross-cutting access goes through
  `container.*` (`agentsRepo`, `reviewRepo`, `repoIntel`).
- Errors: `throw new AppError(...)`, never ad-hoc `reply.status().send()`.
- Review logic belongs in `reviewer-core`; the server only loads inputs, persists, streams.
- Integration tests are named `*.it.test.ts`; everything else must stay hermetic.

## Gotchas
- Migrations are NOT applied on boot.
- `RunBus` (SSE buffers, cancel flags) is in-memory; the boot-time stale-run reaper
  assumes a single API instance per DB.
- ZodError is also matched by shape — zod can be loaded twice (shared vs api).
- CLI entrypoints compare `import.meta.url` with `pathToFileURL(argv[1]).href`
  (a hand-built `file://` URL breaks on Windows).
- Keys: `~/.devdigest/secrets.json` (UI-entered) wins over `.env`.

## Do not touch
- `src/db/migrations/**` — drizzle-kit output only.
- `src/platform/{grounding,prompt,structured}.ts` — re-export shims of reviewer-core.

## Docs — read when relevant
- API map, env vars, request/DI flow → `server/README.md`
- Index of deeper docs → `server/docs/README.md`
- Before implementing a feature → `server/specs/README.md`, then the feature spec; no spec → ask
- Before debugging or a non-trivial change → `server/INSIGHTS.md`
- Found something non-obvious → append to `server/INSIGHTS.md`, not here
