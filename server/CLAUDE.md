# server — agent map

Fastify API + Drizzle/Postgres (pgvector). Clones/indexes repos, serves PRs, orchestrates LLM reviews via `reviewer-core`.

## Stack

Fastify 5.2 · Drizzle ORM 0.38 (Postgres/pgvector) · Zod 3.24 (`fastify-type-provider-zod`) · TypeScript 5.7 · Vitest 2.1

## Commands

- `pnpm dev` · `pnpm build` · `pnpm typecheck`
- `pnpm db:migrate` (**not** run on boot — must run manually) · `pnpm db:seed` · `pnpm db:generate`
- Tests split by filename: `pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic) vs `.it.test` (real Postgres, testcontainers)

## Map

| dir | what's there |
|---|---|
| `src/adapters` | external integrations (GitHub, LLM providers) |
| `src/db` | Drizzle schema + migrations |
| `src/modules/repo-intel` | codebase indexer (powers the *Indexed* badge) |
| `src/platform` | server bootstrap / infra config |
| `src/prompts` | agent system prompts |
| `src/vendor` | synced shared code — see Do-not-touch |

## Conventions (non-default)

- `*.it.test.ts` = integration (needs Postgres); everything else is hermetic unit
- `src/vendor/shared` (`@devdigest/shared`) is the single source of truth for Zod contracts shared with `client` and `reviewer-core` — change the type there, not locally

## Gotchas

- Server does **not** migrate the DB on boot — skipping `pnpm db:migrate` shows up as `relation ... does not exist`
- pgvector is enabled by migration `0000` — fails silently against a non-Dockerized/foreign Postgres

## Do-not-touch

- `src/vendor/` — synced from elsewhere; local edits get overwritten

## Session Protocol

- **Start:** before working here, read [INSIGHTS.md](./INSIGHTS.md) and note anything relevant to the task.
- **End:** before finishing, invoke `engineering-insights` — write a new entry only if something substantial and not already recorded came up.

## Docs

- [README.md](./README.md) — API map, deeper diagrams
- [docs/](./docs/) — reference material too detailed for this file
- [docs/specs/](./docs/specs/) — feature specs (SDD)
- [INSIGHTS.md](./INSIGHTS.md) — running log of decisions/gotchas
