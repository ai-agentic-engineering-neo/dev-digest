# server — @devdigest/api

Fastify 5 · Drizzle 0.45 (Postgres + pgvector) · Zod 3 via fastify-type-provider-zod · tsx · vitest 2. Package manager: pnpm.

## Where things are
- `src/modules/<name>/` — one Fastify plugin per feature (routes → service → repository); register it in `src/modules/index.ts`
- `src/adapters/` — external ports (llm, github, git, astgrep, …) wired through DI in `src/platform/container.ts`; test doubles in `src/adapters/mocks.ts`
- `src/db/schema/` — ALL tables for every milestone already exist; most stay empty until their milestone
- Review pipeline entry: `src/modules/reviews/run-executor.ts` → `@devdigest/reviewer-core`
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (client has its own copy, see root AGENTS.md)

## Commands
- `pnpm dev` · `pnpm typecheck`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` (after schema change) · `pnpm db:migrate` · `pnpm db:seed`

## Conventions (non-default)
- Validate in the route's zod schema — never `Schema.parse(req.body)` inside a handler.
- A new external dependency = new adapter + mock; services never call it directly.
- DB-backed tests are named `*.it.test.ts`.

## Gotchas
- Migrations are NOT applied on boot.
- Prompt assembly, grounding and structured parsing live ONLY in `reviewer-core/` — import them from `@devdigest/reviewer-core` (the old `src/platform/{grounding,prompt,structured}.ts` shims were removed).
- reviewer-core is imported as raw source: missing `reviewer-core/node_modules` → ERR_MODULE_NOT_FOUND at boot.

## Read when relevant
- `README.md` — API map, env vars, review context
- `src/modules/repo-intel/README.md` — indexer pipeline + facade
- `../.claude/skills/onion-architecture/SKILL.md` — before adding/moving a module, service, repository, route or adapter
- `docs/` · `specs/` (before a milestone feature) · `INSIGHTS.md` (before non-trivial changes)
