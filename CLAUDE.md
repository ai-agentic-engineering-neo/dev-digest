# CLAUDE.md

Guidance for Claude Code (and any other AI agent) working in this repository.

## What this project is

DevDigest — a local-first AI pull-request review tool. It clones a repo,
indexes it, imports PRs from GitHub, and runs an LLM-based review pipeline
(`reviewer-core`) that produces grounded findings (citation-checked against
the real diff) shown in a web UI.

## Monorepo structure

This is **not** a package-manager workspace (no shared root `package.json`,
no `pnpm-workspace.yaml`). It is four **standalone** packages, each with its
own lockfile and `node_modules`. Cross-package imports are wired through
TypeScript path aliases in each package's `tsconfig.json`, not through
published/npm-linked packages.

| Path | Package | Role |
|---|---|---|
| `server/` | `@devdigest/api` | Backend API. Owns the database, GitHub sync, review orchestration, and the codebase indexer (`repo-intel`). |
| `client/` | `@devdigest/web` | The web UI ("the studio") — browsing repos/PRs, running reviews, viewing findings. |
| `reviewer-core/` | `@devdigest/reviewer-core` | The pure review engine: diff → prompt → LLM call → grounded findings. No DB/GitHub/filesystem access — the only side effect is an LLM call through an injected provider. Consumed by `server` (and, in later course lessons, a CI runner) as TypeScript source via a path alias. |
| `e2e/` | `@devdigest/e2e` | Deterministic browser end-to-end tests against the real running stack (no LLM involved). |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod schemas/contracts shared by `server`, `client`, and `reviewer-core`. Lives inside `server/` but is path-aliased into the other packages — treat it as a shared library, not server-private code. |
| `server/src/modules/repo-intel` | (part of `@devdigest/api`) | The codebase indexer: symbols, import graph, "repo map" context fed into reviews. |

Only **Postgres** (with the `pgvector` extension) runs in Docker
(`docker-compose.yml`). The API and web app run directly on the host.

## Tech stack per package

**`server/` — `@devdigest/api`**
- Language: TypeScript (ESM, `"type": "module"`), Node.js
- Web framework: **Fastify 5** (+ `@fastify/cors`, `@fastify/helmet`,
  `@fastify/rate-limit`, `@fastify/autoload`, `fastify-sse-v2` for
  Server-Sent Events, `fastify-type-provider-zod` for schema-typed routes)
- Database: **Postgres** via **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`
  for migrations), `pgvector` for embeddings
- Validation/contracts: **Zod**
- LLM clients: `openai`, `@anthropic-ai/sdk` SDKs; `octokit` for GitHub;
  `simple-git` for git operations
- Codebase indexing: `@ast-grep/napi`, `graphology`/`graphology-metrics`,
  `@vscode/ripgrep`, `dependency-cruiser`
- Dev/test tooling: `tsx` (dev runner), `vitest` (tests, incl. Postgres
  integration tests via `testcontainers`), `pino-pretty` (log formatting)

**`client/` — `@devdigest/web`**
- Language: TypeScript, **Next.js 15** (App Router), **React 19**
- Data fetching/state: `@tanstack/react-query`
- Styling: **Tailwind CSS 4**
- i18n: `next-intl`
- UI extras: `lucide-react` (icons), `recharts` (charts), `mermaid`
  (diagrams), `react-markdown` + `remark-gfm`
- Validation/contracts: **Zod** (shared schemas from `@devdigest/shared`)
- Test tooling: `vitest` + `@testing-library/react` + `jsdom`

**`reviewer-core/` — `@devdigest/reviewer-core`**
- Language: TypeScript (pure logic, no framework)
- Dependencies: `openai` SDK (structured LLM calls), `zod` (schema
  validation of LLM output)
- Its `build` script is a type-check only — it never emits JS; it's
  consumed as source via a path alias.

**`e2e/` — `@devdigest/e2e`**
- Language: TypeScript, run with `tsx`
- Driven by **agent-browser** (Chrome DevTools Protocol), deterministic
  JSON test specs — no LLM in the loop

## Run commands

Full stack, from zero (Docker + install + migrate + seed + both dev servers):

```sh
./scripts/dev.sh              # full boot
./scripts/dev.sh --no-seed    # skip demo data
./scripts/dev.sh --no-client  # API + Postgres only
./scripts/dev.sh --db-only    # just Postgres + migrate + seed
```

Manual, step by step:

```sh
docker compose up -d              # Postgres + pgvector

