---
name: onion-architecture
description: "Onion / Clean (ports & adapters) architecture for the backend (server/: Fastify 5 + Drizzle + Postgres/pgvector + zod): which layer owns a piece of code (domain, application service, ports, inbound/outbound adapters, composition root), which direction imports may point, where Fastify / Drizzle / zod / SDK (octokit, openai, anthropic, simple-git) imports are allowed, repositories + mappers, Unit of Work for transactions, domain errors vs HTTP errors, constructor injection via the Container, and the dependency-cruiser gate (pnpm arch:check). Use this skill whenever you add or change a server module, route, service, repository, adapter, job handler or port, decide 'where should this go?', wire a dependency, review a backend PR for structure, or refactor server/ — even if the user only says 'add an endpoint', 'extract this', 'add a table and expose it' or 'is this in the right place?'. Not for Fastify/Drizzle/zod API details or schema design (see fastify-best-practices, drizzle-orm-patterns, zod, postgresql-table-design)."
metadata:
  version: "1.0.0"
  updated: "2026-10-18"
---

# Onion Architecture — backend (`server/`)

Keep business rules in the middle, frameworks at the edge, and make every
import point **inward**. Then a use case can be read, tested and changed
without Fastify, Postgres or an LLM key, and an adapter can be swapped without
touching a rule. Sources and rationale: [SOURCES.md](SOURCES.md).

## Scope — what this skill is and isn't

| Question | Skill |
|----------|-------|
| *Which layer* owns code, *where* the file lives, *which way* it may import, *how* deps are wired | **this skill** |
| Fastify API mechanics (hooks, plugins, schemas, serialization) | `fastify-best-practices` |
| Drizzle query/relations/migration syntax | `drizzle-orm-patterns` |
| Table/index design | `postgresql-table-design` · validation details: `zod` |

On a *placement/dependency* question this skill wins; on a *how-to-write-it*
question the sibling wins. Repo rules in `CLAUDE.md` files win over both.

## Before you start

1. Read `server/CLAUDE.md` and `server/INSIGHTS.md` (root CLAUDE.md requires it).
2. Open 2–3 sibling modules in `server/src/modules/` and match their naming.
3. Run `cd server && pnpm arch:check` before and after your change.

## Adoption policy (decided 2026-10-18)

- **New code is strict**: every rule below applies to new modules, new files
  and new functions.
- **Legacy is fixed on touch**: when you substantially change a legacy file,
  move the part you touch toward the target shape — don't rewrite modules you
  are not otherwise changing, and don't refactor "while you're there" beyond
  the function you edit. Known legacy violations are baselined
  (`server/.dependency-cruiser-known-violations.json`); never re-baseline to
  hide a new one. Playbook: [references/migration.md](references/migration.md).
- **Domain layer only where it pays**: a `domain.ts` exists only when the
  module has real invariants/state rules (e.g. reviews, repo-intel). CRUD
  modules go `routes → service → repository` with no empty domain folder.
- **DI stays our own `Container`** (`src/platform/container.ts`) — no Awilix.
- **Domain errors without HTTP codes** is a rule for new code; existing
  `AppError(statusCode)` stays until a module is touched.

## The rings, mapped to this repo

```
        ┌──────────── composition root: platform/container.ts, modules/<m>/compose.ts
        │  ┌───────── adapters: routes.ts (in) · repository.ts, src/adapters/* (out)
        │  │  ┌────── application: service.ts + ports.ts
        │  │  │  ┌─── domain: domain.ts (optional)
        │  │  │  │
  imports point → → → inward only
```

