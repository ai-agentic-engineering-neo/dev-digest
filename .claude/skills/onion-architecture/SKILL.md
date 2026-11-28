---
name: onion-architecture
description: "Onion Architecture for the DevDigest backend (server/ Fastify + Drizzle + Zod modules and the reviewer-core engine): which ring a piece of code belongs to, which imports are allowed, how Fastify routes, Drizzle repositories, Zod contracts, SDK adapters (Octokit, OpenAI, Anthropic, simple-git), JobRunner and SSE fit the rings, and how it is enforced with dependency-cruiser (`pnpm arch:check`). Use whenever you create or change a server module, route, service, use case, repository, adapter, job handler or reviewer-core code, move logic between files, or review a backend PR for structure — even if the question is just 'where should this go?'. Not for Fastify API details (fastify-best-practices), Drizzle syntax (drizzle-orm-patterns) or schema design (postgresql-table-design)."
metadata:
  tags: architecture, onion, clean-architecture, ports-and-adapters, fastify, drizzle, zod, backend
---

# Onion Architecture — DevDigest backend

**One rule:** source code depends only on rings *closer to the centre*. Inner rings define interfaces (ports); outer rings implement them. The core must compile and run without Fastify, Drizzle, Postgres or any SDK.

## Rings of a server module (`server/src/modules/<m>/`)

```
            ┌───────────────────────────────────────────────┐
            │ UI: routes.ts        Infrastructure/  adapters/ │  ← Fastify, Zod DTOs, Drizzle, SDKs
            │   ┌───────────────────────────────────────┐   │
            │   │ application-services/  (use cases)    │   │  ← orchestration, transactions
            │   │   ┌───────────────────────────────┐   │   │
            │   │   │ domain-services/ (ports.ts)   │   │   │  ← repository/port interfaces, cross-entity rules
            │   │   │   ┌───────────────────────┐   │   │   │
            │   │   │   │ domain-model/         │   │   │   │  ← entities, value objects, invariants
            │   │   │   └───────────────────────┘   │   │   │
            │   │   └───────────────────────────────┘   │   │
            │   └───────────────────────────────────────┘   │
            └───────────────────────────────────────────────┘
   compose.ts (per module) + platform/container.ts = composition root — the only place that wires concrete classes.
```

| Ring | Folder / file | May import | Must NOT import |
|---|---|---|---|
| Domain model | `domain-model/` | `domain-model/`, `platform/errors.ts`; `import type` of enum-like types from `@devdigest/shared` | Zod schemas, Drizzle, `db/`, Fastify, SDKs, `Container`, any outer ring |
| Domain services | `domain-services/` (`ports.ts`, pure logic over several entities) | domain-model, port types from `@devdigest/shared` | application-services, infrastructure, routes, `db/`, Drizzle, SDKs, `Container` |
| Application services | `application-services/<verb>-<noun>.ts` | domain-*, ports, `@devdigest/shared` contracts | infrastructure, routes, `db/`, Drizzle, `adapters/`, `platform/container`, Fastify |
| Infrastructure | `infrastructure/` (Drizzle repos, mappers, job handlers), `src/adapters/**` | any inner ring, `db/`, Drizzle, SDKs | routes.ts, Fastify |
| UI | `routes.ts` (Fastify plugin) | application-services, `compose.ts`, Zod contracts, `_shared/` | Drizzle, `db/`, repositories, adapters |
| Composition root | `compose.ts`, `platform/container.ts` | everything | — |

Full rules and rationale: `references/layers.md`.

## Where does this code go? (decision tree)

1. Is it a business rule/invariant on one entity ("a run can be cancelled only while `running`")? → `domain-model/` as a method or pure function next to the type.
2. Does it need data it doesn't hold (DB, GitHub, LLM, clock, queue)? → declare a **port** in `domain-services/ports.ts` (or reuse one from `@devdigest/shared/adapters.ts`), call it from `application-services/`.
3. Does it orchestrate steps (load → decide → persist → enqueue → publish SSE), own a transaction or check workspace access? → `application-services/`.
4. Does it talk SQL / Drizzle / an SDK / the filesystem? → `infrastructure/` (module-specific) or `src/adapters/` (shared external system), implementing a port. Map rows/SDK payloads to domain types **here**.
5. Is it HTTP: parse params/body, pick a status code, shape the JSON? → `routes.ts`. Map domain → DTO with `toXxxDto` here.
6. Is it a literal or a pure formatter used by one ring? → colocate it in that ring (`constants.ts` / `*.helpers.ts` inside the ring folder).

