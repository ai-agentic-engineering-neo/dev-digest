# server — `@devdigest/api`, Fastify + Drizzle engine

Full description: [README.md](README.md). Project root: [../CLAUDE.md](../CLAUDE.md)

## Commands

- `pnpm dev` — API on `:3001` (`tsx watch src/server.ts`)
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:generate` — migrations are NOT applied on boot
- `pnpm test` — unit + integration; unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`;
  integration only: `pnpm exec vitest run .it.test` (needs Docker)
- `pnpm typecheck`

## Module boundaries

- Depends on: `@devdigest/reviewer-core` (review engine, via path alias to its source),
  Postgres, GitHub, LLM providers.
- Owns `@devdigest/shared` — the source of truth is `src/vendor/shared`.
- Consumed by: `client/` (REST + SSE), `e2e/`.
- Does NOT: contain review logic (prompting, grounding, parsing) — that belongs in `reviewer-core`.

## Rules

- A feature module is `modules/<name>/` with `routes → service → repository`,
  registered by hand in `modules/index.ts`.
- External systems are reached only through `adapters/*` resolved from
  `platform/container.ts`; tests swap them via `ContainerOverrides`.
- Route schemas are the zod contracts from `@devdigest/shared` (`fastify-type-provider-zod`).
- A test that imports `test/helpers/pg.ts` must be named `*.it.test.ts`.
- Secrets go through `SecretsProvider` (`~/.devdigest/secrets.json`, env fallback), never `AppConfig`.
- Changing a shared contract → mirror it in `client/src/vendor/shared`.

## Documentation

| When | Read |
|---|---|
| Wiring a route / service / adapter | [README.md — Request & DI flow](README.md#request--di-flow) |
| Adding / reshaping a module, service, repository or adapter | `onion-architecture` skill ([SKILL.md](../.claude/skills/onion-architecture/SKILL.md)) |
| Finding an endpoint | [README.md — API map](README.md#api-map-starter) |
| Config and env vars | [README.md — Environment](README.md#environment) |
| Touching what the model sees | [README.md — Review context](README.md#review-context-non-obvious) |
| Working on indexing / repo map | [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md) |
| Writing tests | [README.md — Testing](README.md#testing), [../TESTING.md](../TESTING.md) |
| Deeper server docs | [docs/](docs/README.md) |
| Implementing a feature | [specs/](specs/README.md) — find the spec first |

## Insights

@INSIGHTS.md
