# server — `@devdigest/api`

## Commands (pnpm)
- `pnpm dev` (:3001) · `pnpm typecheck` · `pnpm lint` (Biome, root `../biome.jsonc`)
- Unit (no Docker): `pnpm test:unit` · Integration (Docker): `pnpm test:integration`
- Layering: `pnpm arch:check` (dependency-cruiser, also in CI)
- DB: `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate` (after schema change)

## Read when
- Adding/changing a route, plugin or env var → read `README.md` (DI flow, API map, env table)
- Changing what gets sent to the model → read `README.md#review-context-non-obvious`
- Touching indexing, repo map, ranking → read `src/modules/repo-intel/README.md`
- Refactoring a module to the onion layout → read `docs/onion-migration.md` (baseline per module, steps)
- Adding/moving a module, route, use case, repository or adapter → skill `onion-architecture`;
  check layers with `pnpm arch:check`
- Implementing a planned feature → look for its spec in `specs/`
- Start of every task here → read `INSIGHTS.md` first; at the end → `engineering-insights` wrap-up

## Conventions (non-default)
- A feature = `src/modules/<name>/` plugin, registered statically in `src/modules/index.ts`;
  its services + job handlers are built ONLY in `modules/<name>/composition.ts`
  (`build<Name>Module(container)`, listed in `src/modules/composition.ts`). Routes read
  `app.container.modules.<name>.service`; don't edit `platform/container.ts` for module wiring.
- Throw error classes from `platform/errors.ts` (NotFoundError, InvalidInputError, ConflictError…),
  never an HTTP status; the kind → status table lives only in `src/http/error-handler.ts`.
- Job handlers get `{ jobId, signal }`; forward `signal` to git/SDK calls. Log errors as `{ err }`.
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
- `src/vendor/shared` is the source of truth for `@devdigest/shared`; the client
  copy must stay identical — after a contract change run
  `cp -r src/vendor/shared/. ../client/src/vendor/shared/` and `../scripts/check-shared-drift.sh`.

## Do not touch
- Committed migrations in `src/db/migrations/` — generate a new one instead.
- Prompt-injection guard and grounding semantics — they live in `reviewer-core`;
  read `../reviewer-core/AGENTS.md` first.
