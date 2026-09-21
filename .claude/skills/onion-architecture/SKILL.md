---
name: onion-architecture
description: >
  Enforces Onion/Layered Architecture for backend modules in server/ and reviewer-core/ —
  which direction dependencies are allowed to point, where domain types vs. I/O adapters vs.
  transport code must live, and how a new external integration must go through a port
  interface instead of a direct SDK import. Use this skill whenever scaffolding a new
  server/src/modules/<name>/ module, adding a new external integration (a new SDK, API
  client, or database access path), reviewing a PR that touches routes.ts/service.ts/
  repository.ts, deciding whether code belongs in domain, application, or infrastructure,
  or wiring something into the DI container. Also use it when a service.ts or route handler
  is reaching for drizzle-orm, octokit, openai, or @anthropic-ai/sdk directly — that's the
  exact violation this skill exists to catch. Complements frontend-ui-architecture (the
  client-side counterpart skill) — that one governs where client code lives, this one
  governs the backend's dependency direction.
version: "1.0.0"
---

# Onion Architecture (Backend)

Guidance for **which direction backend code is allowed to depend**, not how any
one library is used. Covers `server/` (`@devdigest/api`) and `reviewer-core/`
(`@devdigest/reviewer-core`). See [examples.md](examples.md) for before/after
code, and [references.md](references.md) for every source this skill draws on.

## Relationship to sibling skills

- **fastify-best-practices**, **drizzle-orm-patterns**, **zod**,
  **typescript-expert** — cover *how* to use each tool correctly (plugin
  registration, query building, schema composition, type-level tricks). Read
  those for tool mechanics.
- **frontend-ui-architecture** — the client-side mirror of this skill: where a
  React/Next.js file belongs and when to split it.
- **This skill** — *which direction* a piece of backend code is allowed to
  depend, and *which layer* it belongs to. If the question is "how do I write
  a Drizzle query," go to drizzle-orm-patterns. If it's "should this file be
  allowed to import Drizzle at all," stay here.

---

## Core Principle: The Dependency Rule

Onion Architecture (Jeffrey Palermo, 2008) puts the domain model at the
center and pushes every framework/infrastructure concern — HTTP, database
mapping, third-party SDKs, messaging — to the outside. The rule that holds
the whole shape together: **code may depend only on layers more central than
itself; nothing in an inner layer may import from an outer one.** Clean
Architecture and Hexagonal (Ports & Adapters) are siblings of the same idea —
different vocabulary, same dependency direction. See
[references.md](references.md) for the theory sources this section is built
on.

In practice this comes down to one testable question for every import: **is
this import pointing outward (toward a framework/SDK/database) or inward
(toward domain types/business rules)?** An inner file should never need to
know a package name like `drizzle-orm`, `octokit`, `openai`, or
`@anthropic-ai/sdk` exists.

## Layers Mapped onto dev-digest's Stack

```
                    ┌─────────────────────────────────────┐
                    │  Interface / Transport               │
                    │  routes.ts (Fastify handlers)         │
                    │  → parses request, calls service,     │
                    │    maps result to HTTP status/body     │
                    │  ┌───────────────────────────────┐     │
                    │  │  Infrastructure                │     │
                    │  │  server/src/adapters/*          │     │
                    │  │  repository.ts (Drizzle/Postgres)│    │
                    │  │  → implements the ports          │    │
                    │  │  ┌─────────────────────────┐     │    │
                    │  │  │  Ports (boundary)          │     │    │
                    │  │  │  shared/adapters.ts          │     │    │
                    │  │  │  → interfaces only, no I/O    │     │    │
                    │  │  │  ┌───────────────────┐     │     │    │
                    │  │  │  │  Application         │     │     │    │
                    │  │  │  │  service.ts            │     │     │    │
                    │  │  │  │  → orchestrates, depends│     │     │    │
                    │  │  │  │    on ports, not concretes│    │     │    │
                    │  │  │  │  ┌───────────────┐   │     │     │    │
                    │  │  │  │  │  Domain (center) │   │     │     │    │
                    │  │  │  │  │  shared/contracts│   │     │     │    │
                    │  │  │  │  │  reviewer-core/   │   │     │     │    │
                    │  │  │  │  └───────────────┘   │     │     │    │
                    │  │  │  └─────────────────────┘     │     │    │
                    │  │  └───────────────────────────────┘     │    │
                    │  └─────────────────────────────────────┘     │
                    └─────────────────────────────────────────────┘
```

