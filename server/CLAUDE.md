# server — @devdigest/api

Fastify 5 · Drizzle ORM 0.45 · postgres.js 3 · OpenAI SDK 4 · Anthropic SDK 0.33 · ESM (`"type": "module"`)
Architecture and API map: [README.md](README.md) · root rules: [../CLAUDE.md](../CLAUDE.md)

## Commands
- `pnpm dev` (tsx watch, :3001) · `pnpm typecheck` · `pnpm test`
- Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (needs Docker, testcontainers): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` → `pnpm db:migrate` → `pnpm db:seed`

## Map
- `src/modules/<feature>/` — feature modules (indexer: [repo-intel](src/modules/repo-intel/README.md))
- `src/db/` — schema, migrations, seeds · `src/adapters/` — external clients · `src/prompts/` — built-in agent prompts
- `src/vendor/shared/` — Zod contracts, also aliased into reviewer-core

## Conventions
- `*.it.test.ts` = DB-backed. Every other test must stay hermetic (no DB, no network).
- Review logic belongs in reviewer-core, not here: server only wires and persists it.

## Do not touch
- `src/db/migrations/` is generated. Edit the schema, run `pnpm db:generate`; never hand-edit SQL.

## Gotchas
- Migrations are NOT applied on boot. Run `pnpm db:migrate` after pulling schema changes.
- `src/vendor/shared` is consumed by reviewer-core and mirrored in client. Changes ripple.
- Missing LLM key / GitHub token: set in `server/.env` (gitignored) or via the Settings UI.

## Docs (linked, open when relevant)
[docs/](docs/) · [specs/](specs/) · [INSIGHTS.md](INSIGHTS.md)
