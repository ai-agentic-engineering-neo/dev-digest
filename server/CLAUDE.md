# server (`@devdigest/api`) — agent notes

## Commands

```sh
pnpm dev                                           # tsx watch, :3001
pnpm typecheck                                     # tsc --noEmit
pnpm test                                          # everything
pnpm exec vitest run --exclude '**/*.it.test.ts'   # hermetic units only
pnpm exec vitest run .it.test                      # DB-backed only
pnpm db:generate && pnpm db:migrate                # schema change → migration → apply
pnpm db:seed                                       # idempotent demo data
```

## Conventions

- One feature = one `src/modules/<name>/` plugin, registered **statically** in
  `src/modules/index.ts` — deliberately not filesystem autoload, so the same path
  works under tsx, bundler and vitest.
- Routes declare Zod `params`/`body`/response schemas from `@devdigest/shared` via
  `fastify-type-provider-zod`. Invalid input is rejected with `422` **before** the
  handler runs — never hand-roll `Schema.parse(req.body)`.
- Plugins (helmet, cors, rate-limit, SSE) register **before** modules so module
  plugins inherit them and the shared error handler. External I/O goes through an
  adapter behind the DI container (`src/platform/container.ts`) so tests can swap in
  `src/adapters/mocks.ts`.
- Every domain table carries `workspace_id`, scoped by the base-repository guard. A
  new table without it is a bug. Schema changes: edit `src/db/schema.ts`, then
  `pnpm db:generate` — never hand-write a migration file.
- Secrets are read only through `LocalSecretsProvider`
  (`src/adapters/secrets/local.ts`) — `~/.devdigest/secrets.json`, `process.env` as
  fallback, never git or the database. `GITHUB_TOKEN` is canonical, `GITHUB_PAT` a
  fallback. A DB-backed test (imports `test/helpers/pg.ts`) **must** use the
  `*.it.test.ts` suffix or the unit/integration split silently breaks.

## Gotchas

- Migrations are **not** applied on boot. `loadConfig` marks every secret optional —
  the server boots with no keys, so a missing one surfaces at call time, not startup.
- `src/db/schema.ts` already declares **every** table in the product, including ones
  no starter code writes to. An empty table is expected — extend it with new
  columns/tables via new migrations, never by re-migrating existing ones.
- `repo-intel` clones into `server/clones/` — gitignored, exclude it from any search.

## Read when

- Read `insights.md` first for what was already tried here, and append to it when
  something non-obvious comes up. Read `README.md` for the API map and DI flow.
- Read `src/modules/repo-intel/README.md` when touching indexing or the repo map.
- Read `../TESTING.md` before adding a test; `docs/` for deep dives, `specs/` for
  intent on unbuilt work.
