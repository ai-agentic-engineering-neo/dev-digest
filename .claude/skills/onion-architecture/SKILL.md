---
name: onion-architecture
version: 1.0.0
description: "Layered, dependency-inward architecture for Fastify/Drizzle
  backend modules — routes (HTTP only) → service (business logic) →
  repository (Drizzle only), with @devdigest/shared contracts as the
  boundary DTOs. Use when adding or reviewing a server module, deciding
  where a query/business rule/mapping belongs, or wiring a new adapter into
  the DI container. Flags routes that call the DB directly as a violation.
  Complements fastify-best-practices (route/plugin mechanics),
  drizzle-orm-patterns (query syntax) and postgresql-table-design (schema)
  without duplicating them."
---

# Onion Architecture (Backend)

Where backend code lives relative to Fastify and Drizzle, not how routes or
queries are written. This skill assumes `fastify-best-practices` and
`drizzle-orm-patterns` for mechanics and only adds *layering*: which file a
piece of logic belongs in, and which direction its imports may point. For
code examples, see [examples.md](examples.md); for sources, see
[references.md](references.md).

**See also, and don't duplicate:**
- [fastify-best-practices](../fastify-best-practices/SKILL.md) — route
  definition, plugin registration, JSON-schema validation, error handling.
  This skill assumes those mechanics and only adds *where* the handler is
  allowed to reach.
- [drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md) — schema
  definition, query/relation syntax, transactions, migrations. This skill
  only says *which file* may import `drizzle-orm`/`db/schema.js`.
- [postgresql-table-design](../postgresql-table-design/SKILL.md) — table
  design itself (types, indexes, constraints).
- [zod](../zod/SKILL.md) — schema mechanics. This skill only covers *where*
  a Zod contract sits (boundary DTO vs. internal shape).
- [frontend-architecture](../frontend-architecture/SKILL.md) — the same
  "where things live" question, one layer up in `client/`.

## Severity Levels

- **CRITICAL** — breaks the dependency-inward rule outright (an inner layer
  reaching into an outer one), or skips a layer entirely
- **HIGH** — will cause real friction as the module grows or gets tested
- **MEDIUM** — hurts consistency/testability but is cheap to fix later

---

## Layering Overview (CRITICAL)

Four rings, mapped onto this repo's actual files under
`server/src/modules/<name>/`:

```
routes.ts        — Presentation: Fastify only. Parses/validates via a Zod
                    schema (fastify-type-provider-zod), calls ONE service
                    method, returns its result (or maps it to a
                    @devdigest/shared DTO).
service.ts        — Application: orchestration + business rules. Talks to
                    repository interfaces and container-injected adapters
                    (git/github/llm). Never imports Fastify types.
repository.ts     — Infrastructure: Drizzle only. One repository per
                    module/aggregate; typed rows come from `db/rows.ts`.
                    No business rules beyond query shaping.
@devdigest/shared — Domain contracts: the Zod DTOs that cross the boundary
                    (HTTP response shapes, cross-package types). Routes and
                    services map to/from these; repositories never see them.
```

The dependency rule: `routes.ts → service.ts → repository.ts → db`, and
never the reverse. Concretely:
- `repository.ts` must never import `fastify` or a route file.
- `service.ts` must never import `fastify`, `fastify-type-provider-zod`, or
  `FastifyRequest`/`Reply`.
- `routes.ts` must never import `drizzle-orm` or `../../db/schema.js`.

`reviewer-core/` is the innermost ring taken to its extreme and is worth
citing as the reference: zero DB/HTTP/FS imports, its only side effect is an
injected `LLMProvider` interface (see
[reviewer-core/CLAUDE.md](../../../reviewer-core/CLAUDE.md)). New
cross-cutting business/reasoning logic that doesn't need Fastify or Drizzle
should be able to live — and be unit-tested — the same way.

## Route Layer Rules (CRITICAL)

- A `routes.ts` file may import `fastify`, `fastify-type-provider-zod`, the
  module's own `service.ts`, `_shared/context.js` (`getContext`), and
  `@devdigest/shared` contracts for request/response typing. It must **not**
  import `drizzle-orm` or `../../db/schema.js`.
- Every handler body should read as: resolve tenancy (`getContext`) → call
  one service method → return/shape the result. No query building, no
  looping over rows, no `try/catch` around a raw `db.insert(...)`.
- Good examples already in this repo: `repo-intel/routes.ts`,
  `reviews/routes.ts`, `agents/routes.ts` — each is a thin Fastify shell
  over a `Service` class.
- Existing violations to recognize (and fix opportunistically when you
  touch them, not as a mandated rewrite): `pulls/routes.ts`,
  `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts` — these
  call `container.db.select/insert/update/delete` directly inside the
  handler, importing `* as t from '../../db/schema.js'` in the route file.
  Treat any of these as the anti-pattern, not the template, when writing
  new code nearby.
