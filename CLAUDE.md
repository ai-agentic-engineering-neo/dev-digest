# DevDigest

Local-first AI pull-request review. Four standalone packages, **no monorepo
workspace** — each has its own `package.json` and lockfile; cross-package code is
shared through tsconfig path aliases, never published modules.

## Before answering

**Open the document that covers the task before you answer or edit anything.**
The table below is a routing map, not a substitute for reading the file.

| If the task touches… | Read first |
|---|---|
| anything under `client/` `server/` `reviewer-core/` `e2e/` | that module's `CLAUDE.md`, then its `README.md` |
| the end-to-end review flow, or "how does X reach Y" | `README.md` — architecture diagram |
| any test, or deciding where a test belongs | `TESTING.md` |
| a reviewer system prompt, or choosing a model | `docs/agent-prompts/README.md` |
| a course-lesson feature (L01–L08) | `specs/` — see its README for the index |
| a bug that smells like one we've seen | `INSIGHTS.md` |

Subdirectory auto-load is unreliable in the VS Code extension
(anthropics/claude-code#24987) — **open the module `CLAUDE.md` explicitly.**
If nothing in the table matches, proceed without reading.

## Stack

Node ≥22 · TypeScript · Fastify 5 · Drizzle + Postgres/pgvector · Next.js 15
(App Router) · React 19 · TanStack Query · Zod · vitest · Docker (Postgres only).

## Commands

| | |
|---|---|
| everything up | `./scripts/dev.sh` — flags `--no-seed` `--no-client` `--db-only` |
| server | `cd server && pnpm dev` (`:3001`) · `pnpm db:migrate` · `pnpm db:seed` |
| client | `cd client && pnpm dev` (`:3000`) |
| test one package | `cd <pkg> && pnpm test` (server, client) / `npm test` (reviewer-core, e2e) |
| typecheck | same, `typecheck` |

## Map

| Folder | Package | What | PM |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, Postgres, `repo-intel` indexer | pnpm |
| `client/` | `@devdigest/web` | Next.js studio | pnpm |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure engine: diff → prompt → LLM → findings | npm |
| `e2e/` | `@devdigest/e2e` | deterministic browser flows | npm |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod contracts, one definition for every package | — |

## Conventions

- Contracts are defined **once** in `@devdigest/shared` and reused as Fastify route
  schemas and as client types. Never redeclare a shape locally.
- No workspace: install inside the package, never `pnpm -r`. `server`/`client` use
  **pnpm**, `reviewer-core`/`e2e` use **npm** — match the lockfile that is there.
- One test suite per package, one CI workflow per suite, path-filtered.

## Gotchas

- **Migrations do not run on boot.** `relation … does not exist` → `cd server && pnpm db:migrate`.
- **Never `docker compose down -v`** — it drops the `devdigest_pgdata` volume along with
  every repo and review that was imported.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600), never in git or the database.
- The starter is deliberately minimal; most features are added back lesson by lesson.
  A missing screen is usually not a bug — check the lesson table in `README.md`.

## Do not touch

`*/src/vendor/**` (vendored copies) · `server/src/db/migrations/**` including the journal
(generate with `pnpm db:generate`, never hand-edit) · `skills-lock.json`
