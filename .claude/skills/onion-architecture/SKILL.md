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
(`@devdigest/reviewer-core`).

- [README.md](README.md) — what this skill is, when it fires, and every source
  it's built on.
- [layer-map.md](layer-map.md) — the five layers mapped onto dev-digest's
  actual files, plus where the repo already follows this and where it
  doesn't yet.
- [enforcement.md](enforcement.md) — anti-patterns to flag in review, an
  optional `dependency-cruiser` config sketch, and the review checklist.
- [examples.md](examples.md) — before/after code for each rule below.

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

## Core Principle: The Dependency Rule

Onion Architecture (Jeffrey Palermo, 2008) puts the domain model at the
center and pushes every framework/infrastructure concern — HTTP, database
mapping, third-party SDKs, messaging — to the outside. The rule that holds
the whole shape together: **code may depend only on layers more central than
itself; nothing in an inner layer may import from an outer one.** Clean
Architecture and Hexagonal (Ports & Adapters) are siblings of the same idea —
different vocabulary, same dependency direction. See [README.md](README.md)
for the theory sources this section is built on.

In practice this comes down to one testable question for every import: **is
this import pointing outward (toward a framework/SDK/database) or inward
(toward domain types/business rules)?** An inner file should never need to
know a package name like `drizzle-orm`, `octokit`, `openai`, or
`@anthropic-ai/sdk` exists. [layer-map.md](layer-map.md) turns this into a
concrete table of "this layer may import that, must not import this" for
dev-digest's own files.

## Where Does New Code Belong? (decision order)

1. **A new external integration** (a new SDK, third-party API, or a new kind
   of database access) → define a port interface in
   `@devdigest/shared/adapters.ts` first, write the concrete implementation
   under `server/src/adapters/<name>/`, add a mock in
   `server/src/adapters/mocks.ts`, and wire it in
   `server/src/platform/container.ts`. Nothing downstream imports the SDK
   directly — only that one adapter file does. See the Slack example in
   [examples.md](examples.md).
2. **A new business rule or orchestration step** (combine two adapters, apply
   a policy, decide what happens next) → `service.ts`. It depends on ports
   (interfaces), never on the concrete adapter classes or the raw SDK. It
   should take the whole `Container` in its constructor (matching
   `ReviewService`/`RepoService`) and pull ports off it via the container's
   getters, rather than taking individual ports as separate constructor
   arguments.
3. **A new domain type or contract** (a shape shared across modules or
   packages, or validated at a boundary) → `@devdigest/shared/contracts/*.ts`
   as a Zod schema + inferred type. Remember it's manually duplicated to
   `client/src/vendor/shared` — copy both sides by hand.
4. **A new HTTP endpoint** → `routes.ts`. It parses the request, calls exactly
   one `service.ts` method, and maps the result to a status/body. No query
   building, no SDK calls, no branching business logic here. Not every module
   needs one: a module that's only ever called in-process by another module
   (no external HTTP consumer) can skip `routes.ts` entirely rather than
   adding a debug-only endpoint just for the sake of having one — a thin
   manual test route is fine if it genuinely helps verify wiring, but don't
   treat `routes.ts` as mandatory scaffolding.
5. **A new persistence query** → `repository.ts`. It may use Drizzle freely,
   but its public methods should return domain/shared types where reasonably
   possible (see [layer-map.md](layer-map.md)'s repository-boundary note),
   and no other file in the module should import `drizzle-orm` or
   `postgres`.
6. **A call into another module's service** (e.g. `reviews` needs to trigger
   `notifications`) → instantiate the callee at the call site with `new
   OtherService(this.container)`, the same way `service.ts` files already
   construct their own `repository.ts`. Reserve a container-level facade
   getter (like `container.repoIntel`) for a subsystem with several
   independent consumers — a single caller doesn't need one. See
   [examples.md](examples.md) for a worked example.

For what to flag when this ordering was skipped, go to
[enforcement.md](enforcement.md).
