# server — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Fastify 5, Drizzle ORM 0.38 + `postgres` (pgvector), TS 5.7. Layout: `src/platform` (cross-cutting), `src/adapters` (external integrations), `src/modules` (feature modules), `src/db` (schema + migrations). Build: `pnpm build` (tsc). Test: `pnpm test`. DB: `pnpm db:generate` (drizzle-kit), `pnpm db:migrate`, `pnpm db:seed`.

## Read when

- changing DB schema → `docs/README.md`, then check `specs/` for feature spec
- adding a route → `docs/README.md` for routing pattern
- hit repeated bug/gotcha → `INSIGHTS.md` first

## Do not touch

- `src/db/migrations/` — never hand-edit or bulk-copy from another branch; always append via `pnpm db:generate`. See `INSIGHTS.md` (journal-corruption incident).
- `src/vendor/shared/` — hand-duplicated with `client/src/vendor/shared/`. Keep both in sync manually.
