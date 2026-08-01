# `@devdigest/api` — agent guide

Fastify 5 + Drizzle/Postgres. Imports repos and PRs, indexes with `repo-intel`, runs
the reviewer through `@devdigest/reviewer-core`.

## Before answering

Curated docs here today: `INSIGHTS.md` (this package's traps), `README.md` (API map,
DI flow, env table, review context), `../TESTING.md`, and the root `../INSIGHTS.md`
for anything crossing packages. No `docs/` or `specs/` in this package yet — read
those first, then code.

## Conventions (not obvious from code)

- **Add a module** = create `src/modules/<name>/routes.ts` exporting a default Fastify plugin, then one import + one entry in `src/modules/index.ts`. Registration is static on purpose (same path under tsx, bundler, and vitest).
- **ESM**: relative imports carry the `.js` extension. Single quotes.
- **`platform/prompt.ts`, `platform/grounding.ts`, `platform/structured.ts` are re-export shims** over `@devdigest/reviewer-core`. Fix the engine, never the shim.
- **`@devdigest/reviewer-core` is consumed as TypeScript source** via tsconfig path alias (`../reviewer-core/src`) — no build step, no published artifact.
- **Validation is schema-first**: routes declare zod `params`/`body` via `fastify-type-provider-zod`; invalid input 422s before the handler. Don't hand-roll `Schema.parse(req.body)`.
- **Plugins register before modules** so encapsulated module plugins inherit helmet/cors/rate-limit/SSE and the shared error handler.
- **Secrets are not config.** API keys and `GITHUB_TOKEN` go through `SecretsProvider` (`~/.devdigest/secrets.json`, mode `0600`, `process.env` fallback) — not `AppConfig`, not the DB.
- **Migrations are not applied on boot** — `pnpm db:migrate`. Generate with `drizzle-kit`, never hand-write.
- **DB-backed tests must be named `*.it.test.ts`** — that suffix is what splits the unit and integration lanes. Everything else must be hermetic; mock via `src/adapters/mocks.ts`.
- `NODE_ENV=test` silences logs and disables the global rate limit.
- There are no committed `test:unit` / `test:integration` scripts — CI calls the split as `pnpm exec vitest run …`. (`../TESTING.md` blames `skip-worktree` for this; that flag is not actually set in a fresh clone — see `../INSIGHTS.md`.)

## Do-not-touch

- `src/db/migrations/` — generated; edit the schema in `src/db/schema/` and regenerate.
- `src/vendor/shared/` — canonical `@devdigest/shared`; mirrored by hand into `client/src/vendor/shared/`.
- `clones/` — runtime data, git-ignored.

## Use when

- API map, env vars, DI flow, review-context rules → `README.md`
- Test lanes and what each covers → `../TESTING.md`
- Prompt wording and how the system message is assembled → `../docs/agent-prompts/`
- Fastify / Drizzle / Postgres / Zod idioms → `../.claude/skills/`
