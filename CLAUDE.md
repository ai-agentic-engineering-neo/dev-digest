# DevDigest

Local-first AI pull-request review. Starter template: import a PR → run an agent
review. Milestones M1–M8 add features back (roadmap in README.md).

## Map
| Path | What | Package manager |
|---|---|---|
| `server/` | Fastify API + Postgres; also hosts `repo-intel` and the shared Zod contracts | pnpm |
| `client/` | Next.js studio (UI) | pnpm |
| `reviewer-core/` | Pure review engine: diff → prompt → LLM → grounded findings | npm |
| `e2e/` | Deterministic browser flows (agent-browser) | npm |
| `docs/` | Cross-package docs (agent prompts) | — |
| `scripts/` | `dev.sh` (full stack), `e2e.sh` (hermetic e2e) | — |

Each package has its own CLAUDE.md with its stack, commands and conventions.

## Commands
- Full stack from zero: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- Postgres only: `docker compose up -d`
- Package commands: see that package's CLAUDE.md

## Cross-package gotchas
- NOT a monorepo: no root package.json. Run commands inside the package dir.
  server/client use **pnpm**; reviewer-core/e2e use **npm** (package-lock.json).
- `@devdigest/shared` exists in TWO copies: `server/src/vendor/shared` (also used by
  reviewer-core via tsconfig alias) and `client/src/vendor/shared`. They have already
  drifted. A contract change must land in both copies.
- reviewer-core is consumed as TS source via tsconfig alias; it is never built or published.
- NEVER `docker compose down -v` — it deletes the dev DB volume with all imported repos.

## Do not touch
- DB migrations (`server/src/db/migrations/`, including `meta/`): never edit, rename
  or delete existing migration files. Schema changes go through `server/src/db/schema/`
  → `pnpm db:generate`, which creates a NEW migration.

## Read when
| When | Read |
|---|---|
| You need the big picture / review flow | `README.md` |
| Writing or running tests, touching CI | `TESTING.md` |
| Editing an agent's system prompt | `docs/agent-prompts/README.md` |
| Starting milestone work | `<package>/specs/` |
| Before non-trivial changes in a package | `<package>/INSIGHTS.md` |

## Docs rules
- Link, don't duplicate: README and `docs/` are the source of truth.
- Per package: `README.md` (what it is) · `docs/` (deep reference) ·
  `specs/` (feature specs, `M<N>-<slug>.md`) · `INSIGHTS.md` (lessons learned).
- Learned something non-obvious (verified fix, dead end, quirk, decision)? Use the
  `engineering-insights` skill: it appends to that package's INSIGHTS.md (root
  `INSIGHTS.md` for cross-package). Run it as a wrap-up after every non-trivial task.
