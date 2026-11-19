# server — `@devdigest/api`

## Map

| Path | What |
|------|------|
| `src/server.ts` | process entry: config, listen, graceful shutdown |
| `src/app.ts` | `buildApp()` — plugins, host/origin guard, error handler, stale-run reaper, module registration |
| `src/modules/index.ts` | static module registry |
| `src/modules/<name>/` | feature module: `routes.ts` (Fastify plugin) → `service.ts` → `repository.ts`, plus `helpers.ts` / `constants.ts` |
| `src/modules/_shared/` | request context + shared route schemas |
| `src/platform/` | `container.ts` (DI composition root), config, jobs (p-queue + `jobs` table), SSE run bus, errors, local-only guard |
| `src/adapters/` | port implementations (LLM, GitHub, git, ast-grep, depgraph, tokenizer, secrets) + `mocks.ts` |
| `src/db/` | `schema/*.ts` (Drizzle), `migrations/`, `migrate.ts`, `seed.ts` |
| `src/vendor/shared/` | `@devdigest/shared` — the source of truth for contracts |
| `test/` | vitest suites |

## Stack (server-only)

Fastify 5 + `fastify-type-provider-zod` · Drizzle ORM 0.45 / drizzle-kit 0.31 / `postgres` 3 · octokit 4 · openai 4 · `@anthropic-ai/sdk` 0.33 · `@ast-grep/napi` 0.43 (exact pin) · dependency-cruiser 17 · graphology · js-tiktoken · p-queue 8 · testcontainers 10.

## Conventions

- Relative imports carry the `.js` suffix (`'./service.js'`).
- New module: create `modules/<name>/routes.ts` exporting a Fastify plugin, then add one import + one entry in `src/modules/index.ts`. Registration is static.
- Reach other modules and adapters through `Container` getters (`agentsRepo`, `reviewRepo`, `repoIntel`, `llm()`, `github`, `git`). Keep imports inside your own module folder.
- Validate with zod schemas on the route `schema` (`withTypeProvider<ZodTypeProvider>()`); the handler receives already-parsed input.
- Throw `AppError` subclasses from `src/platform/errors.ts`; the global handler maps them to the error envelope.
- Read secrets only via `SecretsProvider` (`container.secrets`); `AppConfig` holds non-secret config.
- A test that touches Postgres is named `*.it.test.ts`. Everything else stays hermetic using `src/adapters/mocks.ts` + `ContainerOverrides`.

## Gotchas

- `src/platform/{grounding,structured,prompt}.ts` are re-exports of `reviewer-core`; change the logic in `reviewer-core/src`.
- The DB schema already holds tables for future milestones (eval, ci, plugins, onboarding, …). Empty tables are expected; keep them.
- `src/vendor/shared` is also consumed by `reviewer-core` (alias to `../server`) and copied into `client/src/vendor/shared`. A contract change affects all three.
- Duplicate zod module instances make `instanceof ZodError` unreliable; match by shape, as `app.ts` does.
- `reapStaleRuns` on boot marks every `running` run as orphaned — valid only with a single API instance per DB.
- The global rate limit is off under `NODE_ENV=test`; per-route limits still apply.
- `pulls`, `polling`, `settings`, `workspace` are routes-only modules (DB and adapter calls inline in `routes.ts`).

## Pointers

- Read when you need the API map, env vars, the request/DI flow or how review context is assembled: [README.md](README.md)
- Read when touching indexing or the `repoIntel` facade: [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md)
- Read when changing prompt assembly, grounding or the review pipeline: [../reviewer-core/CLAUDE.md](../reviewer-core/CLAUDE.md)
- Read when writing or running tests: [../TESTING.md](../TESTING.md)
- Read when you need design notes or how-tos for this module: [docs/](docs/)
- Read when implementing or changing a feature here: [specs/](specs/)
- Read when starting non-trivial work here; append when you find something non-obvious: [INSIGHTS.md](INSIGHTS.md)
