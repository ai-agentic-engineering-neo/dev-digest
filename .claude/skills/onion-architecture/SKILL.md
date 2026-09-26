---
name: onion-architecture
description: "Onion (clean / hexagonal, ports-and-adapters) architecture for the DevDigest Fastify + Drizzle backend: which ring a piece of server code belongs to, which way imports may point, where queries, business rules, validation, transactions, errors and mappers live, and how the layer rules are enforced by dependency-cruiser (`pnpm arch:check`). Use when adding or restructuring a server module, route, service, repository or adapter; when a route handler queries the database or a service imports drizzle, fastify or a concrete adapter; when deciding where a server function belongs; when adding a multi-table write; when `arch:check` fails; when reviewing a server PR for structure; or when the user mentions onion, clean or hexagonal architecture, layers, ports and adapters, dependency rule, use cases or domain logic — even if they never say 'architecture'. Not for Fastify, Drizzle or Zod API details (fastify-best-practices, drizzle-orm-patterns, zod cover those) or for frontend structure (frontend-ui-architecture)."
metadata:
  version: 1.0.0
---

# Onion Architecture (server)

One rule drives this skill: **source-code dependencies point inwards only.**
Business rules sit in the middle and know nothing about Fastify, Drizzle,
Postgres, GitHub or an LLM vendor; those are outer rings that plug in. Everything
below is that rule applied to `server/`.

## 0. Read the existing convention first

1. `server/CLAUDE.md` and `server/docs/architecture.md` — module anatomy, DI
   container, ports table, error envelope. They are the local convention; this
   skill explains *why* it is shaped that way and fills the gaps.
2. `server/INSIGHTS.md` — known traps (duplicated facade types, tenancy joins,
   null-vs-zero cost).
3. `pnpm arch:check` in `server/` — the rules below, machine-checked.

Change existing code in **small moves that each leave `arch:check` green**, never a
big-bang rewrite. A module is refactored when you already have a reason to touch
it, not because it is "not onion yet".

## 1. When the full onion pays off — and when it does not

Palermo is explicit that the onion is for long-lived applications with complex
behaviour, not for small sites. Seemann (*Ports and fat adapters*) warns that an
extra use-case layer costs more than it returns when there is one entry point and
little logic. So:

- **Always:** the dependency direction (section 3). It is free and it is what
  `arch:check` enforces.
- **When there is real logic** (reviews, repo-intel, agents versioning, cost
  rollups): a service that orchestrates, pure functions for the rules, a
  repository for the queries.
- **When a module is CRUD** (`workspace`, `settings`): `routes.ts` + a
  `repository.ts` is enough. Do not invent a service that only forwards calls.
  The one thing it may never do is query Drizzle from the route.

Signals that a service or domain function is now warranted: a rule is
duplicated in two handlers; a handler branches on business state; a handler
calls two ports (DB + GitHub, DB + LLM); a test needs Postgres only to check a
calculation.

## 2. The rings in this server

```
composition root   platform/container.ts · app.ts · server.ts · modules/index.ts
 └─ presentation   modules/<m>/routes.ts · modules/_shared/
     └─ application   modules/<m>/service.ts · run-executor.ts · findings.ts
         └─ domain        pure rules: helpers.ts · status.ts · constants.ts · reviewer-core
             └─ core          vendor/shared: contracts (zod) + ports (interfaces)

infrastructure     modules/<m>/repository.ts · adapters/** · db/**
                   └─ implements the ports in core; wired in by the composition root
```

