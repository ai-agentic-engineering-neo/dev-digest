---
name: onion-architecture
description: "Onion Architecture for this repo's backend — the four rings (domain model, domain services, application services, infrastructure), the inward dependency rule, ports defined by the inside and implemented by the outside, constructor injection over the DI container, routes as adapters, repositories that speak domain rather than Drizzle, and enforcement via dependency-cruiser."
when_to_use: "Adding or changing anything under server/src — a route, service, repository, adapter or port; deciding which ring a piece of code belongs in; wiring a new dependency into platform/container.ts; introducing a transaction across repositories; reviewing a backend diff for layering violations; or the user asks where backend logic should live, how to decouple from Drizzle/Fastify, or how to enforce architecture. NOT for frontend structure — that is frontend-ui-architecture; NOT for Fastify route/plugin mechanics — that is fastify-best-practices; NOT for Drizzle query syntax — that is drizzle-orm-patterns."
version: 1.0.2
---

# Onion Architecture — `server/`

Applies to `server/src`. **Out of scope:** `reviewer-core/` (a sibling library,
deliberately not held to these rings — see [README.md](README.md) decision 2),
`client/` ([frontend-ui-architecture](../frontend-ui-architecture/SKILL.md)).

Companions, not duplicates:
- [fastify-best-practices](../fastify-best-practices/SKILL.md) — route, plugin, hook mechanics
- [drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md) — query and schema syntax
- [zod](../zod/SKILL.md) — schema authoring

Worked before/after from this codebase: [examples.md](examples.md).

## Severity Levels

- **CRITICAL** — breaks the dependency rule; the architecture stops holding
- **HIGH** — leaks a layer; fix when touching the area
- **MEDIUM** — consistency

---

## 1. The Dependency Rule (CRITICAL)

> All coupling points **inward**. Code may depend on layers more central; never
> on layers further out.

Corollary, and the one people resist: **the database is not the center — it is
external.** Postgres, Drizzle, Fastify, Octokit and the LLM SDKs are all details
that plug into the application, not foundations it is built on.

Everything below is a consequence of this one sentence. When a rule here seems
arbitrary, re-derive it from this.

## 2. The Four Rings (CRITICAL)

```
┌───────────────────────────────────────────────────┐
│ INFRASTRUCTURE                                    │
│ routes.ts · adapters/ · db/ · platform/container  │
│  ┌─────────────────────────────────────────────┐  │
│  │ APPLICATION SERVICES                        │  │
│  │ modules/<domain>/service.ts                 │  │
│  │  ┌───────────────────────────────────────┐  │  │
│  │  │ DOMAIN SERVICES                       │  │  │
│  │  │ domain/<domain>/rules.ts              │  │  │
│  │  │  ┌─────────────────────────────────┐  │  │  │
│  │  │  │ DOMAIN MODEL                    │  │  │  │
│  │  │  │ types · errors · ports          │  │  │  │
│  │  │  └─────────────────────────────────┘  │  │  │
│  │  └───────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

| Ring | Holds | May import |
|---|---|---|
| **Domain model** | entity/value types, domain errors, **port interfaces** | `zod`, other domain model |
| **Domain services** | rules spanning types; pure functions | domain model |
| **Application services** | use-case orchestration, transactions, events | domain, ports |
| **Infrastructure** | Fastify routes, Drizzle repos, adapters, container, config | everything inward |

An outer ring may skip an inner one and call further in directly — do not write
pass-through proxy methods just to preserve ring adjacency.

### The domain is types and functions, not classes

Deliberate decision for this codebase: the domain is **zod types + pure
functions + port interfaces**. No entity classes, no aggregates, no
`Review.addFinding()`. This matches the functional TypeScript the rest of the
server is written in.

This is "anemic" by DDD's vocabulary and that is accepted knowingly. The value of
Onion here is the dependency rule, not DDD tactics. **Do not "fix" this by
introducing entity classes.**

## 3. Ports Belong to the Inside (CRITICAL)

An interface lives with its **consumer**, never with its implementation.

- `domain/ports/llm.ts` declares `LLMProvider`
- `adapters/llm/openai.ts` implements it
- The adapter imports the port. The port never knows the adapter exists.

That inversion is the entire mechanism by which an inner ring stays independent
of an outer one. A port sitting next to its adapter is not a port.

**Do not put ports in `vendor/shared`.** That directory is for API contracts
shared between client and server. Ports are server domain concerns; the client
consumes none of them.

## 4. Constructor Injection, Never the Container (CRITICAL)

A service declares exactly the ports it needs, as constructor parameters.

```ts
// NO — Service Locator
constructor(private container: Container) { … }

