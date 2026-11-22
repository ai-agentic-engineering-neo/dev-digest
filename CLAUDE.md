# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation structure

This repo has layered docs — load only what the current task needs.

| File | Load when |
|------|-----------|
| `server/CLAUDE.md` | Working on the Fastify API: routes, services, adapters, DB, tests |
| `client/CLAUDE.md` | Working on the Next.js UI: pages, components, hooks, client tests |
| `reviewer-core/CLAUDE.md` | Working on the review engine: prompt, grounding, structured output, LLM |
| `e2e/CLAUDE.md` | Writing or debugging browser e2e flows |
| `<package>/insights.md` | Debugging something unexpected, making a non-obvious design decision, or wondering "why does this work this way?" in that package |
| `<package>/docs/` | Deeper architecture diagrams or decision records for that package (add here as the project grows) |
| `<package>/specs/` | Behavioural specs or test scenarios for that package (add here as the project grows) |

The root CLAUDE.md (this file) is always loaded. Package-level files are opt-in — read them when you're actually working in that package.

## Session protocol for insights

`<module>/insights.md` is a durable log of non-obvious findings for that module. The `engineering-insights` skill writes to it.

- **On task start** (when the task touches a specific module): read that module's `insights.md` and treat its entries as high-confidence guidance unless something newer contradicts them.
- **Mid-session**: when you hit something non-obvious — a gotcha, a reusable pattern, a library quirk, a decision with a reason — invoke the `engineering-insights` skill to record it.
- **On task end** (sessions >30 min that produced a problem, solution, or discovery): invoke `engineering-insights` for the wrap-up. Don't skip. Trivial sessions (typos, config bumps) don't need a wrap-up.

## Project overview

DevDigest is a local-first AI pull-request review tool. It is **not a monorepo workspace** — four independent packages share code only through TypeScript path aliases, not published modules.

| Package | Folder | Port |
|---------|--------|------|
| `@devdigest/api` | `server/` | 3001 |
| `@devdigest/web` | `client/` | 3000 |
| `@devdigest/reviewer-core` | `reviewer-core/` | — |
| `@devdigest/e2e` | `e2e/` | — |
| `@devdigest/shared` | `server/src/vendor/shared` | — |

`reviewer-core` is consumed by the server as TypeScript source via a tsconfig path alias (`@devdigest/reviewer-core` → `../reviewer-core/src`). It never emits JS.

Shared Zod contracts live at `server/src/vendor/shared` and are aliased into every package as `@devdigest/shared`. One schema definition drives request validation **and** response serialization in the API.

## Development

```sh
# Full stack from zero (Postgres + API + web)
./scripts/dev.sh                   # flags: --no-seed --no-client --db-only

# Or manually:
docker compose up -d               # Postgres + pgvector
cd server && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
cd client && pnpm install && pnpm dev
```

Postgres runs in Docker; the API and web app run on the host. Migrations are **not** applied on boot — always run `pnpm db:migrate` manually after creating or pulling new migrations.

Secrets (API keys, GitHub token) are stored in `~/.devdigest/secrets.json` (mode `0600`) with `process.env` as a fallback — never in git or the database. The read chokepoint is `LocalSecretsProvider` (`server/src/adapters/secrets/local.ts`).

## Commands

```sh
# Server
cd server
pnpm dev             # API on :3001
pnpm test            # unit + integration
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit only (no Docker)
pnpm exec vitest run .it.test                      # integration only (needs Docker)
pnpm typecheck
pnpm db:generate     # generate new migration after schema changes
pnpm db:migrate      # apply migrations
pnpm db:seed         # idempotent demo data

# Client
cd client
pnpm dev             # web on :3000
pnpm test
pnpm typecheck

# reviewer-core
cd reviewer-core
npm test
npm run typecheck    # also the "build" — it emits no JS

# E2E (needs full stack + agent-browser CLI)
npm i -g agent-browser && agent-browser install
./scripts/e2e.sh     # hermetic isolated stack (recommended)
cd e2e && npm install && npm test  # against your own running stack
```