| Ring | Paths | Knows | Must not import |
|---|---|---|---|
| **Contracts + ports** (core) | `src/vendor/shared/**` — DTO schemas, `LLMProvider`, `GitClient`, `GitHubClient`, `SecretsProvider`, `AuthProvider`… | zod, itself | anything else |
| **Domain** | pure functions: `modules/<m>/helpers.ts`, `status.ts`, `constants.ts`; `@devdigest/reviewer-core` | contracts | fastify, drizzle, `db/*`, container, adapters, `process.env` |
| **Application** | `modules/<m>/service.ts`, `run-executor.ts`, `findings.ts` | domain, contracts, ports, its own repository's *type* | drizzle, `db/schema`, `db/client`, fastify, `adapters/**` |
| **Presentation** | `modules/<m>/routes.ts`, `modules/_shared/` | application, contracts, fastify, zod; in a CRUD module its own repository | drizzle, `db/*` |
| **Infrastructure** | `modules/<m>/repository.ts` + `repository/`, `adapters/**`, `db/**` | contracts, drizzle, SDKs | services, routes, the container |
| **Composition root** | `platform/container.ts`, `app.ts`, `server.ts`, `modules/index.ts` | everything | — (this is where rings are wired) |

Two facts about this repo that change the textbook picture:

- **Ports already live in the core.** `vendor/shared/adapters.ts` is the port
  catalogue; `adapters/*` are the implementations; the container picks one.
  A new external dependency gets a port there first.
- **`reviewer-core` is the purest ring we have.** Diff → prompt → LLM →
  findings, with the LLM behind an interface. Treat it as the model for what a
  domain package looks like; do not give it server knowledge.

## 3. The dependency rule, concretely

Palermo's first tenet: *all code can depend on layers more central, but code
cannot depend on layers further out from the core.* Uncle Bob's version: the
name of something declared in an outer circle must not be mentioned by code in an
inner circle — **type-only imports count**, which is why `arch:check` runs with
`tsPreCompilationDeps: true`.

Allowed direction: `routes → service → (domain, ports)` and
`repository / adapter → ports`. The composition root is the only file that sees
both a service and the concrete class that satisfies its port.

- A module never imports another module's folder. Cross-module access goes through
  the container (`container.agentsRepo`, `container.reviewRepo`,
  `container.repoIntel`) or through `@devdigest/shared`. `_shared/` is the one
  shared folder.
- Pure parsers are not adapters. `adapters/git/diff-parser.ts`,
  `adapters/astgrep`, `adapters/codeindex/extract.ts` do no I/O; they are domain
  code that happens to live under `adapters/` (known debt, see section 10). New
  pure code shared across modules goes to `src/domain/<topic>/` (guarded by
  `domain-is-pure`) or `reviewer-core`, not to `adapters/`.
- Nothing imports `db/seed.ts` or `db/migrate.ts`; shared constants they own move
  to a module both can import.

## 4. Where does X go?

| Code | Home | Ring |
|---|---|---|
| Request/response schema used only by one route | top of that `routes.ts` | presentation |
| Request/response schema the client also uses | `src/vendor/shared/contracts/` (+ client copy, see root CLAUDE.md) | contracts |
| `getContext`, param schemas shared by routes | `modules/_shared/` | presentation |
| Business rule, calculation, status derivation | pure function in `modules/<m>/helpers.ts` or a named file (`status.ts`) | domain |
| Rule shared by server **and** CI runner | `reviewer-core` | domain |
| Orchestration: load → decide → persist → call port | `modules/<m>/service.ts` | application |
| Transaction boundary | the service method that owns the use case | application |
| Drizzle query, SQL aggregate, row → domain mapping | `modules/<m>/repository.ts` | infrastructure |
| Workspace scoping (`workspace_id`, findings→reviews join) | repository method signature takes `workspaceId` | infrastructure |
| Interface to an external system | `vendor/shared/adapters.ts` | ports |
| SDK call (Octokit, openai, simple-git, ripgrep) | `adapters/<name>/` | infrastructure |
| Choosing which implementation runs | `platform/container.ts` (+ `ContainerOverrides` for tests) | composition root |
| HTTP status for a failure | `AppError` subclass in `platform/errors.ts`; mapping in `app.ts` | presentation edge |
| Env / config | `platform/config.ts` (secrets: `LocalSecretsProvider` only) | composition root |

## 5. Ring by ring

### Presentation — `routes.ts` (Fastify)

A route handler does four things: declare the zod `params`/`body`/`response`
schema, resolve tenancy with `getContext`, call **one** service (or repository,
for CRUD modules, its own repository) method, return its DTO. No `container.db`, no `drizzle-orm`
import, no business branching, no `Schema.parse(req.body)`.

