# DevDigest — CLAUDE.md

Course starter: local-first AI pull-request review. The repo is 4 independent
packages (NOT a monorepo, no workspaces) — each with its own `package.json`,
lockfile, and its own `CLAUDE.md`.

## Read when

- Working inside a specific module → read `<module>/CLAUDE.md` (`client/`,
  `server/`, `reviewer-core/`, `e2e/`) — it has that module's stack, commands,
  gotchas, and do-not-touch zones. Claude Code auto-loads it whenever it
  touches a file inside that folder.
- Need to understand how the modules talk to each other (diff → repo-intel →
  reviewer-core → LLM → findings), or why this isn't a monorepo →
  read [docs/architecture.md](docs/architecture.md).
- Need the API route contracts → read [server/README.md](server/README.md).
- Need past decisions/lessons for a specific module → read
  `<module>/INSIGHTS.md`.
- Need to run the project from scratch → read [README.md](README.md) (Quick
  start section) or just run `./scripts/dev.sh`.

## Modules

- [client/](client/CLAUDE.md) — Next.js 15 studio, `:3000`
- [server/](server/CLAUDE.md) — Fastify API + Postgres/pgvector, `:3001`
- [reviewer-core/](reviewer-core/CLAUDE.md) — pure review engine (diff → LLM → findings)
- [e2e/](e2e/CLAUDE.md) — deterministic browser tests (agent-browser)
