# DevDigest

Local-first AI pull-request reviewer. Four independent packages — no workspace,
no root `package.json`. Run every command from inside a package directory.

| Package | Role | Package manager |
|---|---|---|
| `server/` | Fastify API, Postgres, git/GitHub, jobs, SSE — owns all I/O | pnpm |
| `reviewer-core/` | Pure review engine: diff → prompt → LLM → grounded findings | npm |
| `client/` | Next.js studio UI | pnpm |
| `e2e/` | Deterministic browser flows (agent-browser) | npm |

Use the package manager listed above; never create a `package-lock.json` in a
pnpm package or a `pnpm-lock.yaml` in an npm package.

Each package has its own `CLAUDE.md`, `INSIGHTS.md`, `docs/` and `specs/`.

## Cross-package wiring

Packages import each other's **source** through tsconfig path aliases, not npm deps:

- `server` → `@devdigest/reviewer-core` = `../reviewer-core/src`
- `reviewer-core` → `@devdigest/shared` = `../server/src/vendor/shared`
- `client` → `@devdigest/shared` = `client/src/vendor/shared` — a separate **copy**

## Rules that apply everywhere

- A change to a `@devdigest/shared` contract edits `server/src/vendor/shared` AND
  `client/src/vendor/shared` in the same commit. The two copies already differ in
  a few files; mirror the contract you touch, don't "sync" unrelated drift.
- Secrets (LLM keys, `GITHUB_TOKEN`) live only in `~/.devdigest/secrets.json` or
  the environment. Never in the DB, in `AppConfig`, in code, or in git.
- DB migrations are not applied on boot: after a schema change, run
  `pnpm db:migrate` in `server/`.
- Only Postgres runs in Docker; the API and web run on the host.
- Never run `docker compose down -v`: it deletes the `devdigest_pgdata` volume with
  every imported repo and review.
- There is no linter or formatter in this repo; verification = typecheck + tests.

## Boot and verify

- Whole stack: `./scripts/dev.sh` (flags: `--no-seed`, `--no-client`, `--db-only`).
- After changing a package, run that package's typecheck and tests (commands in
  its `CLAUDE.md`). After changing `reviewer-core/` or `server/src/vendor/shared/`,
  also run `pnpm typecheck` in `server/` — they are compiled together.

## Read when…

- Read `docs/ONBOARDING.md` when a task touches more than one package, changes a
  `@devdigest/shared` contract, or changes how modules talk (REST, SSE, jobs, DI).
- Read `TESTING.md` before adding or moving a test file or editing anything in
  `.github/workflows/`.
- Read the "Quick start" and "Troubleshooting" sections of `README.md` when the
  local stack fails to boot, migrate or seed.
- Read `docs/agent-prompts/README.md` when editing a built-in agent's system prompt
  (`server/src/db/seed-prompts.ts`).
- Read `<package>/specs/` before implementing a feature that has a spec there.
