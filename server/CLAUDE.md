# server (@devdigest/api) — agent map
Inherits the root `CLAUDE.md`; only server-specific rules here.

## Commands (pnpm)
- `pnpm dev` (:3001) · `pnpm typecheck` · `pnpm build`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker): `pnpm exec vitest run .it.test`
- `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`

## Layout
- `src/modules/<name>/` — feature plugins (routes → service → repository)
- `src/modules/repo-intel/` — codebase indexer, read only through its facade
- `src/platform/` — config, DI container, errors, SSE, run logging
- `src/adapters/` — ports (llm, github, git, astgrep, …) + `mocks.ts` for tests
- `src/db/` — Drizzle schema, migrations, seed
- `src/vendor/shared/` — Zod contracts (`@devdigest/shared`)

## Conventions
- Route schemas are Zod contracts via `fastify-type-provider-zod` — no manual
  `Schema.parse(req.body)` in handlers.
- New module → register it explicitly in `src/modules/index.ts`.
- Tests mock the outside world through `src/adapters/mocks.ts`, never real keys.

## Gotchas
- Migrations are **not** applied on boot — run `pnpm db:migrate`.
- A test that imports `test/helpers/pg.ts` **must** be named `*.it.test.ts`,
  otherwise it lands in the hermetic unit lane.
- `package.json` is `skip-worktree` — don't commit it, don't rely on
  `test:unit` / `test:integration` scripts.
- `src/platform/{grounding,prompt,structured}.ts` are re-export shims — change the
  logic in `reviewer-core/src`, not here.
- An unindexed repo silently degrades the review to diff-only.

## Do not touch
- Applied migrations in `src/db/migrations/` — add new ones via `pnpm db:generate`
- `clones/**` — runtime data

## Read when
- Adding or changing a route → read `README.md` §API map and §Request & DI flow
- Changing what goes into the review prompt → read `README.md` §Review context
- Touching repo-intel → read `src/modules/repo-intel/README.md`
- Adding an env var or secret → read `README.md` §Environment
- Design question → read `docs/`
- Implementing a feature → read its spec in `specs/`
- Before finishing → check `INSIGHTS.md`; append new lessons
