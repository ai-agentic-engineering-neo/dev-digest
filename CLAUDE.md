# DevDigest

Local-first AI PR review. Starter: import PR → run agent review → grounded findings.
Roadmap milestones M1–M8: README.md#roadmap.

## Stack
Node ≥22 · pnpm ≥10 · TypeScript 5.x · Zod 3 · Postgres 16 + pgvector (Docker only)

## Packages (NO workspace — each has own package.json + lockfile)
| Dir | Role | Port |
|---|---|---|
| server/ | Fastify API + Drizzle + repo-intel indexer | 3001 |
| client/ | Next.js studio | 3000 |
| reviewer-core/ | pure review engine, no I/O | — |
| e2e/ | agent-browser flows | — |

Cross-package code via tsconfig path aliases, not published modules.
Each package has its own CLAUDE.md — package conventions live there, not here.

## Commands
- Full stack from zero: `./scripts/dev.sh` (flags: --no-seed --no-client --db-only)
- Reset DB: `docker compose down -v`, then `./scripts/dev.sh`
- Per-package commands: that package's CLAUDE.md

## Per-package doc layout
- `README.md` — what the package is + diagrams
- `docs/` — how it works (durable deep-dives)
- `specs/` — feature specs for milestones (exception: `e2e/specs/` = test flows)
- `INSIGHTS.md` — lessons learned (7 fixed sections); append via the `engineering-insights` skill.
  Cross-cutting lessons → root `./INSIGHTS.md`

## Read when…
- Starting a milestone feature → README.md#roadmap, then `<package>/specs/`
- Touching tests or CI → TESTING.md
- Writing/editing a reviewer agent prompt → docs/agent-prompts/README.md

## Session protocol (engineering-insights skill) — MANDATORY
- Start of EVERY user request, before any code reading, planning or answer: read the
  INSIGHTS.md of the module(s) the request is about (`<package>/INSIGHTS.md`) + `./INSIGHTS.md`.
  Treat entries as high-confidence guidance unless told otherwise.
- End of task: re-read the target INSIGHTS.md, then append only lessons that are
  substantial AND not already there. Nothing new → write nothing, say "no new insights".

## Gotchas
- Server does NOT migrate on boot — run `pnpm db:migrate` in server/.
- `@devdigest/shared` exists twice: server/src/vendor/shared (canonical) and
  client/src/vendor/shared. They already drift; contract change → update both.
- Only outbound calls allowed: GitHub + LLM. Keep it local-first.

## Do not touch
- Existing files in `server/src/db/migrations/**` (generate new ones instead)
- `.github/workflows/*` path filters unless the task is CI
