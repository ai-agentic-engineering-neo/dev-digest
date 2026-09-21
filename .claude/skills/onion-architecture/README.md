# Onion Architecture (Backend) Skill

**Version:** 1.0.0
**Compiled:** 2026-09-21

## What this skill is

A project-authored skill that enforces Onion/Layered Architecture for
dev-digest's backend packages — `server/` (`@devdigest/api`) and
`reviewer-core/` (`@devdigest/reviewer-core`). It governs **which direction
code is allowed to depend**: domain types and the pure review engine at the
center, application orchestration (`service.ts`) next, port interfaces
(`shared/adapters.ts`) as the boundary, concrete adapters and Drizzle
repositories as infrastructure, and Fastify `routes.ts` as the outermost,
transport-only layer.

It exists because dev-digest already follows this pattern for external I/O
(GitHub, LLM, git, auth, secrets — all behind interfaces in
`shared/adapters.ts`, wired through `server/src/platform/container.ts`) but
not yet for persistence (Drizzle repositories are instantiated directly, with
no port). This skill documents the existing good pattern so it gets copied
correctly for new work, and flags the one place it isn't followed yet so
reviews catch new instances of the un-inverted alternative instead of
normalizing it further.

## When this skill fires

- Scaffolding a new `server/src/modules/<name>/` module.
- Adding a new external integration — a new SDK, API client, or a new kind of
  database access.
- Reviewing a PR that touches `routes.ts`, `service.ts`, or `repository.ts`.
- Deciding whether a piece of code belongs in the domain, application, or
  infrastructure layer.
- Wiring something new into the DI container
  (`server/src/platform/container.ts`).
- Spotting a `service.ts` or route handler reaching for `drizzle-orm`,
  `octokit`, `openai`, or `@anthropic-ai/sdk` directly — the exact violation
  this skill exists to catch.

## Files in this skill

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | Entry point: the Dependency Rule, relationship to sibling skills, and the "where does new code belong" decision order. |
| [layer-map.md](layer-map.md) | The five layers mapped onto dev-digest's actual files, plus "Applied in This Repo" — concrete evidence of where the pattern already holds and where it doesn't (the repository-inversion gap). |
| [enforcement.md](enforcement.md) | Anti-patterns to flag in review, an optional `dependency-cruiser` config sketch for CI enforcement, and the review checklist. |
| [examples.md](examples.md) | Before/after code for adding a new integration, a repository type leak, misplaced business logic, and `reviewer-core/` as the reference domain center. |
| README.md (this file) | Skill overview, version, and every source the skill is built on. |

## Relationship to sibling skills

- **fastify-best-practices**, **drizzle-orm-patterns**, **zod**,
  **typescript-expert** already cover *how* to use each tool correctly
  (plugin registration, query building, schema composition, type-level
  tricks) — this skill does not repeat any of that and instead cross-refers
  to them for tool mechanics.
- **frontend-ui-architecture** is the client-side counterpart: both skills
  share the same underlying idea (dependency direction, colocation of
  concerns) applied to different runtimes.

## References

Grouped by the question each source answers in this skill.

### 1. Onion / Clean / Hexagonal — theory

- [Jeffrey Palermo — The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) —
  the original 2008 article that coined the term and the four founding
  tenets [SKILL.md](SKILL.md)'s "Core Principle" section is built on: the
  application is built around an independent domain model, inner layers
  define interfaces that outer layers implement, and all coupling points
  toward the center.
- [Jeffrey Palermo — The Onion Architecture: part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) —
  follow-up detailing how infrastructure concerns (DB, external services)
  get pushed to the outermost ring.
- [Milan Jovanović — Clean vs. Onion vs. Hexagonal Architecture](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal) —
  the clearest practical comparison of the three; the source for this
  skill's framing that they're variations on the same Dependency Rule with
  different vocabulary, and that Hexagonal's "ports and adapters" language
  is what this skill borrows for the `shared/adapters.ts` boundary.
