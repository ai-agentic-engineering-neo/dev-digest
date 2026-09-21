# server — structure

## Folders
| Path | Purpose |
|---|---|
| `src/server.ts` | Process entry: `loadConfig` → `buildApp` → listen; SIGTERM/SIGINT close. |
| `src/app.ts` | `buildApp`: zod type provider, helmet/cors/rate-limit/SSE, stale-run reaping, `/health`, error envelope, module registration. |
| `src/modules/index.ts` | Static module registry (`settings, repos, pulls, polling, workspace, agents, reviews, repoIntel`). |
| `src/modules/<name>/` | One feature: `routes.ts` (Fastify plugin) → `service.ts` → `repository.ts`; pure helpers as `<noun>.ts` (`pulls/cost.ts`, `pulls/severity.ts`, `pulls/status.ts`). |
| `src/modules/reviews/` | Run lifecycle: `run-executor.ts` (diff → repo-intel → engine → persist + trace), `repository/{review,run,pull}.repo.ts`, `findings.ts` (accept/dismiss), `diff-loader.ts`. |
| `src/modules/repo-intel/` | Indexer pipeline (`pipeline/full.ts`, `incremental.ts`) + facade `service.ts`; own `README.md`. |
| `src/modules/_shared/` | `context.ts` (`getContext` → workspaceId/userId), `schemas.ts` (`IdParams` uuid). |
| `src/platform/` | `config.ts` (env → `AppConfig`), `container.ts` (DI), `sse.ts` (`RunBus`), `jobs.ts` (p-queue + `jobs` table), `price-book.ts`, `errors.ts`, `run-logger.ts`, `trace-builder.ts`. |
| `src/adapters/<port>/` | Implementations of `@devdigest/shared` interfaces: `llm/{openai,anthropic}.ts` + `pricing.ts`, `github/octokit.ts`, `git/simple-git.ts` + `diff-parser.ts`, `secrets/local.ts`, `auth/local.ts`, `codeindex/ripgrep.ts`, `astgrep/`, `depgraph/`, `embedder/`, `tokenizer/`. `mocks.ts` = test doubles. |
| `src/db/` | `schema.ts` barrel over `schema/*.ts` (all tables, incl. future lessons), `migrations/` (drizzle-kit output, never edit), `migrate.ts`, `seed.ts` (idempotent demo: `acme/payments-api`, PR #482), `seed-prompts.ts`, `rows.ts`. |
| `src/vendor/shared/` | Canonical `@devdigest/shared`: `contracts/*.ts` + `adapters.ts`. Mirrored by hand into `client/src/vendor/shared`. |
| `src/prompts/` | Non-review system prompts (`onboarding.system.md`). Reviewer prompts live in `docs/agent-prompts/` at repo root and in the DB. |
| `test/` | vitest: hermetic `*.test.ts`, DB-backed `*.it.test.ts`; `helpers/pg.ts` (testcontainers), `helpers/runs.ts`. |
| `specs/` | Feature contracts: `001-run-cost.md`, `002-pr-severity-counts.md`, template in `README.md`. |

## Entry points
- Dev: `pnpm dev` → `tsx watch src/server.ts` (:3001). CI e2e starts it with `pnpm exec tsx src/server.ts` (`.github/workflows/e2e-web.yml`).
- Tests: `vitest.config.ts` (aliases for shared + reviewer-core, 120 s timeouts for containers).
- DB tooling: `drizzle.config.ts` (`schema: ./src/db/schema.ts`, `out: ./src/db/migrations`).
- Lint: `eslint.config.mjs`. Env: `.env.example` → `.env`.

## Reference files
- To see routes with `params`/`body` Zod schemas on the type provider, read `src/modules/agents/routes.ts`; per-route rate-limit overrides are in `src/modules/reviews/routes.ts` (`POST /pulls/:id/review`).
- To see a pure, unit-testable rollup helper next to its route, read `src/modules/pulls/cost.ts` with `test/pulls-cost.test.ts`.
- To see how a review run is executed and persisted end to end, read `src/modules/reviews/run-executor.ts` (search `reviewPullRequest`).
- To see how adapters are constructed lazily and overridden in tests, read `src/platform/container.ts` (`ContainerOverrides`, `llm()`).
- To see a DB-backed integration test that boots the app against testcontainers, read `test/reviews.it.test.ts` with `test/helpers/pg.ts`.
- To see a no-DB route smoke test with injected mocks, read `test/routes-smoke.test.ts`.