// YES — dependencies visible in the signature
constructor(
  private reviews: ReviewRepository,
  private agents: AgentsRepository,
  private llm: LLMProvider,
) {}
```

Taking the container is wrong on three counts:

1. **It hides dependencies.** The signature says nothing; you must read the body
   to learn what the class needs.
2. **It moves failures from compile time to run time.** A missing dependency
   surfaces as a crash in production, not a type error.
3. **It points outward.** `Container` is the composition root — infrastructure.
   A service depending on it inverts the arrow the whole architecture rests on.

Only `platform/container.ts` and `app.ts` may know concrete classes. That is the
composition root, and it is the *only* legitimate place for wiring.

Testing consequence: a correctly-injected service needs no container in tests —
pass fakes directly.

## 5. Routes Are Adapters (CRITICAL)

`routes.ts` is an HTTP adapter. Its whole job: parse the request, call one
service method, shape the response.

A route may import: a service, zod schemas, `getContext`, error types.
A route may **not** import: `db/`, `drizzle-orm`, `db/schema`, or any adapter.

If a route contains a query, the module is missing a service method. Add it.

## 6. Repositories Speak Domain, Not Drizzle (HIGH)

A repository is the port between application services and persistence.

- Method names express **business** operations — `activeRunsForPull`, not
  `selectWhere`.
- Return **domain types**. Never a row type, never a query builder, never a
  Drizzle partial.
- Translate DB errors into domain errors at the boundary. A unique-constraint
  violation leaves as a domain conflict, not a `PostgresError`.
- No business rules inside. Filtering by workspace is persistence; deciding
  whether a run may start is domain.

**The honest caveat.** Drizzle is a typed query builder, not an entity mapper, so
a repository over it can degenerate into a thin leaky wrapper. The seam earns its
keep here for two concrete reasons — testcontainers integration tests need it,
and it keeps SQL out of business logic. It does **not** exist so you can swap
Postgres. Do not add abstraction for a database migration that will not happen.

A repository method that merely forwards a query builder outward is worse than no
repository. Delete it or give it a business name.

## 7. Validate at the Boundary, Trust Inside (HIGH)

Untrusted data is parsed **once**, at the edge, then trusted everywhere within.

- Routes declare zod `params`/`body`/`querystring` via
  `fastify-type-provider-zod`. Invalid input 422s before the handler runs.
- Handlers never hand-roll `Schema.parse(req.body)`.
- Domain and application services receive parsed, typed values and **re-validate
  nothing**. A second parse inside the domain means the boundary is not trusted —
  fix the boundary.
- The same rule applies to every edge, not just HTTP: LLM responses, GitHub API
  payloads and env config are all untrusted and parsed in their adapter.

## 8. Transactions Belong to Application Services (HIGH)

The unit of work is the **use case**, so the application service owns the
transaction boundary. Drizzle has no Unit of Work; the scope must be threaded
explicitly.

- The service opens `db.transaction(tx => …)`.
- Repository functions accept the executor as a parameter, so the same function
  works inside and outside a transaction.
- A repository never opens its own transaction — it cannot know the use case it
  participates in.
- Never span a transaction across an external call (LLM, GitHub). Commit first,
  then call out.

## 9. Domain Errors, HTTP at the Edge (MEDIUM)

The domain throws meaning: `NotFoundError`, `AppError('invalid_run_request', …)`.
Only the HTTP adapter maps meaning to status codes. `platform/errors.ts` already
holds these — extend it rather than throwing framework errors inward.

No `reply.code(404)` inside a service. No Fastify types below the route ring.

## 10. Modules Compose in the Container (HIGH)

Modules do not import each other. Two modules that need to cooperate are wired in
`platform/container.ts`, or the shared piece moves inward to the domain.

`modules/_shared/` is for genuinely cross-module route concerns (`context.ts`,
`schemas.ts`) — not a dumping ground for anything used twice.

Every module self-registers in `src/modules/index.ts`; a module missing there is
dead code.

## 11. Testing Follows the Rings (MEDIUM)

| Ring | Test style | Mocks |
|---|---|---|
| Domain model / services | plain unit tests | none — pure functions |
| Application services | inject fake ports | hand-written fakes, not framework mocks |
| Repositories | `*.it.test.ts` + testcontainers | real Postgres |
| Adapters | `*.it.test.ts` or contract test | the real external client |

If a domain rule needs a mock, it is not in the domain. If an application service
needs a database to test, its dependencies are not ports.

Adapters are swapped through `ContainerOverrides` / `adapters/mocks.ts` — never
mock at module level.

## 12. Enforcement (HIGH)

Rules that only live in prose decay. `dependency-cruiser` is already a
dependency; `server/.dependency-cruiser.cjs` turns each rule above into a
build failure.

Minimum rule set — domain imports nothing outward, routes never touch `db/`,
services never import the container, modules never import each other, no
circular dependencies. New rules land at `severity: "warn"` and flip to
`"error"` once that violation class reaches zero.

Full config: [examples.md](examples.md) §7. `pnpm arch` is the CI gate; it fails
on any violation not in `.dependency-cruiser-known-violations.json`.

## 13. Anti-Patterns

| Anti-pattern | Instead |
|---|---|
| `constructor(private container: Container)` | inject the ports the class actually uses |
| `routes.ts` importing `db/` or `drizzle-orm` | add a service method |
| Port declared next to its adapter | port in `domain/ports/`, adapter implements it |
| Ports in `vendor/shared` | `vendor/shared` is client↔server API contracts only |
| Repository returning a row or query builder | return a domain type |
| Repository opening its own transaction | service owns the transaction scope |
| Domain importing `AgentRow` / `db/schema` | domain type, mapped in the repository |
| `Schema.parse()` inside a service | parse at the route, trust inside |
| Fastify `reply` below the route ring | throw a domain error; the route maps it |
| Module importing another module | compose in the container |
| Entity classes "to do DDD properly" | types + pure functions — see §2 |
| ORM abstraction "in case we swap Postgres" | you will not; the seam is for tests |
| A ring per module, or a fifth ring | four rings total for the whole server |

## 14. Applying This to Existing Code

`server/src` predates this skill and has known violations, catalogued in
[README.md](README.md). Do not sweep them. When you are already editing a file,
fix in this order:

1. Route reaching into `db/` — mechanical, low risk
2. Container in a service constructor — the highest-value fix
3. Business logic importing row types
4. Pure rules trapped inside infrastructure files

Architecture changes go in their own commit, separate from behaviour changes.
