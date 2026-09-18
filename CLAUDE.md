# DevDigest — agent map

## Before answering

Before answering a question or starting a task, FIRST search the relevant package's
`specs/` (what we intend to build) → `docs/` (how it works today) → `insights.md`
(what we already tried, rejected, or got bitten by) → then the source. These are
curated and may already answer it in full. If one does, cite it rather than
re-deriving the answer from code.

## After finishing

When a non-trivial task turns up something non-obvious, append it to the
`insights.md` of the package you touched — that file's header holds the format and
the fixed section list. Check a similar entry isn't already there.

Skip the write when nothing non-obvious came up. A typo or a routine change is not
an insight, and noise costs more than silence.

## Stack

Node ≥22 · pnpm ≥10 · TypeScript 5.7 · Fastify 5 · Next.js 15 / React 19 ·
Drizzle ORM + Postgres (pgvector) · Zod 3 · Vitest 2 · agent-browser (e2e)

## Commands

| Task            | Command                                                 |
| --------------- | ------------------------------------------------------- |
| Boot everything | `./scripts/dev.sh` (Postgres + API :3001 + web :3000)   |
| Server          | `cd server && pnpm dev \| build \| typecheck \| test`   |
| Migrations      | `cd server && pnpm db:generate` then `pnpm db:migrate`  |
| Client          | `cd client && pnpm dev \| build \| typecheck \| test`   |
| Engine          | `cd reviewer-core && npm test \| npm run typecheck`     |
| E2E (hermetic)  | `cd e2e && npm run e2e:hermetic`                         |

Flags for `dev.sh`: `--no-seed` · `--no-client` · `--db-only` · `--help`.

## Where things live

| Path                        | What                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `server/`                   | Fastify API + Drizzle. Indexer at `src/modules/repo-intel/` |
| `client/`                   | Next.js studio, App Router                                  |
| `reviewer-core/`            | Pure engine: diff + repo map → prompt → LLM → findings      |
| `e2e/`                      | Deterministic browser flows, no LLM                         |
| `server/src/vendor/shared/` | `@devdigest/shared` — canonical Zod contracts               |
| `client/src/vendor/ui/`     | `@devdigest/ui` — vendored design system                    |

## Conventions (cross-package — you cannot infer these from the code)

- **Not a monorepo workspace.** Each package has its own `package.json` and lockfile.
  `server/` + `client/` use **pnpm**; `reviewer-core/` + `e2e/` use **npm**. Never run
  the wrong package manager in a directory.
- Cross-package imports resolve through **tsconfig path aliases**, not published
  modules. `reviewer-core` is consumed as TypeScript **source** and never emits JS —
  its `build` is a typecheck.
- Contracts change in `@devdigest/shared` **first** (`server/src/vendor/shared` is the
  canonical copy), then in consumers.
- CI path filters hand-encode the alias graph — a new cross-package alias also means
  editing the `paths:` blocks in `.github/workflows/*.yml`.
- **Nothing here is linted.** No ESLint config, no `lint` script, no lint step in any
  of the five workflows; "lint" in this repo means `typecheck`. These conventions are
  not mechanically enforced, which is why they are written down.

## Gotchas

- **Run `npm ci` in `reviewer-core/` before you typecheck or test `server/`.** The
  alias resolves to its raw source, so a missing install is `TS2307` at typecheck and
  `ERR_MODULE_NOT_FOUND` at boot.
- **Migrations do not run on boot.** `relation ... does not exist` means you skipped
  `cd server && pnpm db:migrate`.
- **Never `docker compose down -v`** to "reset" — `-v` destroys the `devdigest_pgdata`
  volume and every imported repo and review with it.
- The server reaps orphaned `running` runs on boot; a run stuck in `running` is
  usually a crashed process, not a logic bug.

## Do not touch

- `server/clones/**` and `.claude/worktrees/**` — both hold full copies of this repo.
  **Always exclude them from grep and glob** or you will read and edit the wrong file.
- `server/src/db/migrations/**` — drizzle-kit output. Edit `server/src/db/schema.ts`
  and run `pnpm db:generate`; `meta/_journal.json` is fragile (`2006964` repaired it).
- `**/src/vendor/**` — vendored. Exception: `vendor/shared` changes only as part of a
  deliberate contract change.
- `**/node_modules/**`, `pnpm-lock.yaml`, `package-lock.json`.

## Read when

- Read `TESTING.md` when adding a test or touching CI.
- Read `docs/agent-prompts/` when changing a built-in agent's system prompt or
  choosing a model.
- Read `server/README.md` when adding or changing an API route.
- Read `client/README.md` when adding a page or a data hook.
- Read `reviewer-core/README.md` when touching prompt assembly, structured output, or
  the grounding gate.
- Read `e2e/README.md` before writing or debugging a browser flow.
- Read `insights.md` here for findings that span packages; each package has its own.
- Read `specs/README.md` before writing a spec — it says which directory it belongs in.
