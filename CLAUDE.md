# DevDigest — root map

Course starter: local-first AI PR review. Full narrative, architecture diagram,
lesson roadmap: [README.md](README.md).

## Stack

Node ≥22 · pnpm ≥10 · Docker (Postgres only — API and web run on the host).
Fastify 5 + Drizzle/Postgres (pgvector) · Next.js 15 / React 19. Shared Zod
contracts via tsconfig path aliases, not a real workspace.

## Commands

- `./scripts/dev.sh` — full local stack from zero (`--no-seed` `--no-client` `--db-only`)
- `./scripts/e2e.sh` — hermetic e2e stack, isolated ports/DB, never touches your dev DB
- Per-package: `pnpm dev` / `pnpm test` / `pnpm typecheck` — see each README

## Map

| Module | README | CLAUDE.md | Port |
|---|---|---|---|
| server | [server/README.md](server/README.md) | [server/CLAUDE.md](server/CLAUDE.md) | 3001 |
| client | [client/README.md](client/README.md) | [client/CLAUDE.md](client/CLAUDE.md) | 3000 |
| reviewer-core | [reviewer-core/README.md](reviewer-core/README.md) | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) | — |
| e2e | [e2e/README.md](e2e/README.md) | [e2e/CLAUDE.md](e2e/CLAUDE.md) | — |

Read when you need the call path through the layers, the review-run lifecycle,
or where state lands: [docs/architecture.md](docs/architecture.md).
Read when testing/CI questions come up: [TESTING.md](TESTING.md).
Read when working on agent system prompts: [docs/agent-prompts](docs/agent-prompts/).
Read when building a feature that has one: [specs/](specs/) — one file per
feature, written before the code (used from ~L03/L05).

There is no root `LEARNINGS.md` — each module keeps its own (linked in the Map
above), right next to the code it's about. **Read the `LEARNINGS.md` of the
module you're about to work in before you start** — treat it as
high-confidence guidance unless it's obviously stale.

## Conventions (non-default)

- No monorepo workspace: each package has its own `package.json` + lockfile;
  shared code goes through tsconfig `paths`, not published packages.
- DB migrations are **not** applied on boot — always `cd server && pnpm db:migrate`
  after pulling schema changes.
- Secrets never live in git or the DB — `~/.devdigest/secrets.json` (mode `0600`)
  is the one source, with `process.env` as fallback.

## Do-not-touch / edit-with-care

- `server/src/vendor/shared` and `client/src/vendor/shared` are **independent
  copies**, not auto-synced — `reviewer-core`'s path alias points straight at
  the server copy, but client's has already drifted (e.g. missing the
  `openrouter` provider id, missing `CommitFile`/`CommitFilesPayload`). Editing
  shared contracts means updating both vendor/shared dirs and reconciling by hand.
- `server/clones/` — real cloned repos on disk (git-ignored); don't hand-edit.

## Gotchas

- `docker compose down -v` deletes the `devdigest_pgdata` volume — wipes every
  imported repo and review. Use `docker compose down` (no `-v`) to just stop.
- e2e flows `02`/`04`/`05` assume a DB seeded with only the one demo repo — run
  `./scripts/e2e.sh` (hermetic), not `e2e && npm test` against your real dev DB,
  unless you know it holds only the seed data.
- Per-module `CLAUDE.md` files are meant to auto-load when you touch files in
  that folder (mechanism #3 — AUTO). There's a known VS Code-extension bug
  (#24987) where this doesn't always trigger. If module-specific rules seem
  ignored, open that module's `CLAUDE.md` via the Map above explicitly.

## Before you finish

Finished a substantive task (bug fix, non-trivial change, discovery)? Append
what a future session would need to the touched module's `LEARNINGS.md` — via
the `engineering-insights` skill or `/engineering-insights`. Read it first and
extend an existing entry rather than duplicating it; if nothing non-obvious
came up, write nothing. Don't skip this step.
