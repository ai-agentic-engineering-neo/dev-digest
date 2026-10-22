# onion-architecture — sources and rationale

Skill entry point: [SKILL.md](SKILL.md).

## Why this skill

`server/` already has the parts of an onion — Zod contracts in `@devdigest/shared`, adapter
interfaces (ports), `adapters/*`, a composition root (`platform/container.ts`), and a pure engine
(`reviewer-core`) — but the dependency rule was never written down, and Drizzle has leaked into
routes and executors. This skill names the rings, maps them onto the existing folders, and makes
the import rules explicit so new code stops adding leaks.

## Design decisions

- **Pragmatic, not textbook.** No `domain/ application/ infrastructure/` folders; the existing
  `routes → service → repository` + `adapters/` layout already expresses the rings. Palermo
  himself says the pattern is about where dependencies point, not folder names, and that it works
  "with and without DDD".
- **Domain model = contracts + pure functions.** DevDigest is a workflow app over PRs; rich domain
  entities would add mapping cost with little gain. Zod contracts are the stable center.
- **Ports only where they pay.** External systems and test seams get interfaces; single-impl
  repositories don't.
- **Enforcement is by checklist + grep for now.** `dependency-cruiser` is already a dependency
  and is the natural next step for CI enforcement.

## Sources

### Onion Architecture
- Jeffrey Palermo — [The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) (tenets, ring diagram)
- Jeffrey Palermo — [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) (worked example)
- Jeffrey Palermo — [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) (vs. traditional layering)
- Jeffrey Palermo — [part 4 — After Four Years](http://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/) (the four tenets restated; works with/without DDD)
- Herberto Graça — [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)
- Herberto Graça — [Explicit Architecture: DDD, Hexagonal, Onion, Clean, CQRS](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- NDepend — [Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/)
- Marco Lenzo — [The Onion Architecture explained](https://marcolenzo.eu/the-onion-architecture-explained/)

### Related architectures
- Robert C. Martin — [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Alistair Cockburn — [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- Mark Seemann — [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- Martin Fowler — [Repository](https://martinfowler.com/eaaCatalog/repository.html)

### TypeScript / Node
- [Hexagonal Architecture and Clean Architecture (with examples)](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Hexagonal Architecture (Ports and Adapters) in TypeScript](https://www.matthewswong.com/en/blog/hexagonal-architecture-ports-and-adapters/)
- [kroneman/hexagonal-architecture-ts](https://github.com/kroneman/hexagonal-architecture-ts)
- Khalil Stemmler — [Organizing App Logic with the Clean Architecture](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/)

### Fastify
- [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) · [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) · [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [fastify/help #284 — best practice for dependency injection](https://github.com/fastify/help/issues/284)
- Snyk — [Fastify plugins as building blocks for a backend Node.js API](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/)
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)

### Drizzle
- Sentry — [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- Paul Serban — [Drizzle ORM Best Practices](https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Drizzle docs — Transactions](https://orm.drizzle.team/docs/transactions)

### Zod at the boundaries
- Alexis King — [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)

### Enforcing the dependency rule (next step)
- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- Atomic Object — [Dependency Cruiser: Restrict Imports](https://spin.atomicobject.com/dependency-cruiser-imports/)
- DEV — [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
