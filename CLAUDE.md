# DevDigest

Local-first AI PR review. 4 standalone packages, NOT a workspace: each has its own
package.json + lockfile. Overview and architecture: [README.md](README.md).

## Modules — read the module's CLAUDE.md before editing there
| Path | What | Guide |
|---|---|---|
| server/ | Fastify API + Postgres, :3001 | [server/CLAUDE.md](server/CLAUDE.md) |
| client/ | Next.js web app, :3000 | [client/CLAUDE.md](client/CLAUDE.md) |
| reviewer-core/ | Pure review engine (diff → LLM → findings) | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| e2e/ | Browser e2e (agent-browser, no LLM) | [e2e/CLAUDE.md](e2e/CLAUDE.md) |

## Stack
Node ≥22 · pnpm 10 (server, client) · npm (reviewer-core, e2e) · TypeScript 5.9 ·
Zod 3.25 · Vitest 2.1 · Postgres 16 + pgvector (Docker)

## Commands
- Run everything: `./scripts/dev.sh` (flags: `--no-seed --no-client --db-only`)
- Per package, from inside its folder: `typecheck`, `test`
- Test strategy and CI matrix: [TESTING.md](TESTING.md)

## Conventions
- Code is shared through tsconfig path aliases, not published packages
  (`@devdigest/shared` → server/src/vendor/shared, `@devdigest/reviewer-core` → reviewer-core/src).
- Install deps inside each package, never from the repo root.

## Gotchas
- Zod contracts exist twice: `server/src/vendor/shared` and `client/src/vendor/shared`.
  They have already drifted. Changing a contract → update both copies.
- Only Postgres runs in Docker. API and web run on the host.
- Never `docker compose down -v`: it deletes the dev DB volume with all imported repos.

## Where to look (linked, not loaded — open only when relevant)
- Feature work → `<module>/specs/` first.
- Deeper docs → `<module>/docs/` · [docs/](docs/) · agent prompts: [docs/agent-prompts/](docs/agent-prompts/)
- Known pitfalls → `<module>/INSIGHTS.md` · [INSIGHTS.md](INSIGHTS.md)
- After the user's first prompt and before any work, identify the module and read its INSIGHTS.md (root INSIGHTS.md for cross-module topics); name the 2–3 relevant entries.
- At the end of a task run /engineering-insights: re-read first, add only significant insights not already recorded, otherwise write nothing. Never overwrite existing entries.
