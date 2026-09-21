# server — `@devdigest/api`

## Commands (pnpm)
- `pnpm dev` (:3001) · `pnpm typecheck`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker): `pnpm exec vitest run .it.test`
- DB: `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate` (after schema change)

## Read when
- Adding/changing a route, plugin or env var → read `README.md` (DI flow, API map, env table)
- Changing what gets sent to the model → read `README.md#review-context-non-obvious`
- Touching indexing, repo map, ranking → read `src/modules/repo-intel/README.md`
- Implementing a planned feature → look for its spec in `specs/`
- Before any change → read `INSIGHTS.md` (high-confidence guidance; append via `/engineering-insights`)

## Conventions (non-default)
- A feature = `src/modules/<name>/` plugin, registered statically in `src/modules/index.ts`.
- Validation is schema-first: zod `params`/`body` on the route
  (fastify-type-provider-zod). Never `Schema.parse(req.body)` in a handler.
- All outside I/O (LLM, GitHub, git, ast-grep, secrets) goes through adapters in
  the DI container (`src/platform/container.ts`); test doubles live in `src/adapters/mocks.ts`.
- A test that imports `test/helpers/pg.ts` **must** be named `*.it.test.ts`.

## Gotchas
- Secrets are not in `AppConfig`: read them only via `LocalSecretsProvider`
  (`~/.devdigest/secrets.json`, env fallback).
- The DB schema already has tables for every future lesson — empty ≠ unused.
- An unindexed repo silently degrades the prompt to diff-only.
- `server/package.json` is `skip-worktree` locally; CI calls `pnpm exec vitest …`
  instead of package scripts.

## Do not touch
- Committed migrations in `src/db/migrations/` — generate a new one instead.
- Prompt-injection guard and grounding semantics — they live in `reviewer-core`;
  read `../reviewer-core/CLAUDE.md` first.
