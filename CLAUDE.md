# DevDigest

Local-first AI pull-request reviewer: import a PR → run agent review → grounded findings.
Starter template; roadmap milestones M1–M8 add features back (see `README.md#roadmap`).

## Stack
Node ≥22 · TypeScript 5.9 · Zod 3.25 · Postgres 16 + pgvector (Docker)
server: Fastify 5, Drizzle 0.45 · client: Next 15.5, React 19, TanStack Query 5, next-intl 3
tests: Vitest 2 · e2e: agent-browser (no LLM)

## Map
| Path | What | Pkg manager |
|---|---|---|
| `server/` | Fastify API :3001, DB, repo-intel indexer, review orchestration | pnpm |
| `client/` | Next.js studio :3000 | pnpm |
| `reviewer-core/` | pure review engine: diff → prompt → LLM → grounding | npm |
| `e2e/` | deterministic browser flows on seeded data | npm |
| `server/src/vendor/shared` | Zod contracts (`@devdigest/shared`) | — |
| `docs/agent-prompts/` | canonical reviewer-agent system prompts | — |
| `specs/` | cross-module feature specs | — |

## Commands
- Full stack: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`) — **applies migrations, see below**
- Postgres only: `docker compose up -d`
- Hermetic e2e (isolated throwaway DB): `./scripts/e2e.sh`

## Gotchas (cross-module)
- NO workspace. Install per package, with that package's manager (pnpm vs npm — see Map).
- Cross-package code is shared only via tsconfig path aliases (`@devdigest/shared`,
  `@devdigest/reviewer-core`); never relative-import into another package.
- Zod contracts exist in TWO copies — `server/src/vendor/shared` and `client/src/vendor/shared` —
  and they have already drifted. A contract change must be applied to both, then typecheck all packages.

## Do not touch
- Existing DB migrations are immutable, and applying migrations (`pnpm db:migrate`, `./scripts/dev.sh`
  in any mode) needs explicit user approval first. Full rules: `server/CLAUDE.md`.

## Insights (required)
- After the user's request and BEFORE any work or answer, you MUST read the `INSIGHTS.md` of the module the task
  touches or asks about, plus the root one (`engineering-insights` skill, phase 1).
- Before finishing the task, you MUST run phase 3 of `engineering-insights`: record only substantive lessons not
  already in the file; if there are none, write nothing. `INSIGHTS.md` files are append-only.
- Every module has its own `INSIGHTS.md`; the skill routes each lesson to the right one. Entries are drafts
  pending human review — strong hints, not absolute truth.

## Read when
- Need project architecture, structure, or the end-to-end review flow → read `README.md`.
- Before changing anything in a module → read that module's `CLAUDE.md` first
  (`server/`, `client/`, `reviewer-core/`, `e2e/`); it routes you to its README, tests, specs, and insights.
- Change spans more than one module → read the `CLAUDE.md` of every module you touch.
- Cross-module feature or lesson → `specs/` and `INSIGHTS.md` in the repo root.
