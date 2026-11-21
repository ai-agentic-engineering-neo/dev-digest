# DevDigest — agent map

Local-first AI PR review. 4 standalone packages, **no workspace**: each has its own
`package.json` + lockfile — run commands from inside the package dir.

## Stack
- Node ≥22 · pnpm ≥10 (`server`, `client`) · **npm** (`reviewer-core`, `e2e`)
- server: Fastify 5 · Drizzle 0.45 · Postgres + pgvector · Zod 3
- client: Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl · Tailwind 4
- tests: vitest 2 everywhere; browser e2e via agent-browser

## Commands
- `./scripts/dev.sh` — whole stack from zero (Postgres in Docker, API :3001, web :3000)
- Per-package build / test / typecheck → that package's `CLAUDE.md`

## Map
| Path | What | Before working there, read |
|---|---|---|
| `server/` | Fastify API, DB, repo-intel indexer | `server/CLAUDE.md` |
| `client/` | Next.js studio (UI) | `client/CLAUDE.md` |
| `reviewer-core/` | pure review engine (diff → prompt → LLM → findings) | `reviewer-core/CLAUDE.md` |
| `e2e/` | deterministic browser flows | `e2e/CLAUDE.md` |
| `docs/agent-prompts/` | built-in reviewer system prompts | — |
| `.github/workflows/` | one CI workflow per suite, path-filtered | `TESTING.md` |

## Docs layout (same in every package)
- `README.md` — what it is, diagrams, route / API map
- `docs/` — deeper design notes
- `specs/` — feature specs for roadmap milestones
- `INSIGHTS.md` — lessons learned, append-only

## Read when
- Starting any task in a package → read `<package>/CLAUDE.md` first (the VS Code
  extension may not auto-load it)
- Implementing a roadmap feature → read its spec in `<package>/specs/` and
  `README.md` §Roadmap
- Writing, renaming or moving tests → read `TESTING.md`
- Before changing non-trivial code in a package → read `<package>/INSIGHTS.md`
- Learned something non-obvious (a trap, a failed approach, a decision) → use
  the `engineering-insights` skill to append it to `<package>/INSIGHTS.md`
  right away, and run it again as a wrap-up before reporting a task done.
  Do not skip this step. `INSIGHTS.md` is append-only: never overwrite it

## Cross-package gotchas
- Zod contracts exist in **two copies**: `server/src/vendor/shared` (also used by
  reviewer-core) and `client/src/vendor/shared`. They already diverge — when you
  change a contract, update both.
- `reviewer-core` is consumed as **TS source** via tsconfig path alias, never built.
  Editing it also triggers server CI.

## Do not touch
- `server/clones/**` — runtime git checkouts, git-ignored
- Secrets — only via `LocalSecretsProvider`; never in git, DB, or logs
