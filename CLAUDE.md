# DevDigest — repo map

Local-first AI PR-review tool. Four standalone packages (no workspace — each has
its own `package.json`/lockfile; cross-package code shares via tsconfig path
aliases, not published modules). Only Postgres runs in Docker.

## Modules

- `client/` — Next.js 15 web app, the studio UI → [client/CLAUDE.md](client/CLAUDE.md)
- `server/` — Fastify + Postgres API, the engine → [server/CLAUDE.md](server/CLAUDE.md)
- `reviewer-core/` — pure review pipeline (diff → LLM → grounded findings), consumed by `server` → [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md)
- `e2e/` — deterministic browser e2e suite (agent-browser, no Playwright/LLM) → [e2e/CLAUDE.md](e2e/CLAUDE.md)

Each module's `CLAUDE.md` loads automatically once you touch files inside that
module — don't duplicate module detail here.

## Root-level references

- [README.md](README.md) — zero-to-running quick start, full architecture diagram
- [TESTING.md](TESTING.md) — cross-module testing & CI strategy
- [docs/agent-prompts/](docs/agent-prompts/) — reviewer prompt variants (security/perf/general)

## Commands

- `./scripts/dev.sh` — Postgres + API (:3001) + web (:3000), seeded
- `./scripts/e2e.sh` — isolated hermetic stack for the e2e suite (alternate ports)
- `docker compose up -d` — Postgres only

## Repo-wide gotchas

- Non-obvious discoveries (gotchas, decisions, recurring fixes) get appended to the touched module's `insights.md` by the `engineering-insights` skill — read that file before deep-diving in a module. Repo-wide findings that don't belong to one module have no dedicated file; propose a `CLAUDE.md` edit instead.
- `server/clones/` — repos cloned at runtime by the review engine; git-ignored, never edit by hand
- `*/src/vendor/` (client, server) — vendored third-party code (`@devdigest/ui`, `@devdigest/shared`); patch upstream, not in place
- **Never `docker compose down -v`** — deletes the `devdigest_pgdata` volume, i.e. every imported repo/review
- Secrets live in `~/.devdigest/secrets.json` (mode `0600`), never in git or the DB — see [server/CLAUDE.md](server/CLAUDE.md)
