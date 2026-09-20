---
name: onion-architecture
description: "Enforces Onion Architecture (dependency rule, ports & adapters, repository/DTO mapping) for the backend in server/. MUST be used when creating, moving, reviewing or refactoring anything in server/src/modules, server/src/adapters, server/src/platform or server/src/db — new modules, routes, services, repositories, adapters, Container wiring — and whenever a change adds an import between those areas or a query outside a repository. Covers Fastify routes, Drizzle repositories, Zod/@devdigest/shared contracts, LLM/GitHub/git adapters, DI via the Container, and the dependency-cruiser boundary check (pnpm arch:check). Trigger terms: onion architecture, layers, ports and adapters, hexagonal, clean architecture, dependency rule, repository pattern, service layer, DI container, arch:check, boundary violation."
metadata:
  tags: architecture, onion, hexagonal, clean-architecture, fastify, drizzle, backend, dependency-cruiser
---

# Onion Architecture — `server/`

**One rule:** source-code dependencies point **inward only**. Inner rings never
import outer rings; outer rings implement interfaces the inner rings own.
"The database is not the center. It is external." (Palermo)

Applies to `server/` only. `reviewer-core/` is already a pure engine (no DB, no
GitHub, no fs; only an injected `LLMProvider`) — keep it that way. `client/` is
out of scope.

## Ring map (flat files per module — no domain/application/infrastructure subfolders)

| Ring | Files | May import | Must NOT import |
|---|---|---|---|
| **1. Domain model** | `helpers.ts` (pure), `status.ts`, `constants.ts`, domain types, `@devdigest/shared` enums/contracts, `reviewer-core` | ring 1 only | fastify, drizzle, `db/*`, `adapters/*`, `platform/container` |
| **2. Ports** | `vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, …), per-module `types.ts` (e.g. `repo-intel/types.ts`), repository interfaces | ring 1 | anything with I/O |
| **3. Application services** | `service.ts`, `run-executor.ts`, `findings.ts`, `diff-loader.ts`, `pipeline/*` | rings 1–2 | fastify, drizzle, `db/*`, concrete `adapters/*`, the whole `Container` |
| **4. Edge** | `routes.ts` (UI), `repository.ts` / `repository/*.repo.ts` (persistence), `adapters/**` (SDKs), `db/**`, `platform/container.ts` (composition root) | anything inward | other modules' internals; `adapters/**` must not import `modules/**` |

- The **only** files allowed to import `drizzle-orm` or `db/schema|rows`: repositories, `db/**`, `adapters/**`, the composition root.
- The **only** files that import `fastify` today (keep it that way): `routes.ts`, `modules/index.ts` (registry), `_shared/context.ts`, `app.ts`.
- **`platform/container.ts` is the sole composition root.** It may import everything; nothing else may import it except routes (to reach `app.container`) and `_shared/context.ts`.
- **A module's public surface** is `index.ts` + `types.ts`. Everything else is private (`no-cross-module`). Cross-module needs go through a port on the Container or `_shared/`.

## Before you write code (checklist)

1. Which ring does each new file belong to? Name it by the ring map (`routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `types.ts`).
2. Does a route handler do more than: validate (Zod schema) → **one** service call → return? Move the rest into the service.
3. Is there any `eq(...)`, `db.select`, `$inferSelect` outside a repository? Move it. Repositories return **domain/DTO-ready types via a mapper**, never `typeof t.x.$inferSelect`.
4. Does the service take `Container`? Give it an explicit `Deps` object of ports instead (see `rules/platform-di.md`).
5. New external SDK or system? Define a port first (`vendor/shared/adapters.ts` or module `types.ts`), then the adapter (an anti-corruption translator), then a mock in `adapters/mocks.ts`.
6. Does the adapter import from `modules/**`? Move the shared constant/type to a neutral place (`vendor/shared` or `adapters/`).
7. Are you parsing/validating inside a handler or service? Put the Zod schema on the route (`schema: { body, params }`) — validate once, at the boundary.
8. Do DTO field names (snake_case contract) leak into services? Services work with domain shapes; mappers translate at the edges.
9. Does the change need a transaction? The **service** owns the boundary; repositories accept an optional `tx` (`rules/drizzle.md`).
10. Run `cd server && pnpm arch:check` (and `pnpm typecheck`). New violations fail; do not add to the baseline.

## Documented compromises (do not "fix" without discussion)

- **`@devdigest/shared` is a shared kernel**: Zod contracts double as API DTOs *and* common vocabulary (`Provider`, `ReviewStrategy`, `CiFailOn`) used by services. Enums/value types may be shared inward; request/response *envelope* shapes stay at the edge. It is vendored — mirror changes into `client/src/vendor/shared`.
- **`AppError` carries `statusCode`** (`platform/errors.ts`). Services may throw the `AppError` family (`NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`); the Fastify error handler is the only place that turns them into HTTP. Do not add other HTTP concepts (reply, req, headers) to inner rings.
- **`agents/` and `repos/` are the exemplars for file layout**, not yet for DI — they still take the whole `Container` (tracked in the baseline).
- Services may currently import their own module's concrete `repository.ts` class. Prefer typing against an interface in `types.ts` when you need a fake in unit tests (`rules/testing.md`).

## Enforcement & known debt

`server/.dependency-cruiser.cjs` encodes the rules (`routes-no-persistence`, `inner-no-outer`, `inner-no-container`, `only-repository-touches-db`, `adapters-no-modules`, `no-cross-module`, `platform-not-inward`, `no-circular`). Pre-existing violations are ratcheted in `server/.dependency-cruiser-known-violations.json` — it may only **shrink**. Details, the violation map and the refactor phases: [rules/enforcement.md](rules/enforcement.md).

## Rules index

- [rules/fastify.md](rules/fastify.md) — routes as the edge, validation, error mapping, plugins vs DI
- [rules/drizzle.md](rules/drizzle.md) — repositories, mappers, transactions, schema types stay in infra
- [rules/contracts-zod.md](rules/contracts-zod.md) — `@devdigest/shared` DTOs vs domain types, parse at the boundary
- [rules/adapters.md](rules/adapters.md) — ports for Anthropic/OpenAI/OpenRouter/Octokit/simple-git/ast-grep/ripgrep/tiktoken
- [rules/platform-di.md](rules/platform-di.md) — Container as composition root, `Deps` objects, jobs/SSE/logging
- [rules/testing.md](rules/testing.md) — fakes for ports, unit vs `*.it.test.ts`, route `inject`
- [rules/enforcement.md](rules/enforcement.md) — `pnpm arch:check`, baseline ratchet, violation map, refactor phases
- [examples.md](examples.md) — good/bad pairs taken from this repo
- [references.md](references.md) — sources and rationale (with links)

## Related skills

`fastify-best-practices` (HTTP mechanics), `drizzle-orm-patterns` (query/schema syntax), `zod` (schema API), `postgresql-table-design` (schema), `security` (secrets, input), `typescript-expert` (types). This skill decides **where code lives and what may import what**; those decide **how to write it**.