| Ring | Contains | Files | May import |
|------|----------|-------|------------|
| **Domain** | Entities/value objects, invariants, state transitions, domain errors (`code`, no HTTP status). Pure TS. | `modules/<m>/domain.ts` or `domain/` | own `constants.ts`/`types.ts`; `import type` from `@devdigest/shared` |
| **Application** | Use cases (one public method per user intent), orchestration, transactions via a port, **ports** = interfaces it needs | `service.ts`, `ports.ts`, `helpers.ts` (pure) | domain, own ports, `@devdigest/shared` types, `platform/errors` (legacy) |
| **Inbound adapters** | Fastify routes, job handlers, SSE: parse → call use case → map result/HTTP | `routes.ts` | application, `_shared/context`, zod contracts |
| **Outbound adapters** | Drizzle repositories + mappers; LLM/GitHub/git/embedder clients | `repository.ts`, `repository/*.repo.ts`, `mappers.ts`, `src/adapters/**` | ports they implement, `drizzle-orm`, `src/db/**`, SDKs |
| **Composition root** | Construct concrete objects and inject them | `platform/container.ts`, `modules/<m>/compose.ts` | everything |

Ports used by **more than one package** (LLM, Git, GitHub, Secrets…) stay in
`src/vendor/shared/adapters.ts` (and its client twin). Ports used by one module
live in that module's `ports.ts` — the consumer owns the abstraction.

## The rules (each one is checked or reviewable)

1. **Dependencies point inward.** Domain imports nothing outer; services never
   import routes, repositories, `src/db`, `drizzle-orm`, `fastify` or SDKs.
   *Why:* the core then compiles and tests without infrastructure — the defining
   property of onion (Palermo, tenet 4).
2. **Services receive narrow deps through the constructor.** No `Container`
   parameter (service locator), no `new XRepository(db)` inside a service.
   *Why:* explicit deps document the use case and make fakes trivial.
3. **Only composition code touches the Container**: `modules/<m>/compose.ts`
   builds the service from `container.*`; `routes.ts` calls the factory.
   Shared repositories/facades are exposed as `container.<name>` getters
   (existing pattern: `agentsRepo`, `reviewRepo`, `repoIntel`).
4. **Drizzle stays in repositories.** `drizzle-orm`, `src/db/schema`,
   `src/db/rows`, `$inferSelect` and `tx` appear only in repository/mapper
   files. A repository returns a domain object or a read model declared in
   `ports.ts`/`domain.ts` — not a row type. Details:
   [references/drizzle.md](references/drizzle.md).
5. **Fastify stays in `routes.ts`** (+ `_shared/context.ts`). No
   `FastifyRequest`/`reply` below the route. Details:
   [references/fastify.md](references/fastify.md).
6. **Parse at the edge, trust inside.** Routes declare zod
   `params`/`body`/`response` (repo rule); services take typed inputs and don't
   re-validate wire shapes. Domain never imports runtime zod. Details:
   [references/zod-boundaries.md](references/zod-boundaries.md).
7. **Map at every boundary.** Wire DTO → service input → domain → row and back.
   The `toXDto` mapper (domain/read model → contract) lives in `helpers.ts`;
   row ↔ domain mapping lives next to the repository.
8. **Transactions through a port.** A use case that writes >1 table calls
   `uow.run(async (tx) => …)` on a `UnitOfWork` port; the Drizzle adapter wraps
   `db.transaction` and hands back tx-bound repositories. Never pass a Drizzle
   `tx` into a service.
9. **Domain errors carry a `code`, not a status.** New code throws module
   errors (`class RepoAlreadyArchived extends DomainError`); the route (or a
   module `toHttpError`) maps them to `AppError` subclasses so the global
   `setErrorHandler` renders them.
10. **External systems only via ports.** Modules never import
    `src/adapters/**` concretions; they get `GitClient`, `LLMProvider`, … from
    the container. Secrets are read by adapters/the container via
    `SecretsProvider`, never by a service. Details:
    [references/external-adapters.md](references/external-adapters.md).
11. **Modules don't reach into each other.** Never import another module's
    repository/service/routes; use its container facade, its `constants.ts` /
    `types.ts`, or move the shared piece to `modules/_shared/`.
