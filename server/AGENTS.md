# server — AGENTS.md

`@devdigest/api`: Fastify 5 + Drizzle/Postgres, pnpm. Owns DB, GitHub, git clones and LLM wiring; the review logic itself lives in `reviewer-core`.

## Commands (`cd server`)
```sh
pnpm dev | pnpm typecheck | pnpm build
pnpm db:migrate       # NOT run on boot
pnpm db:seed          # idempotent
pnpm db:generate      # new migration from src/db/schema/*.ts
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, hermetic
pnpm exec vitest run .it.test                      # integration, needs Docker
```

## Map
`src/server.ts` → `src/app.ts` (`buildApp`) → `src/modules/index.ts` (static registry)
`src/modules/<name>/` · `src/platform/` (config, DI container, errors, grounding) · `src/adapters/` (+ `mocks.ts`) · `src/db/` · `src/vendor/shared/`

## Conventions
- Module = `routes.ts` (default-export Fastify plugin) + `service.ts` + `repository.ts`; `helpers.ts`/`constants.ts` optional. Register new modules in `src/modules/index.ts`; there is no autoload.
- Validate with Zod via `withTypeProvider<ZodTypeProvider>()`; reuse `@devdigest/shared` schemas.
- Tenancy: `getContext(app.container, req)`; every repository query filters by `workspaceId`.
- Relative imports end in `.js`.
- Throw `AppError` subclasses (`platform/errors.ts`); errors return `{ error: { code, message, details } }`.
- Secrets only via `container.secrets`; other env only via `platform/config.ts` (`loadConfig`). No `process.env` in feature code.
- Shared contracts: add a new file in `vendor/shared/contracts/` exporting schema + type under one name; don't reshape existing ones.
- Tests: hermetic ones use `src/adapters/mocks.ts`; DB-backed ones must be named `*.it.test.ts`.

## Do not touch
- `src/db/migrations/**` (incl. `meta/`): never edit, rename or delete; change the schema and run `pnpm db:generate`.

## Gotchas
- `relation ... does not exist` → migrations weren't applied.
- `pnpm start` needs `pnpm build`; without a build use `pnpm exec tsx src/server.ts`.
- `Host` outside localhost/127.0.0.1/::1 + `API_ALLOWED_HOSTS` → 403 `forbidden_host`; CORS allows only `http://localhost|127.0.0.1:${WEB_PORT}`.
- Rate limit (120/min) is off when `NODE_ENV=test`; an empty `LOG_LEVEL=` means default.
- `app.ts` matches ZodError by shape on purpose (duplicate zod instances). Don't simplify.
- Boot marks every `running` agent run as orphaned → one API instance per DB.
- Seeded agents use `openrouter` / `deepseek/deepseek-v4-flash` → a real review needs `OPENROUTER_API_KEY`.
- Don't rely on `test:unit` / `test:integration` scripts: `package.json` may be `skip-worktree` locally.

## Read when
- Read `README.md` when adding or changing a route (API map), DI flow, env vars, or what goes into the review prompt.
- Read `src/modules/repo-intel/README.md` before touching indexing, the repo map or the `repoIntel` facade.
- Read `../TESTING.md` before adding a test.
- Read `docs/` for server reference that doesn't fit the README.
- Read `specs/` before implementing a server feature; write the spec first if missing.
- Read `INSIGHTS.md` before any work in this package (root Insights protocol); add entries only via the `engineering-insights` skill.