cd server
pnpm install
pnpm db:migrate                   # apply migrations (NOT automatic on boot)
pnpm db:seed                      # optional demo data
pnpm dev                          # API on :3001

cd ../client
pnpm install
pnpm dev                          # web app on :3000
```

Requires **Node ≥ 22**, **pnpm ≥ 10**, **Docker**. `server/` and `client/`
use `pnpm`; `reviewer-core/` and `e2e/` use `npm`.

## Test / typecheck / lint commands

There is **no linter configured** in this repo (no ESLint or Prettier
config present anywhere). Rely on `typecheck` and the test suites below as
the correctness/style gate.

```sh
# client
cd client && pnpm test          # vitest + jsdom
cd client && pnpm typecheck

# server — unit and integration are split by filename, not by script
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, no Docker needed
cd server && pnpm exec vitest run .it.test                      # integration, needs Docker (testcontainers Postgres)
cd server && pnpm test                                          # both
cd server && pnpm typecheck

# reviewer-core
cd reviewer-core && npm test
cd reviewer-core && npm run typecheck

# browser e2e (needs the full stack running + agent-browser installed)
./scripts/dev.sh
npm i -g agent-browser && agent-browser install
cd e2e && npm install && npm test
cd e2e && npm run typecheck
```

Conventions worth knowing:
- Any DB-backed test **must** be named `*.it.test.ts` (integration lane
  matches this glob; the unit lane excludes it).
- Tests mock the outside world by default (`server/src/adapters/mocks.ts`
  for the LLM and GitHub/git) — hermetic unless a test is explicitly `.it.test.ts`.
- Full strategy and rationale: [`TESTING.md`](TESTING.md).

## Naming conventions

- **Packages**: npm-scoped as `@devdigest/<name>` (`api`, `web`,
  `reviewer-core`, `e2e`, `shared`).
- **Server module folders** (`server/src/modules/<name>/`): plural nouns
  (`pulls`, `reviews`, `agents`, `repos`). Inside each module, files are
  named by role, not by feature: `routes.ts`, `service.ts`, `repository.ts`,
  `helpers.ts`, `constants.ts`. A file gets a more specific name only when
  it's a distinct concern (e.g. `run-executor.ts`, `diff-loader.ts`).
- **Drizzle schema files** (`server/src/db/schema/<name>.ts`): kebab-case,
  one file per domain area (e.g. `repo-intel.ts`, `pulls.ts`). Table/column
  identifiers are `camelCase` in TypeScript and mapped to `snake_case` in
  Postgres (e.g. `headSha` → `head_sha`).
- **React components** (`client/src/**/_components/<Name>/`): **PascalCase**
  folder matching the component name, containing `<Name>.tsx`, optionally
  `<Name>.test.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`.
  Route-scoped component folders live under a route's `_components/`
  directory (Next.js private folder convention).
- **Shared/generic components** (`client/src/components/<name>/`):
  kebab-case folder names (e.g. `app-shell`, `diff-viewer`,
  `repo-not-found`).
- **Client hooks** (`client/src/lib/hooks/<domain>.ts`): one file per
  domain, named after the domain (`agents.ts`, `reviews.ts`, `trace.ts`),
  exporting `use*` hooks.
- **Shared contracts** (`@devdigest/shared`): one file per bounded concern
  under `contracts/` (e.g. `findings.ts`, `review-api.ts`, `trace.ts`),
  exported as Zod schemas + inferred types.

## Do not touch

- **Database migrations** (`server/src/db/migrations/**`, including
  `meta/`): these are **generated** by `drizzle-kit generate` from the
  Drizzle schema and are numbered sequentially (`0000_init.sql`,
  `0001_...`, ...). **Never hand-edit an existing migration file** and
  never renumber/reorder them — a migration that already ran (locally, in
  CI, or in anyone else's environment) is immutable history. To change the
  schema, edit `server/src/db/schema/**` and run `pnpm db:generate` to
  produce a **new** migration file.
- **Lock files** (`server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`,
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`): **do not
  hand-edit**. They must only change as the byproduct of running the
  package manager (`pnpm install`, `npm install`, or adding/removing a
  dependency) in that specific package — never edited directly, and never
  regenerated wholesale "to clean up".
