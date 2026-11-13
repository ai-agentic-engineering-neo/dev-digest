# server — overview

## Responsibility
The only process that talks to Postgres, GitHub, git, and the LLM providers. It imports repos and PRs, indexes
clones with `src/modules/repo-intel`, stores agents, runs reviews (`src/modules/reviews/run-executor.ts` →
`reviewPullRequest` from reviewer-core), persists reviews/findings/runs/traces, and streams run events over SSE.

## What it does NOT do
- No prompt assembly, grounding, or score math: those are imported from `@devdigest/reviewer-core`.
  `src/platform/{prompt,grounding,structured}.ts` are re-export shims kept for old import paths.
- No migrations on boot: `pnpm db:migrate` runs `src/db/migrate.ts`. `buildApp` only reaps stale `running` runs.
- No secrets in DB, env schema, or `AppConfig`: `src/adapters/secrets/local.ts` (`~/.devdigest/secrets.json`) is the single read chokepoint.
- No UI. The client is a separate Next.js process on `WEB_PORT`; CORS allows only that origin (`src/app.ts`).

## Dependencies
| Direction | What | Evidence |
|---|---|---|
| out → `reviewer-core` | `reviewPullRequest`, `countBlockers`, `OpenRouterProvider`, helpers | `src/modules/reviews/run-executor.ts`, `src/platform/container.ts`; alias in `tsconfig.json` + `vitest.config.ts` → `../reviewer-core/src` |
| out → `@devdigest/shared` | every Zod contract and adapter interface | `src/vendor/shared/index.ts` (the package **hosts** the canonical copy) |
| in ← `reviewer-core` | type-only imports of contracts; `test/run.test.ts` uses `src/adapters/mocks.ts` | `reviewer-core/tsconfig.json` paths |
| in ← `client` | HTTP only (`NEXT_PUBLIC_API_BASE`), no code import; client keeps its own copy of `vendor/shared` | `client/src/lib/api.ts` |
| in ← `e2e` | HTTP only, through the browser | `e2e/run.ts` |
| CI coupling | reviewer-core deps must be installed before server jobs | `.github/workflows/server-unit.yml`, `server-integration.yml`, `e2e-web.yml` |

## Public interface
- HTTP routes registered by each `src/modules/<name>/routes.ts`; the registry is `src/modules/index.ts`
  (static, no autoload). Full route map: `README.md` "API map".
- Request/response shapes are Zod schemas from `src/vendor/shared/contracts/*.ts` passed as `schema.params` / `schema.body`
  (`fastify-type-provider-zod`). Invalid input → 422 envelope from the handler in `src/app.ts`.
- `buildApp()` in `src/app.ts` is exported for tests (`app.inject()`); `src/server.ts` is the process entry.
- Contracts are consumed by the client by copy (`client/src/vendor/shared`), so a contract change is a two-file edit.

## Invariants
- Every domain table carries `workspace_id`; handlers resolve it with `getContext` (`src/modules/_shared/context.ts`).
- Validation only via route schemas, never `Schema.parse(req.body)` in handlers (`CLAUDE.md`).
- Services depend on container interfaces (`src/platform/container.ts`, `ContainerOverrides`), never on concrete adapters; tests inject `src/adapters/mocks.ts`.
- Repo-intel is read only through the facade `container.repoIntel` (`src/modules/repo-intel/service.ts`); pipeline internals are private.
- Unknown run cost is `null`, never `0` (`src/modules/pulls/cost.ts`, `reviewer-core/specs/00-cost-usd-contract.md`).
- A test that imports `test/helpers/pg.ts` must be named `*.it.test.ts`; CI selects lanes by that glob.
- Boot reaping assumes one API instance per database (`src/app.ts`).
- Global rate limit (120/min) is off under `NODE_ENV=test`; `/health*` and SSE are always exempt.