| Layer | dev-digest location | May import | Must NOT import |
|---|---|---|---|
| **Domain** (center) | `@devdigest/shared/contracts/*.ts` (Zod-derived types); `reviewer-core/` (pure diff→prompt→LLM→findings engine) | nothing outward — plain TS/Zod only | Fastify, Drizzle, Octokit, `openai`/`@anthropic-ai/sdk`, Node `fs`/`net` |
| **Application** | `server/src/modules/<name>/service.ts` | domain types, ports from `shared/adapters.ts` | concrete SDKs directly — only through an injected port |
| **Ports** (boundary) | `@devdigest/shared/adapters.ts` (`AuthProvider`, `SecretsProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `LLMProvider`) | domain types only | any concrete implementation |
| **Infrastructure** | `server/src/adapters/{git,github,llm,secrets,auth,embedder,codeindex}/*`; `repository.ts` (Drizzle) | the SDK it wraps, the port interface it implements | nothing else in the module — no business rules here |
| **Interface / Transport** | `server/src/modules/<name>/routes.ts` | the module's `service.ts` | Drizzle, Octokit, LLM SDKs, business logic |

## Where Does New Code Belong? (decision order)

1. **A new external integration** (a new SDK, third-party API, or a new kind
   of database access) → define a port interface in
   `@devdigest/shared/adapters.ts` first, write the concrete implementation
   under `server/src/adapters/<name>/`, add a mock in
   `server/src/adapters/mocks.ts`, and wire it in
   `server/src/platform/container.ts`. Nothing downstream imports the SDK
   directly — only that one adapter file does.
2. **A new business rule or orchestration step** (combine two adapters, apply
   a policy, decide what happens next) → `service.ts`. It depends on ports
   (interfaces), never on the concrete adapter classes or the raw SDK.
3. **A new domain type or contract** (a shape shared across modules or
   packages, or validated at a boundary) → `@devdigest/shared/contracts/*.ts`
   as a Zod schema + inferred type. Remember it's manually duplicated to
   `client/src/vendor/shared` — copy both sides by hand.
4. **A new HTTP endpoint** → `routes.ts`. It parses the request, calls exactly
   one `service.ts` method, and maps the result to a status/body. No query
   building, no SDK calls, no branching business logic here.
5. **A new persistence query** → `repository.ts`. It may use Drizzle freely,
   but its public methods should return domain/shared types where reasonably
   possible (see the repository-boundary note below), and no other file in
   the module should import `drizzle-orm` or `postgres`.

## Applied in This Repo (dev-digest)

The layering above is not aspirational — most of it already exists:

- **Ports for external I/O already exist and are the pattern to copy.**
  [server/src/vendor/shared/adapters.ts](../../../server/src/vendor/shared/adapters.ts)
  defines `AuthProvider`, `SecretsProvider`, `GitHubClient`, `GitClient`,
  `CodeIndex`, `Embedder`, `LLMProvider`. Real implementations live in
  [server/src/adapters/{git,github,llm,secrets,auth,embedder,codeindex}](../../../server/src/adapters)
  and mocks in
  [server/src/adapters/mocks.ts](../../../server/src/adapters/mocks.ts).
  [server/src/platform/container.ts](../../../server/src/platform/container.ts)
  wires the real adapters behind those interfaces and exposes
  `ContainerOverrides` for test injection, with the comment "Services depend
  on these interfaces, not the concrete classes" — that sentence *is* the
  Dependency Rule for this repo. When adding a new integration, follow this
  existing pattern rather than inventing a new one.
- **`routes.ts` → `service.ts` → `repository.ts` → db is already the
  convention** for every `server/src/modules/<name>/` module (documented in
  [server/AGENTS.md](../../../server/AGENTS.md)), confirmed in `repos`,
  `reviews`, and `agents`. `routes.ts` stays transport-only; `constants.ts`
  holds literals; `helpers.ts` holds pure transforms.
- **`reviewer-core/` is the cleanest example of the domain center**: zero
  imports of a database, GitHub client, or filesystem. Its only side effect
  is one call through an injected `LLMProvider` port — see
  [reviewer-core/AGENTS.md](../../../reviewer-core/AGENTS.md). Point to this
  package whenever someone asks "what does a pure domain/application layer
  actually look like here."
- **The one layer that is NOT yet inverted: persistence.** Unlike GitHub/LLM/
  git/auth/secrets, Drizzle repositories have no port interface — services
  instantiate them directly, e.g.
  `this.repo = new RepoRepository(container.db)`. This is a known,
  acceptable gap for existing modules (retrofitting every repository is not
  worth the churn on its own), but **new modules with non-trivial repository
  logic should consider an `IRepoRepository`-style interface** so the service
  can be tested against a mock the same way GitHub/LLM already are. Flag this
  gap in review rather than silently copying the un-inverted pattern forward.
- **The repository↔service seam is where a raw Drizzle type is allowed to
  exist, and only there.** `RepoRepository` returns `RepoRow` (`type RepoRow
  = typeof t.repos.$inferSelect`,
  [server/src/modules/repos/repository.ts:11](../../../server/src/modules/repos/repository.ts)),
  and `RepoService` immediately maps it through `toRepoDto()` into the
  Zod-derived `Repo` domain type from `@devdigest/shared` before returning
  (`server/src/modules/repos/service.ts:39,109-112`). A public `service.ts`
  method should never return a `$inferSelect`/`$inferInsert` type — if you
  see one escape past `service.ts`, that's a layering violation.

## Anti-Patterns to Flag

- **A route handler importing `drizzle-orm`, `postgres`, or a Fastify
  decorator's raw db client directly**, skipping `service.ts`/`repository.ts`
  entirely. Even a "quick" read-only endpoint should go through the service.
- **`service.ts` importing `octokit`, `openai`, `@anthropic-ai/sdk`, or
  `simple-git` directly** instead of receiving the port
  (`GitHubClient`/`LLMProvider`/`GitClient`) through the container. This is
  the single most common onion violation and the one this skill exists to
  catch — grep for these package names inside any `service.ts`.
- **A `$inferSelect`/`$inferInsert` Drizzle type appearing in a `service.ts`
  method signature (parameter or return type)** rather than being mapped to a
  shared/domain type inside `repository.ts` or `helpers.ts` first.
- **Business logic (branching, validation, orchestration) written directly
  in `routes.ts`** instead of `service.ts`, because "it's just one line."
  It's still the wrong layer, and it means the logic can't be unit-tested
  without spinning up Fastify's inject().
- **A `@devdigest/shared/contracts/*.ts` file importing anything from
  `server/` or `client/`** — the domain layer must never depend on an outer
  layer, even transitively.
- **A new external SDK wired up with a `new` call directly inside `service.ts`
  or a route handler**, instead of going through `container.ts`. If it can't
  be swapped for a mock via `ContainerOverrides`, it isn't inverted.

## Optional Enforcement: `dependency-cruiser`

`dependency-cruiser` is already a `server/package.json` dependency, but today
it's only used as a library inside
[server/src/adapters/depgraph](../../../server/src/adapters/depgraph) to
analyze the import graph of *other* repositories for the `repo-intel`
indexer — it is not currently configured to check dev-digest's own codebase.
Adding a `.dependency-cruiser.js` at the `server/` root with a forbidden-rule
like the one below turns this skill's core anti-pattern into a CI-checkable
rule instead of something only caught in review:

```js
// server/.dependency-cruiser.js — sketch, not yet wired into CI
module.exports = {
  forbidden: [
    {
      name: 'service-must-not-import-sdks-directly',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/service\\.ts$' },
      to: { path: '^(drizzle-orm|postgres|octokit|openai|@anthropic-ai/sdk)$' },
    },
    {
      name: 'routes-must-not-import-db-or-sdks',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^(drizzle-orm|postgres|octokit|openai|@anthropic-ai/sdk)$' },
    },
    {
      name: 'shared-contracts-must-not-import-server-or-client',
      severity: 'error',
      from: { path: '^src/vendor/shared/contracts/' },
      to: { path: '^src/(modules|adapters|platform)/' },
    },
  ],
};
```

Treat this as a starting point to refine, not a drop-in file — run it once
against the current `server/` tree and expect it to need tuning before it's
strict enough to turn on in CI.

## Quick Checklist (for reviews)

1. Does any `service.ts` import a concrete SDK (`drizzle-orm`, `octokit`,
   `openai`, `@anthropic-ai/sdk`, `simple-git`) instead of a port from
   `shared/adapters.ts`?
2. Does any `routes.ts` reach past `service.ts` into a repository, adapter,
   or raw db client?
3. Does a `service.ts` method's signature expose a `$inferSelect`/
   `$inferInsert` Drizzle type instead of a shared/domain type?
4. Is there branching business logic sitting in `routes.ts` that belongs in
   `service.ts`?
5. Does a new external integration have a port in `shared/adapters.ts`, a
   concrete implementation in `server/src/adapters/<name>/`, a mock in
   `adapters/mocks.ts`, and a registration in `container.ts` — all four, not
   just the concrete implementation?
6. Does anything under `@devdigest/shared/contracts/` or `reviewer-core/`
   import from `server/` or `client/`? That's the domain layer depending
   outward — never acceptable.
7. If a repository is growing complex query/business logic, has an interface
   been considered so it can be swapped for a mock in tests, the same way
   GitHub/LLM/git already are?