- **Signal you've violated this**: `routes.ts` importing `drizzle-orm` or
  `db/schema.js` at all. That's the moment to extract a `service.ts` (and,
  if one doesn't exist yet, a `repository.ts`).

## Service Layer Rules (HIGH)

- `service.ts` holds orchestration and business rules: input validation
  beyond shape (e.g. "does this workspace own this repo"), multi-step
  workflows, retries/degradation policy, mapping between repository rows
  and `@devdigest/shared` DTOs.
- It talks to persistence through repository **methods**, never
  `db.select()`/`db.insert()` directly — if a service needs a new query,
  add a method to the repository, don't reach past it.
- External systems (git, GitHub, LLM) are obtained through the container's
  typed accessors (`container.git`, `container.github()`, `container.llm(id)`)
  — never `new OctokitGitHubClient(...)` inline in a service. This keeps
  services testable against `ContainerOverrides` mocks.
- A service constructor takes the `Container` (see `RepoIntelService`,
  `ReviewService`) — not individual adapter instances — so it composes the
  same way in production and in tests.

## Repository/Infrastructure Layer Rules (HIGH)

- One `repository.ts` per module. When a module owns more than one
  aggregate, split by entity into `repository/<entity>.repo.ts` files
  (see `reviews/repository/pull.repo.ts`, `review.repo.ts`, `run.repo.ts`)
  rather than growing one file indefinitely or one aggregate's queries
  bleeding into another's file.
- Repositories are Drizzle-only: query building, `and`/`eq`/`inArray`
  filters, transactions. No business rules, no calls to other
  services/adapters.
- Row types are centralized in `server/src/db/rows.ts`
  (`$inferSelect` types like `FindingRow`, `PullRow`, `AgentRunRow`) — a
  module's repository re-exports its row type from there rather than
  redefining it, so other modules can reference the shape without
  importing that module's `repository.ts` directly.
- Cross-module reads/writes go through the **shared container repository**
  (`container.agentsRepo`, `container.reviewRepo` — constructed once in the
  composition root, `platform/container.ts`), never by importing another
  module's `repository.ts` file directly. If a repository needs to be
  shared this way, register it as a container getter, following
  `agentsRepo`/`reviewRepo`.

## Boundary DTOs (CRITICAL)

- `@devdigest/shared` (`server/src/vendor/shared/`) holds the Zod contracts
  that cross the HTTP boundary and are shared with `client/` and
  `reviewer-core/`. Route handlers type their responses against these;
  Drizzle row → DTO mapping happens once, in a `helpers.ts` next to the
  service (see `reviews/helpers.ts`'s `reviewToDto`/`findingRowToDto`).
- Never let a raw Drizzle row (`FindingRow`, `ReviewRow`, ...) cross a
  module boundary or reach the client directly — map it to a
  `@devdigest/shared` (or module-local `*Dto`) shape first.
- Repositories never import `@devdigest/shared` DTOs; services never import
  Drizzle's inferred insert/update types into their public signatures.

## Composition Root / Dependency Injection (HIGH)

- `server/src/platform/container.ts` is the single composition root. New
  adapters (LLM providers, git/GitHub clients, code index, etc.) are added
  as lazily-constructed getters there, resolved through `SecretsProvider`
  and swappable via `ContainerOverrides` — this is what makes
  `server/src/adapters/mocks.ts`-based hermetic testing possible
  (see `TESTING.md`).
- New cross-cutting repositories are registered the same way
  (`get agentsRepo()`, `get reviewRepo()` pattern) rather than instantiated
  ad hoc inside a service.
- A service or route must never construct an adapter or repository with
  `new X(...)` itself (aside from a module's own `repository.ts` being
  constructed once, inside its own `service.ts` constructor, or the
  one-time job-handler registration pattern in `repo-intel/routes.ts`) —
  it should come from `container`.

## Growth & Refactoring Triggers (MEDIUM)

Concrete signals it's time to reorganize, not vibes:

- A `routes.ts` gaining its **first** `container.db` call → extract a
  `service.ts` (and a `repository.ts` if one doesn't exist), even if the
  query is "simple" — it never stays simple.
- A `repository.ts` mixing queries for two unrelated aggregates → split
  into `repository/<entity>.repo.ts` files, one per aggregate.
- A Drizzle-row-to-DTO mapping copy-pasted in a second place → promote it
  to that module's `helpers.ts`, imported by both.
- A service reaching for a new external system → add it to
  `platform/container.ts` as a typed getter/method instead of importing
  the concrete adapter class into the service.
- A new piece of pure reasoning/business logic with no Fastify/Drizzle
  need → consider whether it belongs in `reviewer-core/` (framework-free
  core) rather than a module's `service.ts`.
