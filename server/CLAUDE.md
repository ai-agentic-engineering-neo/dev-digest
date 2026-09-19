# server — @devdigest/api

Fastify API and host of the review engine. The root `CLAUDE.md` applies; this adds server-only rules.

## Use when

- Adding or changing a route, adapter or env var → read `README.md` (request & DI flow, API map, env table)
- Touching the indexer, repo map, callers or blast radius → read `src/modules/repo-intel/README.md`
- Changing what the model actually sees in a review → read `README.md` § *Review context*, then `../docs/agent-prompts/README.md`
- Implementing a feature → read its spec in `specs/`; write one first if it is missing
- Something surprised you, or a fix was not obvious → `INSIGHTS.md`, through the
  `engineering-insights` skill, which carries the format and the rules
- Need depth the README does not give → `docs/`

## Rules not visible from any single file

- New feature = `modules/<name>/routes.ts` exporting a Fastify plugin, plus one import and one entry
  in `modules/index.ts`. Nothing else changes.
- Routes declare Zod `params`/`body`; invalid input is rejected with 422 **before** the handler runs.
  Never `Schema.parse(req.body)` inside a handler.
- Adapters come from the DI container, never constructed inline; tests swap them through
  `ContainerOverrides` (`platform/container.ts`). The flow itself is diagrammed in `README.md`.
- Context enrichment (repo map, callers) is best-effort: unindexed or throwing → omit that section,
  never fail the review.
- New column: edit `db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`. If a contract field
  becomes required, the inline fixtures in `test/contracts.test.ts` break — fix them in the same change.

## Naming (server-only)

- **`*.it.test.ts` = DB-backed test.** A file importing `test/helpers/pg.ts` needs this suffix:
  without it the unit/integration split breaks silently — the file lands in the wrong suite, and CI
  runs it in the lane that has no Docker.
- Relative imports carry `.js`: `import { buildApp } from './app.js'`. `moduleResolution` is
  `Bundler`, so typecheck does **not** enforce this — it is a house rule, kept because the API runs
  as real ESM under tsx.

## Commands (server-only)

```sh
pnpm db:generate | db:migrate | db:seed            # migrations are NOT applied on boot; seed is idempotent
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, no Docker
pnpm exec vitest run .it.test                      # integration, real Postgres — self-skips without Docker
```
