# server/ — @devdigest/api

Fastify + Drizzle/Postgres backend. Full picture: [README.md](./README.md).

## Stack
Fastify 5, Drizzle ORM + `postgres` (pgvector), Zod via `fastify-type-provider-zod`,
Node ≥22, pnpm ≥10, vitest. Standalone package — own `package.json`/lockfile, no workspace.

## Commands
- `pnpm dev` — API on :3001
- `pnpm build` / `pnpm typecheck`
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:generate`
- Tests: `pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit, no Docker) vs
  `pnpm exec vitest run .it.test` (integration, needs Docker) — see
  [../TESTING.md](../TESTING.md). `pnpm test` runs both.

## What lives where
- `src/modules/<name>/` — one Fastify plugin per feature, registered in `src/modules/index.ts`.
  See [repo-intel/CLAUDE.md](./src/modules/repo-intel/CLAUDE.md).
- `src/adapters/` — LLM/GitHub/git/ast-grep ports behind DI; `mocks.ts` for tests.
- `src/platform/` — DI container, config loading.
- `src/db/` — Drizzle schema + migrations + seed.
- `src/vendor/shared/` — vendored copy of `@devdigest/shared` Zod contracts.
- `docs/` — server-specific design notes. `specs/` — feature specs.

## Layering (Onion Architecture)
Dependencies point inward only: `routes.ts` (edge) → `service.ts` (application) → ports;
`repository.ts` / `adapters/` implement them. Only repositories touch Drizzle; services
take explicit deps, not the whole `Container`. Rules + rationale + sources:
`.claude/skills/onion-architecture/`. Check with `pnpm arch:check` (CI: `server-unit.yml`);
pre-existing violations are ratcheted in `.dependency-cruiser-known-violations.json` —
it may only shrink, never add entries.

## Non-default conventions
- **Migrations do NOT run on boot** — always `pnpm db:migrate` after pulling schema changes.
- **Secrets live in `~/.devdigest/secrets.json`** (mode 0600), never `.env` or the DB;
  read only through `LocalSecretsProvider`.
- **Integration tests must end in `*.it.test.ts`** — anything importing
  `test/helpers/pg.ts` requires that suffix or the unit/integration split breaks.
- **`REPO_INTEL_ENABLED` defaults to `true`** — repo-map context is on unless disabled.

## Gotchas
Running log of non-obvious decisions and hard-won lessons: [INSIGHTS.md](./INSIGHTS.md).
The `engineering-insights` skill keeps this updated proactively — Claude appends
entries as issues are found and during end-of-session wrap-ups, so treat it as
current guidance, not a write-only log.

## Do not touch
- `server/clones/**` — git-ignored runtime data (cloned repos), never hand-edit.
- `src/db/migrations/*` already applied anywhere shared — generate a new migration instead.
- `src/vendor/shared/**` — vendored; changes must be mirrored by hand into `client/src/vendor/shared`.

## Links
[README](./README.md) · [docs/](./docs/) · [specs/](./specs/) · [INSIGHTS.md](./INSIGHTS.md) ·
[repo-intel/CLAUDE.md](./src/modules/repo-intel/CLAUDE.md) · [Testing strategy](../TESTING.md) ·
[Root CLAUDE.md](../CLAUDE.md)