12. **Behaviour lives with data.** Put invariant checks and state transitions
    in `domain.ts` functions/classes, not scattered `if`s in services — but
    don't invent a domain model for plain CRUD.

## Where does X go?

| You're adding… | Put it in… |
|----------------|-----------|
| A new HTTP endpoint | `modules/<m>/routes.ts` (+ register in `modules/index.ts` if new module) |
| Request/response shape | zod contract in `src/vendor/shared/contracts/*` **and** the client copy |
| A use case | a method on `<M>Service` in `service.ts` (split into `<verb>.service.ts` only when `service.ts` gets unwieldy) |
| An interface the service needs (store, queue, clock, gateway) | `modules/<m>/ports.ts` |
| Business invariant / state transition | `modules/<m>/domain.ts` (create it when the first one appears) |
| Pure transform, DTO mapper, parsing helper | `modules/<m>/helpers.ts` |
| SQL / Drizzle query | `modules/<m>/repository.ts` (or `repository/<entity>.repo.ts`) |
| Row ↔ domain mapping | inside the repository file or `modules/<m>/mappers.ts` |
| New table | `src/db/schema/*` → `pnpm db:generate` (never hand-edit migrations) |
| A client for a new external system | port in `vendor/shared/adapters.ts` (both copies) or `ports.ts`; impl in `src/adapters/<system>/`; wire in `container.ts`; mock in `adapters/mocks.ts` |
| Wiring service + its deps | `modules/<m>/compose.ts` |
| Background job handler | registered from `compose.ts`/`routes.ts`; handler body calls a service method |
| Literals / job kinds | `modules/<m>/constants.ts` |
| Code used by ≥2 modules | `modules/_shared/` (logic) or a container getter (stateful repo/facade) |

Full module template, with code: [references/layers-and-placement.md](references/layers-and-placement.md).

## Module template (new module)

```
src/modules/<m>/
├── routes.ts       # inbound adapter: zod schemas, getContext, call service, status codes
├── compose.ts      # createXService(container) — the only non-route file that sees Container
├── service.ts      # use cases; constructor(deps: XDeps)
├── ports.ts        # XStore, read models, other interfaces the service needs
├── domain.ts       # OPTIONAL — invariants, transitions, domain errors
├── repository.ts   # implements XStore with Drizzle; maps rows ↔ read models
├── helpers.ts      # pure functions, toXDto
└── constants.ts
```

Tests: service with in-memory fakes of `ports.ts` (unit), repository against
testcontainers (`*.it.test.ts`), route via `app.inject` + `ContainerOverrides`.
See [references/testing.md](references/testing.md).

## Enforcement

`server/.dependency-cruiser.cjs` encodes rules 1, 2, 4, 5, 6 (domain), 10, 11.
`pnpm arch:check` fails on new violations; it runs in CI (`server-unit.yml`,
typecheck job). Rule names, how to read a failure, and when re-baselining is
legitimate: [references/enforcement.md](references/enforcement.md).

## Review checklist

- [ ] `pnpm arch:check` is clean (no new violations, baseline not regenerated to hide one).
- [ ] New service takes explicit deps in its constructor; no `Container`, no `new …Repository`.
- [ ] No `drizzle-orm` / `src/db` / row types outside repository & mapper files.
- [ ] No `fastify` types below `routes.ts`; handlers stay thin (parse → call → map).
- [ ] Repositories return read models/domain objects; DTO mapping in `helpers.ts`.
- [ ] Multi-table writes go through a `UnitOfWork` port.
- [ ] New errors carry a `code`; HTTP status assigned at the edge.
- [ ] External calls go through a port; mock added to `adapters/mocks.ts`.
- [ ] No import into another module's internals.
- [ ] `domain.ts` only where invariants exist; no empty scaffolding.
- [ ] Contract change applied to both `vendor/shared` copies.
- [ ] Use case has a unit test with fakes; DB code has an `*.it.test.ts`.
