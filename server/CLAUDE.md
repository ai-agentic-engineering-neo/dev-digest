# server/ — @devdigest/api

Fastify 5 + Drizzle ORM over Postgres (pgvector). Imports repos and PRs, indexes
repos with `repo-intel`, runs the reviewer, persists grounded findings. Port 3001.
Adapters sit behind a DI container so tests swap them for mocks.

## Commands

| Task | Command |
|------|---------|
| dev | `pnpm dev` |
| migrate | `pnpm db:migrate` — **not** applied on boot |
| seed | `pnpm db:seed` (idempotent demo data) |
| test (all) | `pnpm test` |
| test unit | `pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| test integration | `pnpm exec vitest run .it.test` (needs Docker) |
| typecheck | `pnpm typecheck` |

## Where things lie

- `src/modules/<name>/` — one Fastify plugin per feature (`routes.ts` + service);
  registered statically in `src/modules/index.ts`.
- `src/platform/` — config, DI container, errors, SSE, model-router, jobs.
- `src/adapters/` — ports and impls (llm, github, git, astgrep, secrets, …) plus
  `mocks.ts` used by tests.
- `src/db/` — Drizzle schema + migrations. The schema already contains every
  course-lesson table; unused ones simply sit empty — don't delete them.
- `src/vendor/shared` — vendored `@devdigest/shared` contracts.

## Hard rules

- A DB-backed test MUST use the `*.it.test.ts` suffix (testcontainers Postgres);
  everything else stays hermetic — the split drives CI workflows.
- Routes validate via zod `params`/`body` schemas (`fastify-type-provider-zod`);
  never hand-roll `Schema.parse(req.body)` inside a handler.
- Secrets never go into `AppConfig`, the DB, or git — they go through
  `SecretsProvider` (`~/.devdigest/secrets.json`, mode 0600); the one read
  chokepoint is `src/adapters/secrets/local.ts`.
- Never edit an applied migration — generate a new one (`pnpm db:generate`).
- Don't edit `src/vendor/` casually — it's vendored; contract changes must be
  mirrored into `client/src/vendor/shared`.

## Gotchas

- An unindexed repo degrades silently to diff-only review (no error).
- `INJECTION_GUARD` is appended to every agent system prompt — prompt-injection
  defense relies on it; don't bypass or reword it.

## Read when …

- Wiring a route/service/adapter, or changing env vars → read [`README.md`](README.md)
  (request & DI flow, API map, environment table).
- Test strategy details → read [`../TESTING.md`](../TESTING.md).
- Working here → read [`INSIGHTS.md`](INSIGHTS.md) first — always before a
  task, especially when debugging something non-obvious; at the end of a
  substantial session, capture learnings per the engineering-insights skill.
- Changing behavior covered by a decision → check [`specs/`](specs/) and update
  the spec in the same PR; how-tos live in [`docs/`](docs/README.md).
