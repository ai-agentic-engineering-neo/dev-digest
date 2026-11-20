# DevDigest

Local-first AI pull-request reviewer. This is a **starter template**: one flow works
end to end (add repo → import PR → agent review → grounded findings). Milestones
M1–M8 add features back (README → Roadmap) — missing features are expected, not bugs.

## Stack
Node ≥ 22 · TypeScript 5.9 · Zod 3 · vitest 2 · Postgres 16 + pgvector (Docker — the
only container; API and web run on the host). Per-package stack → module CLAUDE.md.

## Map
| Folder | Package | Role | Port | PM |
|---|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, Drizzle/Postgres, repo-intel indexer | 3001 | pnpm |
| `client/` | `@devdigest/web` | Next.js 15 studio | 3000 | pnpm |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine: diff → prompt → LLM → grounded findings | — | npm |
| `e2e/` | `@devdigest/e2e` | Deterministic browser flows (agent-browser) | — | npm |
| `docs/agent-prompts/` | — | Canonical reviewer system prompts | | |
| `scripts/` | — | `dev.sh` (full local stack), `e2e.sh` (hermetic e2e) | | |

Every module has the same layout: `CLAUDE.md` (auto-loads when you work there),
`README.md`, `docs/`, `specs/`, `INSIGHTS.md`. Module conventions live ONLY in the
module CLAUDE.md — not here.

Request flow: client → REST/SSE → server modules → reviewer-core (as TS source) → LLM;
server → Postgres; server → GitHub / git clone → repo-intel index → repo map in prompt.

## Commands
```sh
./scripts/dev.sh     # Postgres + env files + install + migrate + seed + API + web
                     # flags: --no-seed --no-client --db-only
./scripts/e2e.sh     # isolated seeded stack on :5433/:3101/:3100, runs e2e, tears down
```
Per-package build/test commands → module CLAUDE.md.

## Cross-package gotchas
- **No workspace.** Install inside each package. server/client use pnpm, reviewer-core/e2e
  use npm (each has its own lockfile). Don't add a root `package.json`.
- **Code is shared via tsconfig path aliases**, not published packages. server imports
  `../reviewer-core/src` as TypeScript source.
- **`@devdigest/shared` (Zod contracts) exists twice:** `server/src/vendor/shared` (canonical;
  reviewer-core also resolves to it) and `client/src/vendor/shared`. The copies already
  drift. Changing a contract → update both.
- Comments mention `agent-runner` / CI runner and task ids (T1.3, T3, L04…) — those come
  back in later milestones; they are not missing files.
- The DB schema already contains tables for every milestone; empty tables are expected.

## Do not touch
- `docker compose down -v` — deletes the `devdigest_pgdata` volume with every imported
  repo and review (README Troubleshooting suggests it; don't). Need a clean DB → `./scripts/e2e.sh`.
- `.env`, `~/.devdigest/secrets.json` — secrets; never print, commit, or move into the DB.
- `server/clones/` — runtime repo checkouts (git-ignored).

## Read when
- You need the architecture or the end-to-end review flow → `README.md` (Architecture).
- You write, run, or split tests, or touch CI → `TESTING.md`.
- You change an agent's system prompt → `docs/agent-prompts/README.md`.
- You work inside a module → its `CLAUDE.md` loads automatically; then its `README.md`.
- You start a new feature → write the spec in `<module>/specs/` first.
- You get a request that touches a module → first, before any other action, read that module's `<module>/INSIGHTS.md` and treat it as high-confidence guidance unless told otherwise.
- You finish the work → run `/engineering-insights`: record only substantial non-obvious findings not already in the file; if there are none, write nothing. Don't skip this step.
