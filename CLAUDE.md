# CLAUDE.md

## Overview

Course-starter for an agentic PR-reviewer (import a PR → AI agent review →
grounded findings). Four standalone packages, no workspace: `server/`
(Fastify API, `:3001`), `client/` (Next.js web, `:3000`), `reviewer-core/`
(review engine), `e2e/` (browser tests) — sharing is via tsconfig path
aliases, not publishing. Only Postgres (pgvector) runs in Docker.

## Commands

- Full boot from zero: `./scripts/dev.sh` (flags: `--no-seed` `--no-client`
  `--db-only` `--help`). It starts Postgres, creates `.env` files from
  `.env.example` if missing, installs deps, migrates + seeds, launches API
  and web.
- Manual sequence: `docker compose up -d` → `cd server && pnpm install &&
  pnpm db:migrate && pnpm db:seed && pnpm dev` → `cd client && pnpm install
  && pnpm dev`.
- Per-package scripts are listed in each package's own `CLAUDE.md`/`README.md`
  — don't assume a script name without checking there first.

## Conventions

- Migrations are **never applied on boot** — `pnpm db:migrate` is a manual
  step, always, even after pulling schema changes.
- Secrets (API keys, `GITHUB_TOKEN`) live in `~/.devdigest/secrets.json`
  (mode `0600`), never in `.env`-committed form, the DB, or git;
  `process.env` is only a fallback.
- `REPO_INTEL_ENABLED`, the grounding gate, and the prompt-injection guard
  are structural safety/quality mechanisms baked into the review pipeline —
  not optional flags to work around when a review "looks wrong."
- CI is **path-filtered per package**, and filters encode cross-package type
  deps — e.g. `reviewer-core/**` changes also trigger `server-unit` because
  the server type-checks against `reviewer-core/src` directly.

## Do not touch

- `server/clones/**` — git-ignored runtime data (cloned target repos for
  repo-intel indexing). It may itself contain unrelated nested repos with
  their own `CLAUDE.md`/config (e.g. `server/clones/<user>/<repo>/CLAUDE.md`)
  — those belong to an *indexed target repo*, not this project. Never edit
  or treat them as project config.
- `server/package.json` is git `skip-worktree` — the local file intentionally
  diverges from the committed one. Don't assume `pnpm test`/`pnpm typecheck`
  script names on disk match what CI runs; CI invokes the literal vitest
  commands documented in `TESTING.md`.
- Never run `docker compose down -v` against the dev stack — `-v` deletes the
  `devdigest_pgdata` volume, wiping every real imported repo and review.

## Gotchas

- Empty-looking UI sections, unused DB tables, and unimplemented routes
  (Skills, Memory, Eval pipeline, Blast Radius, multi-agent review, CI
  export, …) are intentional scaffolding for future course lessons (L01–L08)
  — not bugs to fix or dead code to remove.
- Only Postgres is Dockerized — if the API/web won't start, check `pnpm dev`
  output in `server/`/`client/`, not `docker compose logs`.
- Port `5432` already in use → another Postgres is running; stop it or
  remap the host port in `docker-compose.yml`.
- `vector` type errors mean migrations didn't run against the Dockerized DB
  (pgvector is enabled by migration `0000`) — run `pnpm db:migrate`.

## Reference

- `README.md` — read first, always: architecture, package table, full quick
  start, troubleshooting.
- `TESTING.md` — read before writing or running any test, in any package.
- `docs/agent-prompts/README.md` — read before creating or editing an agent
  system prompt.
- `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`,
  `e2e/CLAUDE.md` (+ each package's own `README.md`) — read before working
  inside that package.
- `e2e/specs/*.flow.json` — read before adding or changing an e2e flow.
- `.claude/rules/` — always-applied project rules (distinct from
  `.claude/skills/`, which loads on-demand); currently empty. Read it before
  any task — once a rule file exists there, it is authoritative over every
  `CLAUDE.md` in this repo and must never be overridden here.
- Each package's `docs/` (deeper design notes) and `specs/` (formal specs
  written before implementation) — read when they're non-empty and relevant
  to the change; currently placeholders (`e2e/specs/` is the exception,
  already populated with flow specs — see `e2e/CLAUDE.md`).

These files are the source of truth. If this file ever disagrees with them,
they win — update this file rather than working around it.