## Architecture

### Request & DI flow (server)

Fastify 5 with `fastify-type-provider-zod` — routes declare Zod schemas and get request validation + response serialization for free. Invalid input is rejected with 422 **before** the handler runs.

```
HTTP request → plugins (helmet, cors, rate-limit, SSE)
             → route zod schema validation
             → feature module (modules/<name>/routes.ts)
             → service
             → DI Container (platform/container.ts)
             → adapters (llm, github, git, astgrep, tokenizer, secrets)
             → Drizzle → Postgres
```

The `Container` class (`server/src/platform/container.ts`) is attached to every Fastify instance as `app.container`. Tests inject mocks via `ContainerOverrides`; real adapters are in `server/src/adapters/`. The main mock entry point is `server/src/adapters/mocks.ts` (`MockLLMProvider`, `MockGitClient`, etc.).

Modules are statically registered in `server/src/modules/index.ts`. Each module is a self-contained Fastify plugin: `modules/<name>/routes.ts`, `service.ts`, `repository.ts`.

### Review pipeline (reviewer-core)

```
diff + system prompt + repo map
  → assemblePrompt()     (prompt.ts — adds INJECTION_GUARD to every agent prompt)
  → LLMProvider          (injected; real = openrouter/openai/anthropic)
  → structured output    (llm/structured.ts — Zod → JSON Schema, parse-with-repair)
  → groundFindings()     (grounding.ts — drops findings not citing a real diff line)
  → Review { verdict, score, findings }
```

The grounding gate is mandatory. The score is recomputed from surviving findings — the model's self-reported score is ignored. The `INJECTION_GUARD` constant in `reviewer-core/src/prompt.ts` is the prompt-injection defense (not text parsing).

The server assembles review context in `server/src/modules/reviews/run-executor.ts`. When `REPO_INTEL_ENABLED=true` (default), a repo map from `repo-intel` enriches the prompt once the repo is indexed; unindexed repos silently degrade to diff-only.

### Client

Next.js 15 App Router + React 19 + TanStack Query. Data hooks in `client/src/lib/hooks/*` call the Fastify API via `client/src/lib/api.ts` (`NEXT_PUBLIC_API_BASE`). Pages are thin; feature logic sits in colocated `_components/<Name>/` folders alongside `*.test.tsx` files.

## Testing conventions

- **`*.it.test.ts`** = DB-backed integration test. These start a real Postgres via testcontainers (`server/test/helpers/pg.ts`), migrate + seed, and exercise routes end-to-end. They self-skip when Docker is absent. Any test importing `test/helpers/pg.ts` **must** use this suffix.
- Everything else is hermetic — mock adapters, no Docker, no keys.
- E2E flows (`e2e/specs/*.flow.json`) target read-only seeded data. Run the hermetic runner (`./scripts/e2e.sh`) rather than against your dev DB — flow 02/04/05 require the seeded demo repo to be the only repo.

## DB schema

Schema files are in `server/src/db/schema/`. The full schema is already defined (including tables for future milestones); unused tables sit empty. After editing schema files, run `pnpm db:generate` to emit a migration, then `pnpm db:migrate` to apply it.

## Key environment variables (server/.env)

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `postgres://devdigest:devdigest@localhost:5432/devdigest` | required |
| `API_PORT` / `WEB_PORT` | `3001` / `3000` | also gates CORS allowed origin |
| `REPO_INTEL_ENABLED` | `true` | repo map context in reviews |
| `EMBEDDINGS_ENABLED` | `false` | OpenAI embeddings; off = zero OpenAI calls |
| `LOG_LEVEL` | `info` (`silent` in test) | pino level |

API keys and `GITHUB_TOKEN` go through `SecretsProvider`, not `AppConfig`.
