# Sources

All links verified (HTTP 200) on 2026-10-18. Each line: what we took from it.

## Onion / Clean / Hexagonal — canonical

- Jeffrey Palermo — The Onion Architecture
  [Part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) ·
  [Part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) ·
  [Part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) ·
  [Part 4 — after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/)
  — all coupling toward the center; inner layers define interfaces; the core
  compiles and runs without infrastructure.
- [Alistair Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
  — ports owned by the app; adapters (HTTP, DB, tests) are interchangeable.
- [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
  — the Dependency Rule; simple data crosses boundaries.
- [Herberto Graça — Explicit Architecture](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
  — one map of onion + hexagonal + clean + CQRS.
- Microsoft Learn —
  [DDD-oriented microservice](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice) ·
  [Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures) ·
  [Infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
  — core holds interfaces, infrastructure references core; repository per aggregate; UoW.
- Martin Fowler —
  [DIP in the Wild](https://martinfowler.com/articles/dipInTheWild.html) (client owns the abstraction) ·
  [Repository](https://martinfowler.com/eaaCatalog/repository.html) ·
  [Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html) ·
  [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)
- [Mark Seemann — Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
  — compose the object graph in one place near the entry point.

## TypeScript / Node

- Khalil Stemmler —
  [Organizing App Logic](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/) ·
  [Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) ·
  [Repository, DTO, Mapper](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) ·
  [Entities](https://khalilstemmler.com/articles/typescript-domain-driven-design/entities/) ·
  [Make illegal states unrepresentable](https://khalilstemmler.com/articles/typescript-domain-driven-design/make-illegal-states-unrepresentable/)
- [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) — full TS reference (ports, adapters, mappers, domain errors).
- [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) — Fastify 5 + clean layering + dependency-cruiser in CI.
- [practicajs/practica](https://github.com/practicajs/practica) — entry-points → domain → data-access starter.
- [jbuget/nodejs-clean-architecture-app](https://github.com/jbuget/nodejs-clean-architecture-app) — swappable in-memory/SQL adapters.
- Node.js Best Practices —
  [Structure by components](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/breakintcomponents.md) ·
  [Layer your components](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/createlayers.md)

## Fastify

- [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) ·
  [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) ·
  [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) ·
  [fastify-plugin](https://github.com/fastify/fastify-plugin) ·
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/)
- [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) ·
  [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)
- [Errors](https://fastify.dev/docs/latest/Reference/Errors/) ·
  [Server (setErrorHandler)](https://fastify.dev/docs/latest/Reference/Server/) ·
  [Testing (inject)](https://fastify.dev/docs/latest/Guides/Testing/)
- Considered and not chosen (we keep our Container):
  [@fastify/awilix](https://github.com/fastify/fastify-awilix) · [Awilix](https://github.com/jeffijoe/awilix)

## Drizzle

- [Transactions](https://orm.drizzle.team/docs/transactions) ·
  [Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration) ·
  [Goodies ($inferSelect)](https://orm.drizzle.team/docs/goodies) ·
  [Vector similarity search](https://orm.drizzle.team/docs/guides/vector-similarity-search)
- [Sentry — Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
  — transactional repositories without leaking the ORM into use cases.

## zod / parsing

- [Alexis King — Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- [Zod v3 docs](https://v3.zod.dev/)

## Testing & enforcement

- [Testcontainers for Node](https://node.testcontainers.org/) ·
  [PostgreSQL module](https://node.testcontainers.org/modules/postgresql/) ·
  [nodejs-integration-tests-best-practices](https://github.com/testjavascript/nodejs-integration-tests-best-practices)
- Martin Fowler —
  [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) ·
  [TestDouble](https://martinfowler.com/bliki/TestDouble.html) ·
  [InMemoryTestDatabase](https://martinfowler.com/bliki/InMemoryTestDatabase.html)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) ·
  [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) ·
  [rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md)
- Alternatives (not used): [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) ·
  [no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) ·
  [import/no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md)
