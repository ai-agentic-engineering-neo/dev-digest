# onion-architecture

Onion (clean / hexagonal, ports-and-adapters) architecture for the DevDigest
`server/` package. This README is for people maintaining the skill; the agent reads
[`SKILL.md`](SKILL.md).

## Version

| Version | Date | Change |
|---|---|---|
| **1.0.0** | 2026-09-21 | First release: ring map for `server/`, dependency rule, "where does X go" table, per-ring rules for Fastify / services / pure domain / Drizzle repositories / adapters / container, `UnitOfWork` transactions, errors, testing by ring, review checklist; dependency-cruiser enforcement (`pnpm arch:check`) with a known-violations baseline; references for stack specifics, transactions, enforcement and worked examples. |

The version is also in the `SKILL.md` frontmatter as `metadata.version`. Keep the
two in sync. Semver: **major** when a rule changes meaning or is removed, **minor**
when a rule or reference file is added, **patch** for wording and link fixes.

## Focus

One rule: **source-code dependencies point inwards only.** The skill answers:

- which ring a piece of server code belongs to, and which way it may import;
- where queries, business rules, validation, mappers, transactions and errors live;
- when a module deserves a service and pure domain functions, and when a CRUD
  route + repository is enough;
- how the rules are checked (`pnpm arch:check`) and how the baseline of existing
  violations is maintained.

## Decisions baked in (2026-09-21)

| Question | Decision | Why |
|---|---|---|
| Services get the whole `Container` or narrow deps? | Narrow `Deps` for new code; existing services migrate when touched | explicit dependencies, container-free tests, removes the `container ↔ service` cycle |
| zod in the domain ring? | Allowed | the contracts in `@devdigest/shared` are zod schemas; parsing is how data becomes a domain type |
| Enforce or only document? | Enforce with dependency-cruiser + known-violations baseline | the package was already a dependency; the baseline lets the rules land without a rewrite |
| Scope | `server/` only | `reviewer-core` is used as the model of a pure core, not given its own rules |
| Routes → own repository? | Allowed for CRUD modules | Seemann's *Ports and fat adapters*: no forwarding-only service layers |
| Transactions | Service owns the boundary through a `UnitOfWork` port with an opaque `TxScope` | keeps Drizzle out of the application ring (Sentry's atomic-repositories pattern) |

## What it covers / does not cover

| Covers | Does not cover (goes to) |
|---|---|
| Ring map, import direction, module boundaries | Fastify API, hooks, plugins, logging → `fastify-best-practices` |
| Where queries, rules, mappers, transactions, errors live | Drizzle query syntax, relations, migrations → `drizzle-orm-patterns` |
| Ports and adapters, composition root | Table design and indexes → `postgresql-table-design` |
| Testing by ring (what needs a DB, what does not) | Schema authoring → `zod`; test policy → `TESTING.md` |
| dependency-cruiser rules and baseline workflow | Frontend structure → `frontend-ui-architecture` |

## Enforcement files

- `server/.dependency-cruiser.cjs` — the rules.
- `server/.dependency-cruiser-known-violations.json` — the 24 violations that
  existed on 2026-09-21. It should only ever shrink.
- `server/package.json` — `arch:check`, `arch:baseline`.

Every rule was proven to fire with a throwaway violating file before release.

## Sources

### Onion, clean and hexagonal architecture

- [The Onion Architecture : part 1 — Jeffrey Palermo](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) — the original tenets; "not appropriate for small websites".
- [Onion architecture tag — Programming with Palermo](https://jeffreypalermo.com/tag/onion-architecture/) — parts 2–4.
- [Original Onion architecture example (GitHub fork)](https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture)
- [Onion Architecture — Herberto Graça](https://herbertograca.com/2017/09/21/onion-architecture/) · [Medium version](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85)
- [The Clean Architecture — Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) — the Dependency Rule.
- [Hexagonal Architecture — Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture) — ports and adapters.
- [Functional architecture is Ports and Adapters — Mark Seemann](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/) — pure core, I/O at the edges.
- [Ports and fat adapters — Mark Seemann](https://blog.ploeh.dk/2025/04/01/ports-and-fat-adapters/) — against forwarding-only use-case layers.
- [More functional pits of success — Mark Seemann](https://blog.ploeh.dk/2023/03/27/more-functional-pits-of-success/)
- [Functional Core with Ports and Adapters — DEV](https://dev.to/siy/functional-core-with-ports-and-adapters-3m0g)
- [Hexagonal Architecture and Clean Architecture (with examples) — DEV](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Anemic domain model — Wikipedia](https://en.wikipedia.org/wiki/Anemic_domain_model)
- [Designing the infrastructure persistence layer — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)

### TypeScript / Node.js

- [Implementing SOLID and the onion architecture in Node.js with TypeScript — Remo Jansen](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad)
- [Enforce Clean Architecture in TypeScript with fresh-onion — Remo Jansen](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi)
- [Domain-Driven Hexagon — Sairyss](https://github.com/Sairyss/domain-driven-hexagon) — warns it is ill-suited for simple CRUD.
- [Better Software Design with Application Layer Use Cases — Khalil Stemmler](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/)
- [Implementing DTOs, Mappers & the Repository Pattern — Khalil Stemmler](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/)
- [Understanding Domain Entities — Khalil Stemmler](https://khalilstemmler.com/articles/typescript-domain-driven-design/entities/)
- [typescript-onion (GitHub)](https://github.com/JeffMangan/typescript-onion) · [onion-architecture-boilerplate (GitHub)](https://github.com/Melzar/onion-architecture-boilerplate)

### Fastify

- [Plugins — Fastify docs](https://fastify.dev/docs/latest/Reference/Plugins/)
- [Encapsulation — Fastify docs](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [The hitchhiker's guide to plugins — Fastify](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
- [fastify-boilerplate — clean architecture + DDD on Fastify 5](https://github.com/marcoturi/fastify-boilerplate)
- [clean-architecture-fastify-mongodb](https://github.com/borjatur/clean-architecture-fastify-mongodb)

### Drizzle, repositories, transactions

- [Atomic Repositories in Clean Architecture and TypeScript — Sentry](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) — basis of `references/transactions.md`.
- [Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Transactions with DDD and Repository Pattern in TypeScript, Part 2](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901)
- [Drizzle ORM Best Practices — Paul Serban](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)

### Enforcement (dependency-cruiser)

- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) · [rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md)
- [Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)
- [Avoid Cross Module Dependencies with Dependency Cruiser — DEV](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)

### Well-known, not re-verified when this skill was written

- [Parse, don't validate — Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- [PresentationDomainDataLayering — Martin Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- [Repository — Martin Fowler, PoEAA catalog](https://martinfowler.com/eaaCatalog/repository.html)
- [Functional Core, Imperative Shell — Gary Bernhardt](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell)
