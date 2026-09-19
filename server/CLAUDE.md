# server — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Fastify 5, Drizzle ORM 0.38 + `postgres` (pgvector), TS 5.7. Layout: `src/platform` (cross-cutting), `src/adapters` (external integrations), `src/modules` (feature modules), `src/db` (schema + migrations). Run: `pnpm dev` (tsx watch, port from `.env`). Build: `pnpm build` (tsc). Test: `pnpm test` (vitest — `*.it.test.ts` need Docker Postgres, self-skip otherwise). Typecheck: `pnpm typecheck`. Lint: not configured. Arch check: `pnpm arch` (dependency-cruiser, onion rules; baseline in `.dependency-cruiser-known-violations.json` — only shrinks). DB: `pnpm db:generate` (drizzle-kit), `pnpm db:migrate`, `pnpm db:seed`.

## Read when

- changing DB schema → `docs/README.md`, then check `specs/` for feature spec
- adding a route → `docs/README.md` for routing pattern
- adding/moving a module, route, service, repository, adapter or domain rule → `.claude/skills/onion-architecture/SKILL.md`
- **before any work → `INSIGHTS.md` (read first, always)**

## Naming

`src/modules/<kebab-case>/routes.ts` per feature area; DB columns `snake_case` in Postgres → camelCase in `src/db/schema/*.ts`; every wire shape is a PascalCase Zod export in `vendor/shared/contracts/*.ts`. See root `CLAUDE.md` § Naming for the full convention.

## Do not touch

- `src/db/migrations/` — never hand-edit or bulk-copy from another branch; always append via `pnpm db:generate`. See `INSIGHTS.md` (journal-corruption incident).
- `src/vendor/shared/` — hand-duplicated with `client/src/vendor/shared/`. Keep both in sync manually.
- `pnpm-lock.yaml` — never hand-edit; regenerate via `pnpm install` after a `package.json` change.
