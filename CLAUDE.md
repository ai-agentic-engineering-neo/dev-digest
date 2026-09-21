# DevDigest — agent map

Local-first AI PR review. 4 independent packages, **no workspace**: each has its
own `package.json` + lockfile; code is shared via tsconfig path aliases.

| Package | Stack | PM | Port |
|---|---|---|---|
| `server/` | Fastify 5 · Drizzle · Postgres 16 + pgvector · Zod 3 | pnpm | 3001 |
| `client/` | Next.js 15 · React 19 · TanStack Query 5 · next-intl | pnpm | 3000 |
| `reviewer-core/` | pure TS review engine, consumed as source | npm | — |
| `e2e/` | agent-browser (CDP), no LLM | npm | — |

Node ≥ 22 · pnpm ≥ 10 · Docker (Postgres only; API and web run on the host).

## Commands
- Boot everything: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- Test / typecheck: run inside the package — see its `CLAUDE.md`.

## Read when
- Change spans packages or you need the big picture → read `README.md` (Architecture)
- Touching the review flow end to end (import → run → findings UI) → read `docs/review-flow.md`
- Writing, moving or splitting tests, or editing CI → read `TESTING.md`
- Editing built-in agent prompts or model choice → read `docs/agent-prompts/README.md`
- Before working in a package → read its `INSIGHTS.md` and treat it as
  high-confidence guidance unless told otherwise (its `CLAUDE.md` loads automatically)

## Per-package layout (convention)
Every package has the same four knowledge slots:
- `README.md` — source of truth (stack, diagrams, API/route maps). Link, don't copy.
- `docs/` — deep dives too long for the README.
- `specs/` — feature specs (what to build and acceptance criteria), one file per feature.
- `INSIGHTS.md` — lessons learned, fixed sections, append-only (skill `engineering-insights`).

## Gotchas
- `@devdigest/shared` exists as **two copies**: `server/src/vendor/shared` and
  `client/src/vendor/shared`, and they already differ. Change a contract → update both.
- `reviewer-core` resolves `@devdigest/shared` from `server/src/vendor/shared`.
- Migrations do **not** run on boot (`cd server && pnpm db:migrate`).
- The course adds features lesson by lesson (see README.md "What you build"):
  missing screens, modules and empty tables are expected, not bugs.

## Do not touch
- Never `docker compose down -v` — it wipes `devdigest_pgdata` (all imported repos).
- `design/` — reference mockup, not source.
- `server/clones/` — runtime checkouts of imported repos.

## On finishing a task
Update the touched package's `INSIGHTS.md` via the `engineering-insights` skill
(`/engineering-insights`). Do not skip this step — trivial edits excepted.
