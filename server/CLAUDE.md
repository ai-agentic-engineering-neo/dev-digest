# CLAUDE.md — `@devdigest/api`

> **Load this file when** you are working inside `server/` — adding or editing routes, services, adapters, DB schema/migrations, or server-side tests. Skip it when the task is purely in `client/`, `reviewer-core/`, or `e2e/`.
>
> For non-obvious design decisions and known gotchas in this package, read [`insights.md`](./insights.md). For deeper architecture notes or ADRs, check [`docs/`](./docs/). For behavioural specs, check [`specs/`](./specs/).

This file provides guidance to Claude Code when working inside `server/`.

## Package role

Fastify 5 API + Drizzle/Postgres backend. Owns: repo cloning, PR import, agent CRUD, review execution, repo indexing, settings. All LLM/GitHub/git calls go through injected adapters — the DI container makes every adapter swappable in tests.

## Commands

```sh
pnpm dev              # API on :3001 (tsx watch)
pnpm test             # unit + integration
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit only, no Docker
pnpm exec vitest run .it.test                      # integration only, needs Docker
pnpm typecheck
pnpm db:generate      # emit migration after schema changes
pnpm db:migrate       # apply migrations (never runs on boot)
pnpm db:seed          # idempotent: acme/payments-api, PR #482, 2 agents
```

## Key files

| File | Role |
|------|------|
| `src/app.ts` | `buildApp()` — wires plugins, container, error handler, modules |
| `src/server.ts` | entry point, starts listening |
| `src/platform/container.ts` | DI container — holds all adapters; tests use `ContainerOverrides` |
| `src/platform/config.ts` | `AppConfig` — env vars only; secrets go through `SecretsProvider` |
| `src/platform/errors.ts` | `AppError` — the only way to return a non-500 from a service |
| `src/modules/index.ts` | static module registry — add new modules here |
| `src/adapters/mocks.ts` | `MockLLMProvider`, `MockGitClient`, etc. — test entry point |
| `src/db/schema/` | Drizzle schema files (full schema including future-milestone tables) |

## Module structure

Each module is a self-contained Fastify plugin: `routes.ts` → `service.ts` → `repository.ts`.

| Module | Routes prefix | What it does |
|--------|--------------|--------------|
| `repos` | `/repos` | Clone repo, track index state |
| `pulls` | `/pulls` | Import PRs (diff, commits, comments) from GitHub |
| `reviews` | `/pulls/:id/review`, `/reviews`, `/runs` | Execute agent reviews, stream SSE traces, accept/dismiss findings |
| `agents` | `/agents` | CRUD agent configs (model + system prompt) |
| `repo-intel` | `/repos/:id/index-state`, `/resync` | Trigger/query codebase indexing |
| `polling` | `/repos/:id/poll` | Background PR refresh from GitHub |
| `settings` | `/settings`, `/providers` | LLM provider config, model selection |
| `workspace` | `/workspace` | Workspace metadata |

## Review execution (`modules/reviews/run-executor.ts`)

`RunExecutor` owns the background run lifecycle:
1. Loads diff via `diff-loader.ts` (from clone dir or GitHub)
2. Fetches repo map from `repo-intel` if `REPO_INTEL_ENABLED=true` and repo is indexed
3. Calls `reviewPullRequest()` from `@devdigest/reviewer-core`
4. Streams events over SSE bus (`platform/sse.ts`)
5. Persists findings; recomputes score from grounded findings only

Orphaned `running` runs are reaped at boot in `buildApp()` before any requests are accepted.

## Repo-intel pipeline (`modules/repo-intel/pipeline/`)

| File | Stage |
|------|-------|
| `walk.ts` | Enumerate files (respects `.gitignore`) |
| `full.ts` | Full index from scratch |
| `incremental.ts` | Diff-based update |
| `rank.ts` | Score files by importance |
| `repo-map.ts` | Assemble the repo map string fed to reviewer |

## DI & testing pattern

```ts
// In tests — override specific adapters, keep the rest real or default-mocked
const app = await buildApp({
  overrides: {
    llm: { openai: new MockLLMProvider() },
    github: new MockGitHubClient(),
  }
});
```

Integration tests (`*.it.test.ts`) use `test/helpers/pg.ts` to spin up a real Postgres via testcontainers. Any test that imports `test/helpers/pg.ts` **must** use the `.it.test.ts` suffix.

## Error handling

- Route validation failures → `422` (handled by `fastify-type-provider-zod` automatically)
- Service errors → throw `AppError(code, message, statusCode)` → structured `{ error: { code, message } }` envelope
- Never throw raw errors from services expecting specific HTTP status codes

## Secrets

Keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`) never live in `AppConfig`. They are read exclusively through `LocalSecretsProvider` from `~/.devdigest/secrets.json` (mode `0600`), with `process.env` as a fallback. `GITHUB_PAT` is accepted as a fallback for `GITHUB_TOKEN`.
