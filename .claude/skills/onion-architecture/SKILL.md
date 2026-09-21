---
name: onion-architecture
description: "Onion Architecture for this repo's backend — the four rings (domain model, domain services, application services, infrastructure), the inward dependency rule, ports defined by the inside and implemented by the outside, constructor injection over the DI container, routes as adapters, repositories that speak domain rather than Drizzle, and enforcement via dependency-cruiser."
when_to_use: "Adding or changing anything under server/src — a route, service, repository, adapter or port; deciding which ring a piece of code belongs in; wiring a new dependency into platform/container.ts; introducing a transaction across repositories; reviewing a backend diff for layering violations; or the user asks where backend logic should live, how to decouple from Drizzle/Fastify, or how to enforce architecture. NOT for frontend structure — that is frontend-ui-architecture; NOT for Fastify route/plugin mechanics — that is fastify-best-practices; NOT for Drizzle query syntax — that is drizzle-orm-patterns."
version: 1.3.0
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

## 8. Environment Config Has One Read Chokepoint (HIGH)

`process.env` is read directly in exactly two places: `platform/config.ts`
(regular config, via `loadConfig()` → `AppConfig`) and
`adapters/secrets/local.ts` (secrets, via `SecretsProvider`). Everywhere else
— domain, application services, routes, other adapters — receives config
through an injected `AppConfig` and secrets through an injected
`SecretsProvider`, never `process.env` directly.

This is §7's boundary-validation instinct applied to a different untrusted
edge: `process.env` is external input exactly like an HTTP body or an LLM
response. Scattering `process.env.X` through the codebase means every call
site re-implements its own parsing, defaulting, and "is this even set" logic
instead of trusting the one place that already validated it — the same
failure mode as re-parsing inside a service, just for env vars instead of
request bodies.

Two narrow, deliberate exceptions, so this rule doesn't cry wolf on code that
is already correct:
- `db/migrate.ts` and `db/seed.ts` are standalone CLI scripts run via
  `pnpm db:*`, outside the DI-wired app — there is no container to inject
  `AppConfig` into, so they read `DATABASE_URL` directly.
- `adapters/git/simple-git.ts` *sets* (not reads) `process.env.GIT_TERMINAL_PROMPT`
  / `GCM_INTERACTIVE` to configure the environment inherited by git
  subprocesses — a child-process concern, not app config.

A new adapter, module, or helper reading `process.env.X` anywhere else is
exactly the violation this rule exists to catch.

## 9. Transactions Belong to Application Services (HIGH)

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

## 10. A Passed Transaction Executor Must Actually Be Used (HIGH)

A repository method that accepts an executor parameter (§9) but doesn't
route it into every Drizzle call in its body is worse than one that opens
its own transaction: it *looks* correct from the call site — same
signature, same calling convention as a properly tx-aware sibling — while
silently running against the ambient client instead of the transaction.
The write commits (or fails to roll back) independently of everything else
in the use case.

Checking this requires reading two places, not one: the call site (does the
service pass `tx`?) and the method body (does every Drizzle call inside use
that parameter, or does it reach for `this.db` / the module-level `db`
instead?). A method can pass the first check and fail the second — the
signature alone proves nothing.

```ts
// BAD — takes the executor, ignores it
async recordRefundEntry(executor: Db, orderId: string, amountCents: number) {
  await this.db.insert(ledgerEntries).values({ orderId, amountCents });  // ← not `executor`
}

// GOOD — the same executor flows through every query
async recordRefundEntry(executor: Db, orderId: string, amountCents: number) {
  await executor.insert(ledgerEntries).values({ orderId, amountCents });
}
```

When two repository methods are called inside the same `db.transaction(tx =>
…)` and only one of them threads `tx` through, the other one is not "mostly
in the transaction" — it is entirely outside it. Multi-repository use cases
are the highest-value place to check this, precisely because each individual
method reads as correct in isolation.

## 11. Domain Errors, HTTP at the Edge (MEDIUM)

The domain throws meaning: `NotFoundError`, `AppError('invalid_run_request', …)`.
Only the HTTP adapter maps meaning to status codes. `platform/errors.ts` already
holds these — extend it rather than throwing framework errors inward.

No `reply.code(404)` inside a service. No Fastify types below the route ring.

## 12. Modules Compose in the Container (HIGH)

Modules do not import each other. Two modules that need to cooperate are wired in
`platform/container.ts`, or the shared piece moves inward to the domain.

`modules/_shared/` is for genuinely cross-module route concerns (`context.ts`,
`schemas.ts`) — not a dumping ground for anything used twice.