- Each module is an encapsulated plugin registered in `modules/index.ts`; plugins
  it depends on (helmet, cors, rate-limit, SSE) are registered before it.
- Construct the service once per plugin (`const service = new XService(...)`),
  not per request.
- Hooks (`onRequest`, `preHandler`) are for cross-cutting transport concerns —
  never for business rules.

### Application — `service.ts`

A service method is a use case: load through repositories and ports, call pure
functions to decide, persist through repositories, return a DTO.

- **Depend on narrow ports, not the whole `Container`.** New services take a
  `Deps` object with exactly what they use; the route plugin or container builds
  it. Existing services that take `Container` migrate when touched — see
  `references/examples.md` (example 3).
- Never `new SomeAdapter()` and never `new SomeRepository(container.db)` inside
  a service method; construction belongs to the composition side.
- Keep side effects at the edges of the method (Seemann's *impureim sandwich*):
  read → pure decision → write. The middle is a plain function you can unit-test.
- Services throw `AppError` subclasses, never Fastify replies.

### Domain — pure functions and contracts

- Plain TypeScript over contract types. No I/O, no clock or randomness unless
  passed in, no `process.env`.
- zod is allowed here: the contracts in `@devdigest/shared` *are* zod schemas, and
  parsing is how data becomes a domain type ("parse, don't validate"). Parse once,
  at the edge; inner code receives the parsed type and does not re-validate.
- Domain rules that the repo relies on stay explicit: `null` cost means unknown,
  `0` means free (see `specs/review-flow.md`).
- An anemic model is fine here — this codebase is functional-style, not
  entity-classes. What must not happen is the rule leaking into routes or SQL.

### Infrastructure — repositories (Drizzle) and adapters

- A repository owns the queries for its module's tables and **returns contract or
  domain types**, not raw rows, whenever the value leaves the repository. Row →
  DTO mappers live next to the repository (today they are in `helpers.ts`;
  that is acceptable because they are pure, but they must not import services).
- Drizzle quirks are handled inside the repository: `sum()` is `string | null`
  (`parseAggregateCost`), `count()` is a number. Callers never see them.
- Every repository method that reads domain tables takes `workspaceId` and
  scopes by it; for `findings`, the scope is the join to `reviews`.
- Adapters implement a port from `vendor/shared/adapters.ts`. They may use any SDK;
  they must not import services, routes or the container.

### Composition root — `platform/container.ts`

The only place that knows concrete classes. Lazy construction, memoised, secrets
resolved at call time, test doubles via `ContainerOverrides`. If a new port needs
wiring, it is added here and nowhere else.

## 6. Transactions

The server currently has **no** `db.transaction()` call (see INSIGHTS), so every
multi-statement write is non-atomic. Rule for new and touched code:

- Any write that deletes-then-reinserts, or writes more than one table for one use
  case, runs in `db.transaction(async (tx) => …)`.
- The **service** owns the boundary (it knows the use case) but must not import
  Drizzle to open it. It gets a `UnitOfWork` port in its `Deps` and calls
  `uow.run(async (tx) => …)`; `tx` is an opaque `TxScope` the service only passes
  on. Repository methods accept an optional `TxScope` and run every statement on
  it. The Drizzle-backed implementation lives in infrastructure.
- Never call an external port (GitHub, LLM, git) *inside* a transaction: fetch
  first, then open the transaction for the writes only.

Code shape and the `Tx` type: `references/transactions.md`.

## 7. Errors

`platform/errors.ts` is framework-free: `AppError(code, message, statusCode)` and
its subclasses. Inner rings throw these; `app.ts` is the only place that turns
them into the `{ error: { code, message, details } }` envelope. Do not catch an
error in a service just to rethrow it as a different HTTP status, and do not
`reply.code()` from anywhere but a route.

## 8. Testing by ring

| Ring | Test | Needs |
|---|---|---|
| Domain | unit test of the pure function | nothing — no container, no DB |
| Application | unit test with `ContainerOverrides` / fake `Deps` (`adapters/mocks.ts`) | no network, no keys |
| Infrastructure (repository) | `*.it.test.ts` against real Postgres (testcontainers) | Docker |
| Presentation | `app.inject()` integration test | full app |

If testing a rule forces you to start Postgres, the rule is in the wrong ring.
Test policy itself: `TESTING.md`.

## 9. Enforcement — `pnpm arch:check`

`server/.dependency-cruiser.cjs` encodes sections 2–3 as rules:
`contracts-are-the-core`, `domain-is-pure`, `routes-do-not-touch-the-db`,
`application-does-not-know-the-orm`, `no-framework-below-routes`,
`no-concrete-adapters-in-modules`, `infrastructure-does-not-call-inwards-code`,
`no-cross-module-imports`, `nothing-imports-db-scripts`, `no-circular`.

- `pnpm arch:check` fails only on **new** violations; the ones that existed when
  the rules were introduced are in `.dependency-cruiser-known-violations.json`.
- Fixed a known violation? Run `pnpm arch:baseline` and commit the smaller file.
- **Never regenerate the baseline to make a new violation pass.** Fix the import,
  or — if the rule is wrong — change the rule in the config with a comment saying why.

Rule details, the pnpm path gotcha and how to add a rule: `references/enforcement.md`.

## 10. Known debt (the baseline, 2026-09-21)

So nobody mistakes it for the convention:

- Routes querying Drizzle directly: `pulls`, `polling`, `settings`, `workspace`.
- `reviews/run-executor.ts` imports `db/schema`.
- Pure parsers under `adapters/` imported by `reviews` and `repo-intel`.
- `repos/service.ts` imports `repo-intel/constants.ts`.
- `adapters/auth/local.ts` imports constants from `db/seed.ts`.
- Cycles: `container ↔ repo-intel/service` (the service takes `Container`),
  `agents/helpers ↔ agents/repository`.

## 11. Structural review checklist

- [ ] `pnpm arch:check` passes and the baseline did not grow.
- [ ] Route handlers only validate, resolve context, call one method, return.
- [ ] No `drizzle-orm` / `db/schema` import outside repositories, `db/`, adapters and the container.
- [ ] Business rules are pure functions with unit tests that need no DB.
- [ ] New services take narrow `Deps`, not `Container`; nothing is `new`-ed inside a method.
- [ ] Multi-statement writes are in a transaction; no external call inside it.
- [ ] Every repository read of a domain table is scoped by `workspaceId`.
- [ ] New external systems got a port in `vendor/shared/adapters.ts` and a mock in `adapters/mocks.ts`.
- [ ] No module imports another module's folder.

## 12. How to answer

- **"Where does this go?"** — name the ring and the path from section 4, and the
  rule from section 3 that decides it.
- **"Add endpoint / feature X"** — list the files per ring (schema in route,
  service method, repository method, pure function + test), in that order.
- **Refactor requests** — one small move at a time, each keeping `arch:check`
  green, and remove the matching baseline entries (`pnpm arch:baseline`).
- **`arch:check` failed** — quote the rule name, explain which ring boundary was
  crossed, and show the move that fixes it; do not touch the baseline.

## Reference files

| File | Read when |
|---|---|
| `references/layers-in-this-stack.md` | writing a route, service, repository or adapter and you want the Fastify / Drizzle / Zod / vitest specifics for that ring |
| `references/transactions.md` | a use case writes more than one statement or table |
| `references/enforcement.md` | `arch:check` fails, you add or change a rule, or a dependency upgrade makes known violations reappear |
| `references/examples.md` | moving queries out of a route, splitting a service, extracting a pure rule, adding a port |

## Scope

Defer to other skills instead of restating them:

- Fastify API (plugins, hooks, serialization, logging) → `fastify-best-practices`
- Drizzle queries, relations, migrations → `drizzle-orm-patterns`
- table design, indexes → `postgresql-table-design`
- schema authoring → `zod`; type-level tricks → `typescript-expert`
- auth, injection, secrets → `security`
- client-side structure → `frontend-ui-architecture`
