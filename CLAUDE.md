# DevDigest — agent map

## Before answering

Before answering a question or starting a task, search the relevant package's
`specs/`, `docs/`, and `INSIGHTS.md` for what was asked about — in that order:
`<package>/specs/` (what we intend to build) → `<package>/docs/` (how it
works) → `<package>/INSIGHTS.md` (what we already tried and rejected) →
source. If a curated file answers the question, cite it instead of
re-deriving from code. For repo-wide work (`scripts/`, docker, CI) read the
root `INSIGHTS.md` too. If an INSIGHTS entry applies to the task, name it in
one line before acting.

## While working and after finishing

Use the `engineering-insights` skill. Capture a finding the moment it is
verified and non-obvious: a surprising root cause, an abandoned approach, a
tool quirk, a trade-off decision, or a correction from the user. When a
non-trivial task is done, sweep for anything you missed. The skill routes
each entry to the right package's `INSIGHTS.md` (or the root one for
repo-wide lessons). Routine changes don't need an entry — noise costs more
than silence.

## Stack

Node ≥22 · pnpm ≥10 · TypeScript · Fastify 5 · Next.js 15 / React 19 ·
Drizzle ORM + Postgres (pgvector) · Zod · Vitest · agent-browser (e2e)

## Commands

| Task            | Command                                                  |
| ---------------- | -------------------------------------------------------- |
| Boot everything | `./scripts/dev.sh` (Postgres + API :3001 + web :3000)     |
| Server          | `cd server && pnpm dev \| build \| typecheck \| test`     |
| Migrations      | `cd server && pnpm db:generate` then `pnpm db:migrate`    |
| Client          | `cd client && pnpm dev \| build \| typecheck \| test`     |
| Engine          | `cd reviewer-core && npm test \| npm run typecheck`       |
| E2E (hermetic)  | `cd e2e && npm run e2e:hermetic`                           |

Flags for `dev.sh`: `--no-seed` · `--no-client` · `--db-only` · `--help`.

## Where things live

| Path                        | What                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| `server/`                   | Fastify API + Drizzle. Indexer at `src/modules/repo-intel/` |
| `client/`                   | Next.js studio, App Router                                  |
| `reviewer-core/`            | Pure engine: diff + repo map → prompt → LLM → findings      |
| `e2e/`                      | Deterministic browser flows, no LLM                         |
| `server/src/vendor/shared/` | `@devdigest/shared` — Zod contracts for every package        |
| `client/src/vendor/ui/`     | `@devdigest/ui` — vendored UI primitives                     |

## Conventions (non-default — you cannot infer these from the code)

- **Not a monorepo workspace.** Each package has its own `package.json` and its
  own lockfile. `server/` + `client/` use **pnpm**; `reviewer-core/` + `e2e/`
  use **npm**. Never run the wrong package manager in a package. (The
  `pnpm-workspace.yaml` in `client/` and `server/` only sets `pnpm.allowBuilds`
  for native deps — it is not a real workspace root.)
- Cross-package imports resolve through **tsconfig path aliases**, not
  published modules. `reviewer-core` is consumed as TypeScript **source** and
  never emits JS — its `build` is a typecheck.
- Contracts change in `@devdigest/shared` **first**, then in consumers. The
  same Zod schema drives request validation and response serialization.
- Server tests split by filename: `*.it.test.ts` are DB-backed (testcontainers
  Postgres). Everything else must stay hermetic.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600) with `process.env`
  as fallback — never in git or the database.

## Naming

- Packages are npm-scoped `@devdigest/<name>`, and the scope name does not
  always match the folder: `server/` → `@devdigest/api`, `client/` →
  `@devdigest/web`, `reviewer-core/` → `@devdigest/reviewer-core`, `e2e/` →
  `@devdigest/e2e`.
- Server test files: `*.it.test.ts` means DB-backed (testcontainers). Any
  other `*.test.ts` must stay hermetic — don't add DB access to it.
- `src/vendor/<name>` mirrors the scoped package it vendors:
  `server/src/vendor/shared` is `@devdigest/shared`,
  `client/src/vendor/ui` is `@devdigest/ui`.
- Package-specific naming (client `_components/<Name>/` folders, i18n message
  files under `messages/<locale>/*.json`, server `src/modules/<name>/`
  plugins) lives in that package's own `CLAUDE.md` — read it before adding a
  new component, module, or locale file.

## Gotchas

- **Migrations do not run on boot.** `relation ... does not exist` means you
  skipped `pnpm db:migrate`.
- **Never `docker compose down -v`** to "reset" — `-v` destroys the
  `devdigest_pgdata` volume and every imported repo and review with it.
- The server reaps orphaned `running` runs on boot; a run stuck in `running`
  is usually a crashed process, not a logic bug.

## Do not touch

- `server/clones/**` — cloned user repos, including a full copy of dev-digest
  itself. **Always exclude it from grep and glob** or you will read and edit
  the wrong file. Gitignored; never commit its contents.
- `**/src/vendor/**` — vendored. Exception: `vendor/shared` changes only as
  part of a deliberate contract change.
- `**/node_modules/**`, `pnpm-lock.yaml`, `package-lock.json`.
- `server/src/db/migrations/**` — generated by `pnpm db:generate`. Never
  hand-edit or delete an already-applied migration file; change
  `src/db/schema.ts` and regenerate instead.

## Read when

- Read `TESTING.md` when adding a test or touching CI.
- Read `docs/agent-prompts/` when changing a built-in agent's system prompt or
  choosing a model.
- Read `server/README.md` when adding or changing an API route.
- Read `client/README.md` when adding a page or a data hook.
- Read `reviewer-core/README.md` when touching prompt assembly, structured
  output, or the grounding gate.
- Read `e2e/README.md` before writing or debugging a browser flow.
