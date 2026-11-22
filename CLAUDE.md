# DevDigest — local-first AI pull-request review (starter)

Imports a GitHub PR and runs an LLM "agent" review over its diff → grounded,
structured findings. Starter template: later milestones (M1–M8, see README.md
Roadmap) add features back one at a time.

## Packages
| Folder | Package | Role | Port | PM |
|---|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, all side effects (DB, git, GitHub, LLM) | 3001 | pnpm |
| `client/` | `@devdigest/web` | Next.js studio UI | 3000 | pnpm |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure review engine (no I/O) | — | npm |
| `e2e/` | `@devdigest/e2e` | deterministic browser e2e | — | npm |

Before working inside a package, read its `CLAUDE.md` (in case it was not auto-loaded).

## Commands
- `./scripts/dev.sh` — Postgres (Docker) + migrate + seed + API + web. On Windows run via Git Bash.
- `./scripts/e2e.sh` — hermetic e2e stack on alternate ports.

## Cross-package gotchas
- **No monorepo workspace.** Each package has its own lockfile; code is shared via
  tsconfig `paths` aliases pointing at raw TS source, not published modules.
- **`@devdigest/shared` is vendored twice**: `server/src/vendor/shared` and
  `client/src/vendor/shared` — not kept in sync automatically. A contract change must
  be made in both. `reviewer-core` reads the server copy.
- Only Postgres runs in Docker; API and web run on the host.
- `server/clones/` is runtime data (cloned repos, may include this repo) — exclude from search.

## Do not touch
- `server/src/db/migrations/**` — generate via drizzle-kit only.
- `.claude/skills/**` — synced from `skills-lock.json` (except local `engineering-insights/`).

## Docs — read when relevant
- Product overview, architecture diagram, roadmap → README.md
- Test strategy, suite map, CI workflows → TESTING.md
- Writing/editing reviewer agent prompts → docs/agent-prompts/README.md
- Per package: `<pkg>/docs/README.md` (how it works), `<pkg>/specs/README.md`
  (what to build), `<pkg>/INSIGHTS.md` (lessons learned).
- Before finishing a task with debugging or a non-trivial change → MUST run the
  `engineering-insights` skill (writes the relevant `<pkg>/INSIGHTS.md`, not here).
