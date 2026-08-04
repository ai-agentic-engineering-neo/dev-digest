# server/ — @devdigest/api

Fastify 5 + Drizzle ORM + Postgres (pgvector). Port 3001. Repo-wide rules:
[../CLAUDE.md](../CLAUDE.md).

## Stack

Fastify 5 · Drizzle ORM · `postgres` · `fastify-type-provider-zod` · Octokit ·
simple-git · ast-grep/dependency-cruiser/graphology (repo-intel) ·
OpenAI/Anthropic SDKs.

## Commands

`pnpm dev` (:3001) · `pnpm typecheck` · `pnpm db:migrate` · `pnpm db:seed`
Tests split: `pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit, no
Docker) vs `pnpm exec vitest run .it.test` (integration, real Postgres via
testcontainers).

## Where things live

- `src/modules/<name>/` — one Fastify plugin per domain (routes+service+repo)
- `src/platform/container.ts` — DI container; services depend on ports, not
  concrete adapters
- `src/adapters/` — port implementations; swapped for `src/adapters/mocks.ts`
  in tests
- `src/db/schema/` — Drizzle schema, one file per domain

## Non-default conventions

- Routes validate via zod `params`/`body` — invalid input gets a 422 **before**
  the handler runs; don't hand-roll `Schema.parse(req.body)`.
- A DB-backed test file MUST end in `*.it.test.ts` or the unit/integration
  split silently miscounts it.
- `reviewer-core` is consumed as TS **source** via a path alias, never built.

## Gotchas

- First-run 500s ("relation ... does not exist") = forgot `pnpm db:migrate`
  (the server does not migrate on boot).
- `REPO_INTEL_ENABLED` defaults to true; an unindexed repo silently degrades
  prompts to diff-only — don't assume the repo-map section is present.

## Session protocol

- Before work: skim [INSIGHTS.md](INSIGHTS.md); name the top relevant points.
- After a non-trivial task: run the `engineering-insights` skill.

## Docs map

- [README.md](README.md) — DI/request flow diagram, API map, env vars
- [INSIGHTS.md](INSIGHTS.md) — dev log: decisions/gotchas found while working here