- [Herberto Graça — Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) —
  part of "The Software Architecture Chronicles" series; a deeper dive into
  why the domain model must stay framework-agnostic, referenced for the
  "domain must not know HTTP/DB/messaging exist" framing.
- [Allegro Tech — Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) —
  a practical engineering-blog walkthrough (not academic), useful for the
  "what actually goes wrong when you skip this" framing used in
  [enforcement.md](enforcement.md).

### 2. Node.js / TypeScript implementations

- [dev.to — Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) —
  a full worked Node/TS example with a DI container, the closest published
  analog to dev-digest's own `container.ts` pattern; referenced for
  validating that a hand-rolled DI container (rather than a framework like
  InversifyJS) is a legitimate way to wire ports to adapters.
- [LogRocket — Node.js project architecture best practices](https://blog.logrocket.com/node-js-project-architecture-best-practices/) —
  general guidance on layering a Node backend by technical capability
  (domain/application/infrastructure) rather than by feature, which is the
  layout [layer-map.md](layer-map.md)'s table follows.

### 3. Fastify as the DI/transport mechanism

- [Snyk — Fastify plugins as building blocks for a backend Node.js API](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/) —
  explains Fastify's plugin/encapsulation system as a lightweight DI
  mechanism (`.decorate()` to expose a service, `.register()` to scope it);
  the basis for treating `routes.ts` as pure transport that receives
  already-wired services rather than constructing them.
- [fastify/help#284 — What is best practice for dependency injection?](https://github.com/fastify/help/issues/284) —
  the maintainers' own discussion of DI patterns in Fastify apps; confirms
  there's no single official DI framework and a manual container (as
  dev-digest already has) is an accepted approach, not a workaround.

### 4. Drizzle ORM and the repository pattern

- [paulserban.eu — Drizzle ORM Best Practices: Principles, Patterns, and Real-World Case Studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) —
  covers repository-pattern separation with Drizzle specifically: repository
  interfaces should express business operations, not database operations,
  and should not leak raw ORM/schema details past their boundary — the
  direct source for [layer-map.md](layer-map.md)'s "repository↔service seam"
  rule.
- [Medium — Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) —
  a worked example of wrapping Drizzle behind a repository interface in a
  layered Node app; referenced for the "new modules with non-trivial
  repository logic should consider an interface" recommendation, since
  dev-digest's existing repositories don't yet do this.

### 5. Zod as the domain contract layer

- [Zod documentation](https://zod.dev/) — canonical reference for
  `z.infer`/schema composition, used as the mechanism for
  `@devdigest/shared/contracts/*.ts` domain types.
- [LogRocket — Schema validation in TypeScript with Zod](https://blog.logrocket.com/schema-validation-typescript-zod/) —
  general guidance on using a single Zod schema as the source of truth for
  both runtime validation and static types, which is why this skill treats
  `shared/contracts` (Zod-derived types) as the Domain layer rather than
  hand-written interfaces duplicated elsewhere.

## What this skill deliberately does not duplicate

- `fastify-best-practices` already covers routes, plugins, hooks, schemas,
  and the Fastify request lifecycle in depth — this skill only touches
  `routes.ts` insofar as it must stay transport-only.
- `drizzle-orm-patterns` already covers schema definition, queries, joins,
  transactions, and migrations — this skill only touches `repository.ts`
  insofar as its public boundary must not leak raw inferred types past the
  service layer.
- `zod` already covers schema definition, parsing, and type-inference rules
  in depth — this skill only relies on Zod schemas as the domain-type
  mechanism, not as a validation-authoring guide.
- `frontend-ui-architecture` is the client-side counterpart — read that one
  for anything about where client code lives.

## Changelog

- **1.0.0** (2026-09-21) — Initial version: layer map, enforcement rules,
  examples, and references derived from the actual `server/` +
  `reviewer-core/` codebase.