Every module self-registers in `src/modules/index.ts`; a module missing there is
dead code.

## 13. Cross-Module Imports Are Forbidden Even for a Single Type (HIGH)

§12 says modules don't import each other — that holds for `import type`
exactly as much as for a value import. `no-cross-module` in
`server/.dependency-cruiser.cjs` fires on type-only edges too
(`tsPreCompilationDeps: true`), and this repo has hit that in practice: a
type-only import from another module's file failed CI just like a value
import would (`server/LEARNINGS.md`, 2026-08-06 addendum). "It's just a
type, there's no runtime coupling" is not an exception — it's still one
module depending on another module's internal shape, and that shape can
still change out from under it.

The established fix, already used by `reviews/service.ts`'s `AgentLookup`
(`modules/reviews/service.ts:9-12`): declare the shape **locally**, in the
consuming file, describing only what it actually uses — never imported from
the other module. The real type or class satisfies it structurally (TS
structural typing doesn't require a shared nominal interface); the concrete
value is wired in at the composition point (`routes.ts` / `container.ts`),
the one place allowed to know concrete classes across modules.

```ts
// BAD — modules/rewards/service.ts
import type { LoyaltyTier } from '../loyalty/types';   // ← no-cross-module, even as a type

// GOOD — declared locally, no import from ../loyalty at all
type LoyaltyTier = 'bronze' | 'silver' | 'gold';   // structural mirror, not imported
```

Checking this means reading imports the same way for `type`-only lines as
for value ones — a reviewer that mentally exempts `import type` from the
cross-module rule will miss exactly the case this section exists for.

## 14. Testing Follows the Rings (MEDIUM)

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

## 15. Enforcement (HIGH)

Rules that only live in prose decay. `dependency-cruiser` is already a
dependency; `server/.dependency-cruiser.cjs` turns each rule above into a
build failure.

Minimum rule set — domain imports nothing outward, routes never touch `db/`,
services never import the container, modules never import each other, no
circular dependencies. New rules land at `severity: "warn"` and flip to
`"error"` once that violation class reaches zero.

Full config: [examples.md](examples.md) §8. `pnpm arch` is the CI gate; it fails
on any violation not in `.dependency-cruiser-known-violations.json`.

**§8 is not dependency-cruiser-checkable.** dependency-cruiser walks the
import graph — it has no view of what a file does with the Node `process`
global, since `process.env.X` is a property read, not a module dependency.
Until this has a dedicated lint rule (e.g. `no-restricted-properties` on
`process.env`, scoped to everywhere except the two chokepoints), catching it
is a review-time job: grep for `process\.env\.` outside
`platform/config.ts` and `adapters/secrets/local.ts`.

**§10 is harder still — it isn't even grep-checkable.** Whether a repository
method uses its `executor` parameter is a dataflow question about one
specific function body, not a text pattern; `executor` appearing in the
parameter list proves nothing about whether it appears in every Drizzle call
inside. This one has no mechanical shortcut: reading the call site and the
full method body, side by side, is the only way to catch it.

**§13, unlike §8 and §10, is already dependency-cruiser-checkable today** —
`no-cross-module` is a real rule in `server/.dependency-cruiser.cjs`, gated
by `pnpm arch`, with `tsPreCompilationDeps: true` specifically so it also
walks `import type`-only edges, not just value imports. The mechanical
enforcement already exists; what a reviewer adds on top is catching it in
diff review *before* CI does, and — more to the point for AI review — not
being talked out of it by "it's just a type."

## 16. Anti-Patterns

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
| `process.env.X` read outside `platform/config.ts` / `adapters/secrets/local.ts` | inject `AppConfig` or `SecretsProvider` instead |
| Repository method accepts an `executor` param but queries via `this.db` / module `db` instead | thread the passed executor into every query in the method |
| `import type { X } from '../other-module/...'` | declare the shape locally; let DI satisfy it structurally |
| Fastify `reply` below the route ring | throw a domain error; the route maps it |
| Module importing another module | compose in the container |
| Entity classes "to do DDD properly" | types + pure functions — see §2 |
| ORM abstraction "in case we swap Postgres" | you will not; the seam is for tests |
| A ring per module, or a fifth ring | four rings total for the whole server |

## 17. Applying This to Existing Code

`server/src` predates this skill and has known violations, catalogued in
[README.md](README.md). Do not sweep them. When you are already editing a file,
fix in this order:

1. Route reaching into `db/` — mechanical, low risk
2. Container in a service constructor — the highest-value fix
3. Business logic importing row types
4. Pure rules trapped inside infrastructure files

Architecture changes go in their own commit, separate from behaviour changes.
