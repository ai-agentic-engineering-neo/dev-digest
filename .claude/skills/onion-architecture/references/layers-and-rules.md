# Layers and import rules

Rows = the file you are editing. Columns = what it imports. ✅ allowed · ⚠️ only as noted · ❌ forbidden.

| From ↓ / imports → | `@devdigest/shared` contracts & ports | `reviewer-core` | own `helpers` / `constants` / `types` | own `repository` | other module internals | `platform/*` | `adapters/*` | `db/*`, `drizzle-orm` | `fastify` | SDKs (`octokit`, `openai`, `@anthropic-ai/sdk`, `simple-git`, `@ast-grep/napi`, `node:fs`) |
|---|---|---|---|---|---|---|---|---|---|---|
| `helpers.ts`, `constants.ts`, `types.ts` | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ `errors` only | ❌ | ❌ | ❌ | ❌ |
| `service.ts`, `run-executor.ts` | ✅ | ✅ | ✅ | ✅ | ⚠️ via container facade / shared repo only | ✅ `errors`, `container` type, `jobs`, `sse` | ❌ (use the port via `container`) | ❌ | ❌ | ❌ |
| `repository.ts`, `repository/*.repo.ts` | ✅ | ❌ | ✅ | — | ❌ | ⚠️ `errors` only | ❌ | ✅ | ❌ | ❌ |
| `routes.ts` | ✅ | ❌ | ✅ | ❌ | ❌ | ⚠️ `errors` only | ❌ | ❌ | ✅ | ❌ |
| `adapters/<x>/*.ts` | ✅ (implements the port) | ✅ | — | ❌ | ❌ | ⚠️ `errors`, `resilience` | ✅ sibling adapters | ❌ (except `auth/local` reading seeded rows) | ❌ | ✅ |
| `platform/container.ts`, `modules/index.ts`, `app.ts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reviewer-core/**` | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (LLM SDK clients only, no fs/db/GitHub) |

## Where each ring lives

| Ring | Paths | Stability |
|---|---|---|
| 1 Domain model | `server/src/vendor/shared/**` (contracts), `modules/*/helpers.ts`, `modules/*/constants.ts`, `modules/pulls/status.ts`, `reviewer-core/src/**` | most stable — changing it ripples outward |
| 2 Ports | `server/src/vendor/shared/adapters.ts`, `modules/repo-intel/types.ts` (`RepoIntel`), `platform/errors.ts` | stable — a port change needs adapter + mock + client mirror |
| 3 Application | `modules/*/service.ts`, `modules/reviews/run-executor.ts`, `modules/reviews/findings.ts` | changes with features |
| 4 Infrastructure | `modules/*/repository.ts`, `modules/*/repository/*.repo.ts`, `adapters/**`, `db/**` | changes with tech choices |
| 4 Presentation | `modules/*/routes.ts`, `platform/sse.ts` | changes with API shape |
| Composition root | `platform/container.ts`, `modules/index.ts`, `app.ts`, `server.ts` | wiring only — no logic |

## Cross-module access

Feature modules are siblings, not layers — they must not reach into each other.

| Need | Do | Don't |
|---|---|---|
| Read agents from the reviews module | `container.agentsRepo` | `import { AgentsRepository } from '../agents/repository.js'` + `new` |
| Index / query a repo map | `container.repoIntel` (`RepoIntel` interface) | import `repo-intel/service.ts` or `repo-intel/repository.ts` |
| Reuse job kinds | import `../<other>/constants.js` (ring 1 — allowed) | import the other service to call its private method |
| A new cross-cutting repository | add a lazy getter in `Container` (like `agentsRepo`) | instantiate it in two modules |

## Platform folder

`platform/` mixes rings — treat each file by what it is:
- `errors.ts` — ring 2 (anyone may import)
- `config.ts` — composition root input (only container / app read it; services use `container.config`)
- `container.ts` — composition root
- `jobs.ts`, `sse.ts`, `run-logger.ts`, `trace-builder.ts` — application services (services may use them)
- `resilience.ts`, `price-book.ts`, `model-router.ts` — infrastructure helpers
- `grounding.ts`, `prompt.ts`, `structured.ts` — re-export shims of `reviewer-core`; import the engine directly
