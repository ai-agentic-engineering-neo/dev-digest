# Sources and further reading

Collected 2026-11-05. ✔ = original source opened and checked.

## Onion and related architectures

- ✔ [Jeffrey Palermo — The Onion Architecture, part 1 (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/):
  the original. All coupling points toward the center, the domain model is the core, repository
  interfaces sit next to it, infrastructure is external. Parts 2–4 (part 4 is "After Four Years", 2013) are on the same blog.
- ✔ [Robert C. Martin — The Clean Architecture (2012)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html):
  "source code dependencies can only point inwards".
- ✔ [Oliver Drotbohm — Sliced Onion Architecture (2023)](https://odrotbohm.github.io/2023/07/sliced-onion-architecture):
  slice the onion per business module, giving a modulith. This matches our `modules/<name>/` and the no-cross-module rule.
- [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)
- [Herberto Graça — Ports & Adapters Architecture](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)
- [Herberto Graça — Clean Architecture: standing on the shoulders of giants](https://herbertograca.com/2017/09/28/clean-architecture-standing-on-the-shoulders-of-giants/)
- [NDepend — Onion Architecture layers](https://blog.ndepend.com/onion-architecture-layers)
- [Martin Fowler — Repository (PoEAA catalog)](https://www.martinfowler.com/eaaCatalog/repository.html)
- [Khalil Stemmler — Mapper pattern, DTOs, repositories (TypeScript DDD)](https://khalilstemmler.com/articles/tags/mapper-pattern)
- [awesome-software-architecture — Onion Architecture (link collection)](https://github.com/mehdihadeli/awesome-software-architecture/blob/main/docs/onion-architecture.md)

## Tools in our stack

- [Fastify — The hitchhiker's guide to plugins (encapsulation, decorators, fastify-plugin)](https://www.fastify.dev/docs/latest/Guides/Plugins-Guide/)
- [Fastify — Testing (`inject`)](https://fastify.dev/docs/latest/Guides/Testing)
- [Drizzle ORM — Transactions](https://orm.drizzle.team/docs/transactions)
- [Bedstack — Database & ORM (the repository as the only Drizzle owner)](https://bedstack.js.org/docs/database)
- [Folionaut ADR 004 — Repository pattern over Drizzle (trade-offs)](https://spencerjireh.github.io/folionaut/decisions/004-repository-pattern)
- [kamae-ts — Boundary Defense (validate at the edges with a schema library)](https://iwasa-kosui.github.io/kamae-ts/en/boundary-defense.html)
- [lastminute.com — How we enforce architecture boundaries at scale (dependency-cruiser)](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/)
- [Xebia — Taking architecture serious with dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)

## Example repositories (Node / TypeScript)

- [JamieLivingstone/node-clean-architecture](https://github.com/JamieLivingstone/node-clean-architecture): Awilix DI, Prisma, Zod
- [revell29/fastify-clean-architecture](https://github.com/revell29/fastify-clean-architecture): Fastify, explicit use-case, domain and infrastructure folders

## Why we deviate from "textbook" Onion

- **No DI framework (Awilix etc.).** The hand-written `Container` with lazy getters and `overrides`
  already is the composition root. Narrow `Pick<Container, …>` deps give the same decoupling.
- **Contracts are shared Zod schemas.** The core may use them with `import type`, so we don't duplicate types.
- **The layout is per module, not one global set of `domain/application/infrastructure` folders.**
  This follows Drotbohm's sliced onion and matches the existing `modules/<name>/` convention.
