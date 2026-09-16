# DevDigest — repo map

Course starter: local-first AI PR review, four **standalone packages** (no
workspace tool — each has its own `package.json`/lockfile; cross-package code
is shared via tsconfig path aliases, not published modules).

## Stack

Node ≥22 · pnpm ≥10 (`client/`, `server/`) / npm (`reviewer-core/`, `e2e/`) ·
TypeScript everywhere · Postgres + pgvector (Docker).

## Structure

| Folder | Package | What it is | Port |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify + Drizzle/Postgres | 3001 |
| `client/` | `@devdigest/web` | Next.js 15 studio UI | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine | — |
| `e2e/` | `@devdigest/e2e` | Deterministic browser e2e | — |

## Commands

- `./scripts/dev.sh` — full local stack (Postgres + API + web); `--no-seed` / `--no-client` / `--db-only`.
- `./scripts/e2e.sh` — isolated hermetic stack for e2e (alternate ports).

## Naming conventions

- Package folder names match their npm scope suffix (`server/` → `@devdigest/api`, `client/` → `@devdigest/web`, `reviewer-core/` → `@devdigest/reviewer-core`, `e2e/` → `@devdigest/e2e`) — don't rename a folder without updating every tsconfig path alias that points at it.
- Every package exposes the same script names — `dev`, `build`, `test`, `typecheck` — regardless of runner (pnpm vs npm); keep new packages consistent with this.
- See `<module>/CLAUDE.md` for that module's file/test naming conventions.

## Read when

- `README.md` — architecture diagram, quick start, troubleshooting.
- `TESTING.md` — cross-package test strategy, suite-per-package map, CI workflows.
- `docs/agent-prompts/` — reviewer system-prompt patterns and model choice.
- `<module>/CLAUDE.md` — auto-loads when working inside that module; don't duplicate it here.

## Non-default conventions / gotchas

- Server does **not** run migrations on boot — `cd server && pnpm db:migrate` is manual.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600), never in git/DB; `process.env` is the fallback.
- `server/package.json` is `skip-worktree` (a local variant diverges from the committed file) — CI invokes `vitest` directly rather than package scripts.
- This is the **course starter**: features listed as later lessons (L02+) in `README.md`'s lesson table are intentionally absent — don't treat their absence as a bug.

## Do not touch

- `server/src/vendor/shared`, `client/src/vendor/ui` — vendored, shared across packages; edit at the source lesson, not ad hoc.
- `server/clones/**` — git-ignored runtime data (cloned repos), never a test fixture.
- Lock files — `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json` — never hand-edit; regenerate only via `pnpm install` / `npm install` after changing that package's `package.json`.
- `server/src/db/migrations/**` — see `server/CLAUDE.md`.
