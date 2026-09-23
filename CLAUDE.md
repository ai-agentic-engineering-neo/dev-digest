# DevDigest — agent map

Local-first AI pull-request review. Four independent packages — **not** a
workspace: each has its own `package.json` and lockfile. Package-specific rules
live in `<pkg>/CLAUDE.md`; this file holds only what spans packages.

## Stack

Node ≥22 · pnpm ≥10 · TypeScript 5.7 · Fastify 5 · Drizzle 0.38 + Postgres 16
(pgvector) · Next.js 15 · React 19 · TanStack Query 5 · next-intl 3 · Tailwind 4 ·
Zod 3 · Vitest 2 · agent-browser (e2e)

## Commands

| Task                                  | Command                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| Boot all (Postgres + API :3001 + web :3000) | `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`) |
| Server                                | `cd server && pnpm dev \| typecheck \| test`             |
| Schema change                         | `cd server && pnpm db:generate && pnpm db:migrate`       |
| Client                                | `cd client && pnpm dev \| typecheck \| test`             |
| Engine                                | `cd reviewer-core && npm test && npm run typecheck`      |
| E2E                                   | `cd e2e && npm run e2e:hermetic`                         |

## Where things live

| Path                        | What                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `server/`                   | Fastify API + Drizzle; repo indexer in `src/modules/repo-intel/` |
| `client/`                   | Next.js studio (App Router)                                 |
| `reviewer-core/`            | Pure engine: diff + repo map → prompt → LLM → grounded findings |
| `e2e/`                      | Deterministic browser flows, no LLM                         |
| `server/src/vendor/shared/` | `@devdigest/shared` — the canonical Zod contracts           |
| `docs/agent-prompts/`       | Built-in agents' system prompts and model choice            |

Every package also has `README.md`, `docs/`, `specs/` and `INSIGHTS.md` — see
**Read when**.

## Conventions (cross-package)

- pnpm in `server/` + `client/`, npm in `reviewer-core/` + `e2e/`. Use the
  package manager whose lockfile is in the directory — never create a second one.
- Cross-package imports are tsconfig path aliases to TypeScript **source**, not
  published packages.
- Contracts change in `server/src/vendor/shared/` first. `client/src/vendor/shared/`
  is a hand-copy with no sync script — update it too. `reviewer-core` reads the
  server copy directly.
- The API runs `reviewer-core` source with `reviewer-core/node_modules`. On a
  fresh clone run `cd reviewer-core && npm ci`, or the API fails with
  `ERR_MODULE_NOT_FOUND`.

## Gotchas

- Migrations do **not** run on boot. `relation … does not exist` →
  `cd server && pnpm db:migrate`.
- `docker compose down -v` (root or `server/` — same volume) deletes
  `devdigest_pgdata` with every imported repo and review. Ask before running it,
  whatever the README's "Reset everything" says.
- Seeded agents run on OpenRouter, so reviews need `OPENROUTER_API_KEY`.
- The `agent-runner/` rules in `.gitignore` are pre-staged for lesson L06, not
  leftovers to clean up.

## Do not touch

- `server/clones/**` — cloned user repos, including a copy of this one. Exclude
  it from every grep and glob, or you will read and edit the wrong file.
- `**/src/vendor/**` — vendored. `vendor/shared` changes only as a deliberate
  contract change.
- Lockfiles, `node_modules/`, `.env`, `server/src/db/migrations/**` (generated).

## Read when

- Read `<pkg>/INSIGHTS.md` before starting work in a package; append what you
  learned when you finish.
- Read `<pkg>/specs/` before implementing a feature, and `<pkg>/docs/` before
  changing how a subsystem works.
- Read [`README.md#architecture`](README.md#architecture) when a change spans
  packages or the end-to-end review flow.
- Read [`server/README.md`](server/README.md) when adding or changing an API
  route or its contract.
- Read [`server/src/modules/repo-intel/README.md`](server/src/modules/repo-intel/README.md)
  when touching indexing or the repo map.
- Read [`reviewer-core/README.md`](reviewer-core/README.md) when touching prompt
  assembly, grounding or scoring.
- Read [`TESTING.md`](TESTING.md) when adding a test or editing `.github/workflows/`.
- Read [`docs/agent-prompts/`](docs/agent-prompts/README.md) when changing a
  built-in agent's system prompt or model.
- Read [`INSIGHTS.md`](INSIGHTS.md) when work spans two or more packages.
