# DevDigest

Local-first AI pull-request review: diff → prompt → LLM → grounded findings.
**Course starter template.** `main` is deliberately trimmed; lessons L01–L08 add
features back. Homework lives in forks — never commit it to `main`.

## Stack

Node ≥22 · pnpm ≥10 · TypeScript 5.7 (`strict`, `noUncheckedIndexedAccess`)
Fastify 5 · Drizzle 0.38 · Postgres 16 + pgvector · Next.js 15 · React 19 · Zod 3 · Vitest 2

## Modules — four standalone packages, NOT a pnpm workspace

| Path | Package | Port |
|---|---|---|
| `server/` | `@devdigest/api` | 3001 |
| `client/` | `@devdigest/web` | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | — |
| `e2e/` | `@devdigest/e2e` | — |

Packages are linked ONLY through tsconfig path aliases pointing at a sibling's
*source*. Nothing is published; `reviewer-core` never emits JS (`build` = `tsc --noEmit`).

## Read when

- **Working inside any module** → read that module's `CLAUDE.md` first
  (`server/`, `client/`, `reviewer-core/`, `e2e/`). Module conventions live there
  and are never duplicated here.
- **Following the review pipeline end to end** → read `docs/architecture.md`.
- **Adding or changing an API route** → read `server/README.md` for route contracts.
- **Writing or fixing tests** → read `TESTING.md`.
- **Starting a lesson task** → read `specs/lessons/<Lxx>.md`.
- **Hitting behaviour that looks like a known trap** → read the nearest
  `INSIGHTS.md` (module-level first, then this directory).

## Insights loop

**Session Context.** Before working in a module, read its `INSIGHTS.md`
(module-level first, then this directory) and say in one line what you read.
Treat it as high-confidence guidance unless told otherwise.

**End of Session.** Run the `engineering-insights` skill to record what was
learned. Do not skip this step. If nothing non-obvious happened, say so and
stop — recording noise is worse than recording nothing.

## Commands

```sh
./scripts/dev.sh              # Postgres + migrations + seed + both servers
docker compose up -d          # Postgres only
cd server && pnpm db:migrate  # REQUIRED manually — never runs on boot
cd server && pnpm db:seed     # idempotent; without it the API fails "No system user"
pnpm test / pnpm typecheck    # per package
./scripts/e2e.sh              # browser flows
```

Server tests split by filename: `*.it.test.ts` need Docker, everything else is hermetic.

## Gotchas

- Migrations never run on boot. `relation ... does not exist` → `pnpm db:migrate`.
- `@devdigest/shared` exists in TWO physical copies — `server/src/vendor/shared/`
  and `client/src/vendor/shared/` — and they have already drifted. Change a
  contract → change both in the same commit. `reviewer-core` reads the server copy.
- The DB schema holds tables for EVERY lesson (skills, eval, ci, memory, …).
  Empty does not mean dead.
- zod can be loaded twice — never rely on `instanceof z.ZodError` alone.
- No auth: `LocalNoAuthProvider` always returns workspace `default`. Every table
  still carries `workspace_id` — always scope through `getContext()`.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600), not in the DB.
  `LocalSecretsProvider` is the only read chokepoint.
- `server/` and `client/` use pnpm; `e2e/` and `reviewer-core/` use npm.

## Do not touch

- `*/src/vendor/**` — vendored code. Edit only on an explicit request.
- `server/src/db/migrations/**` — never edit applied migrations; use `pnpm db:generate`.
- `T1`/`T2`/`T3` and `acceptance #N` comments are development-plan artifacts, not TODOs.