## Tool rules (summary — details in references/)

- **Fastify** (`references/fastify.md`): one encapsulated plugin per module; routes are thin (parse → call use case → map → reply); no business logic in hooks/decorators; `fastify-plugin` only for cross-cutting concerns (container, auth); `AppError` → HTTP only in the global error handler.
- **Zod** (`references/zod.md`): parse, don't validate — at every edge (HTTP, GitHub/LLM responses, job payloads read from the DB, config). `@devdigest/shared` schemas are DTOs, not domain entities: entities have their own types in `domain-model/`; enum-like types may be shared.
- **Drizzle** (`references/drizzle.md`): only in `infrastructure/` repositories; repository implements a port and returns domain types via `toDomain()` — `$inferSelect` rows never leave it; every query filters by `workspaceId`; transactions through a `UnitOfWork` port, repositories accept `tx`.
- **SDKs** (`references/adapters.md`): Octokit, OpenAI, Anthropic, simple-git, ripgrep, ast-grep only in `src/adapters/**` behind a port; JobRunner and the SSE bus are ports to use cases (`JobQueue`, `RunEvents`).
- **DI**: constructor injection of ports; `Container` is touched only by `compose.ts` / routes wiring. No Awilix/Inversify — manual wiring is enough (Palermo, Part 4).
- **Tests** (`references/testing.md`): domain = plain unit tests; application = in-memory fakes of ports; infrastructure = `*.it.test.ts` with testcontainers.
- **reviewer-core** (`references/reviewer-core.md`): the engine *is* a core — pure, dependencies as parameters; `openai` only in `src/llm/`.

## Enforcement

`cd server && pnpm arch:check` — dependency-cruiser with `server/.dependency-cruiser.cjs` over `server/src` + `reviewer-core/src`. All rules are **warn** during adoption (exit 0). Run it after every backend change and don't add new warnings; flip a rule to `error` when its count reaches zero (`references/enforcement.md`).

## Working on code

- **New module** → follow `templates/module/` exactly; register in `src/modules/index.ts`.
- **Touching a legacy module** (`routes.ts` + `service.ts` + `repository.ts`) → don't rewrite it wholesale; apply the strangler steps in `references/migration.md` to the part you touch, and never copy legacy modules that query Drizzle from `routes.ts` (`settings`, `polling`, `workspace`, `pulls`).
- **Reviewing a PR** → use the checklist below; cite the ring and rule name from `arch:check`.

## Checklist (new code and reviews)

- [ ] No new `arch:check` warnings.
- [ ] `routes.ts` has no Drizzle/`db` import and no business `if`s — only parsing, a use-case call, DTO mapping and status codes.
- [ ] Use cases receive ports through the constructor, not `Container`.
- [ ] Repository methods return domain types, take `workspaceId`, accept an optional `tx`.
- [ ] External input is `parse`d once at the edge; nothing inside re-validates it.
- [ ] Domain types don't import Zod schemas or `$inferSelect` rows.
- [ ] Use-case tests run without Docker (fakes); repository tests are `*.it.test.ts`.

## Anti-patterns

| Smell | Why it hurts | Fix |
|---|---|---|
| Drizzle query in `routes.ts` | UI ring depends on persistence; logic untestable without Postgres | move to repository + use case |
| Service returns `typeof t.repos.$inferSelect` | DB format crosses inward (Clean Architecture: rows must not cross boundaries) | `toDomain()` in the repository |
| `new XRepository(container.db)` inside a service | concrete infra in the core + service locator; can't swap for a fake | inject the port in `compose.ts` |
| `container.jobs.enqueue` / `runBus.publish` in a use case | hidden dependency on platform | `JobQueue` / `RunEvents` ports |
| All logic in `helpers.ts`, entities are bare types | anemic domain model | move rules onto the entity in `domain-model/` |
| Layers for a 2-endpoint CRUD | ceremony without benefit (Palermo: "not appropriate for small websites") | collapse: `domain-model/` + one use case + repo is fine; skip `domain-services/` when there are no shared rules |
| `payload as CloneJobPayload` | trusting persisted, possibly stale data | parse with a Zod schema in the job handler |

## Sources

See `SOURCES.md` (primary: Palermo 2008/2013, Uncle Bob 2012, Cockburn; tooling: Fastify, Drizzle, dependency-cruiser docs).
