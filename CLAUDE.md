# DevDigest

Local-first AI PR review. Course starter — 4 standalone packages, no workspace
tool (no pnpm workspaces/turborepo). Cross-package types via tsconfig path
aliases, not published modules.

## Stack

Node ≥22 · pnpm ≥10 (server/client) · npm (reviewer-core/e2e — see their own
CLAUDE.md) · Docker (Postgres+pgvector only; API/web run on host).

## Where things live

- `server/`        Fastify 5 + Drizzle/Postgres API — see [server/CLAUDE.md](server/CLAUDE.md)
- `client/`         Next.js 15 studio (App Router) — see [client/CLAUDE.md](client/CLAUDE.md)
- `reviewer-core/`  Pure review engine (diff→LLM→findings), no DB/FS — see [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md)
- `e2e/`            Deterministic browser e2e — see [e2e/CLAUDE.md](e2e/CLAUDE.md)
- `docs/`           Cross-cutting reference docs (agent prompts, model choice)

## Commands

`./scripts/dev.sh` boots Postgres+API+web from zero. Per-package
`pnpm|npm dev|test|typecheck` — see that package's own CLAUDE.md for which.

## Non-default conventions

- `@devdigest/shared` is NOT a package — hand-copied into
  `server/src/vendor/shared` AND `client/src/vendor/shared`. Edit BOTH when a
  shared contract changes — they already drift when you don't (see
  `server/INSIGHTS.md`).
- Migrations do NOT run on boot — `pnpm db:migrate` is manual.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600), not `.env`, not DB.

## Do-not-touch

- `server/clones/` — git-ignored working checkouts of indexed repos.
- DB schema already ships every future-lesson table, empty — later lessons fill them.
- Never `docker compose down -v` to "reset" — deletes the `devdigest_pgdata`
  volume and every imported repo/review with it (see `e2e/CLAUDE.md`).

## Session protocol

- Before touching a package, skim **that package's own** `INSIGHTS.md` (not the whole repo's).
- After a non-trivial task, run the `engineering-insights` skill to update the
  touched package(s)' `INSIGHTS.md`.

## Feature planning

- Any plan for a new feature (a plan-mode session) gets saved to
  `docs/<feature-slug>-plan.md` — never left only in the ephemeral
  plan-mode file, whether implementation follows immediately or is
  deferred. Include a `**Status:**` line (not started / in progress /
  done) so it's scannable without opening the diff.
- Cross-reference both ways: if the plan was also rendered as an Artifact,
  link it from the doc's bottom; once implemented, the shipping PR
  description links back to the doc path. Precedent:
  `docs/review-cost-plan.md` (written as step 0, before any code change),
  `docs/findings-by-severity-plan.md` (deferred, links out to its Artifact).

## Docs map

- [README.md](README.md) — quick start, architecture diagram
- [TESTING.md](TESTING.md) — cross-package test strategy
- [docs/](docs/) — cross-cutting reference docs
