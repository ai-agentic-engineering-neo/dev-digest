# DevDigest (starter)

Local-first AI pull-request reviewer. Course starter: features come back milestone by milestone (M1–M8, see README → Roadmap).

## Stack
Node 22 (CI-pinned, no `engines`) · pnpm ≥10 · TypeScript 5.9 · Zod **3.x** (do not use v4 API) · Fastify 5 · Drizzle 0.45 + Postgres 16/pgvector · Next 15 + React 19 · TanStack Query 5 · vitest 2

## Map
- `server/`        API + DB + repo-intel indexer → [server/CLAUDE.md](server/CLAUDE.md)
- `client/`        Next.js studio UI             → [client/CLAUDE.md](client/CLAUDE.md)
- `reviewer-core/` pure review engine (no I/O)   → [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md)
- `e2e/`           agent-browser UI flows        → [e2e/CLAUDE.md](e2e/CLAUDE.md)

Before editing files in a package, read that package's CLAUDE.md and its `INSIGHTS.md` (short, dated lessons from past sessions). At the end of a task, run `/engineering-insights` to append new non-obvious findings to that package's `INSIGHTS.md`; do not skip this step.

## Commands
- Full stack from zero: `./scripts/dev.sh` (flags: `--no-seed` `--no-client` `--db-only`)
- Per package: `pnpm test` / `pnpm typecheck` in server, client · `npm test` / `npm run typecheck` in reviewer-core, e2e

## Gotchas
- NOT a monorepo: no workspace, each package has its own lockfile. **pnpm** in server/client, **npm** in reviewer-core/e2e.
- Cross-package imports go through tsconfig path aliases (`@devdigest/shared`, `@devdigest/reviewer-core`, `@devdigest/ui`), never relative `../../other-package`.
- `@devdigest/shared` exists TWICE: `server/src/vendor/shared` (source of truth) and `client/src/vendor/shared` (manual copy, already drifted). Changing a contract the UI uses → mirror it into the client copy.
- The DB schema already contains tables for future milestones. Empty ≠ unused — don't drop them.

## Do not touch
- Existing files in `server/src/db/migrations/**` (generated; add new ones via `pnpm db:generate`)
- Lockfiles by hand
- Never `docker compose down -v` — it deletes the dev DB volume with all imported repos

## Per-package layout
Each package has: `CLAUDE.md` (map) · `README.md` (human docs) · `docs/` (how it works now) · `specs/` (what we are building) · `INSIGHTS.md` (dated discoveries & decisions, read on demand).

## Deeper
Architecture & review flow: [README.md](README.md) · Testing strategy: [TESTING.md](TESTING.md) · Cross-package insights: [INSIGHTS.md](INSIGHTS.md) · Agent prompts: [docs/agent-prompts/](docs/agent-prompts/README.md) · Cross-package specs: [specs/](specs/)
