# Sources

What each source contributes to this skill. Several were reviewed only through excerpts
when the skill was written (2026-11-24); re-read the original before quoting it in a design doc.

## Onion and related ring architectures

| Source | Why it's here |
|---|---|
| [Jeffrey Palermo — The Onion Architecture, part 1 (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | Origin of the pattern: independent object model at the center, interfaces declared inside and implemented outside, infrastructure pushed to the edge |
| [Jeffrey Palermo — part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) | Continues the series with a worked example |
| [Jeffrey Palermo — series index incl. part 4 "After Four Years" (2013)](https://jeffreypalermo.com/tag/onion-architecture) | The author's later reflections; when the pattern is worth its cost (long-lived, behaviour-rich apps) |
| [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | Clear ring definitions; how Onion folds DDD layers into Ports & Adapters |
| [Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | "Explicit Architecture": the combined model behind our ring table, application layer = use cases, read-model split |
| [Robert C. Martin — The Clean Architecture (2012)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | The Dependency Rule ("source code dependencies can only point inwards"); policies inside, mechanisms outside |
| [Alistair Cockburn — Hexagonal Architecture](https://alistaircockburn.com/Articles/Hexagonal-Architecture) | Ports & adapters; driving vs driven side; app testable without DB/UI |
| [Allegro Tech — Onion Architecture (2023)](https://blog.allegro.tech/2023/02/onion-architecture.html) | Practitioner experience applying Onion in production services |
| [NDepend — Onion Architecture layers](https://blog.ndepend.com/onion-architecture-layers/) | Layer-by-layer walkthrough and dependency direction vs classic layering |

## Patterns used inside the rings

| Source | Why it's here |
|---|---|
| [Sairyss — Domain-Driven Hexagon](https://github.com/Sairyss/domain-driven-hexagon) | TypeScript reference guide combining DDD/Hexagonal/Onion/Clean; module structure, mappers, ports |
| [Khalil Stemmler — Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) | Clean architecture in Node + TypeScript terms |
| [Khalil Stemmler — mapper pattern articles](https://khalilstemmler.com/articles/tags/mapper-pattern) | DTOs, mappers and repositories in TS (row ⇄ domain ⇄ DTO) |
| [Martin Fowler — Repository](https://www.martinfowler.com/eaaCatalog/repository.html) | Repository as a collection-like interface between domain and data mapping |
| [Martin Fowler — Anemic Domain Model](https://www.martinfowler.com/bliki/AnemicDomainModel.html) | Why business rules don't belong in services-over-rows; we start with pure policies (decision Q4) |
| [Mark Seemann — Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) | Compose the graph at the entry point; the container must not leak out |
| [Mark Seemann — Composition Root location](https://blog.ploeh.dk/2019/06/17/composition-root-location/) | Where the root lives (near the entry point → `platform/container.ts`, `app.ts`) |
| [Alexis King — Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | Parse untrusted input once at the boundary into precise types |
| [Sentry — Atomic repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript) | Transactions across repositories with Drizzle; basis of our UoW port (we keep `tx` out of use cases) |

## Tool documentation

| Source | Why it's here |
|---|---|
| [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) | Module plugins as isolated contexts; why not to `fastify-plugin` module routes |
| [Fastify — The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | Plugin registration, contexts, options |
| [Fastify — Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | `decorate('container')` only at the root |
| [fastify-type-provider-zod](https://www.npmjs.com/package/fastify-type-provider-zod) | Zod schemas on routes; v4.x pairs with Zod 3 |
| [@fastify/awilix](https://www.npmjs.com/package/@fastify/awilix) | DI plugin considered and not adopted |
| [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions) | `db.transaction(tx => …)`, rollback on throw, savepoints for nesting |
| [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | `forbidden` rules, `from`/`to` path criteria, `dependencyTypesNot`, severity |
| [Validate dependencies according to Clean Architecture](https://medium.com/better-programming/validate-dependencies-according-to-clean-architecture-743077ea084c) | dependency-cruiser used as a clean-architecture gate in practice |
