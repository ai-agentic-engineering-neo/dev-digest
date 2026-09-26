# Sources

Every URL below was fetched and verified on 2026-09-25.

## Onion, clean, hexagonal

- Jeffrey Palermo, "The Onion Architecture: part 1" (2008) — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- Jeffrey Palermo, "The Onion Architecture: part 2" (2008) — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
- Jeffrey Palermo, "The Onion Architecture: part 3" (2008) — https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
- Jeffrey Palermo, "Onion Architecture: Part 4 – After Four Years" (2013) — https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/
- Robert C. Martin, "The Clean Architecture" (2012) — https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Alistair Cockburn, "Hexagonal Architecture" (2005) — https://alistair.cockburn.us/hexagonal-architecture/
- Herberto Graça, "DDD, Hexagonal, Onion, Clean, CQRS, … How I put it all together" (2017) — https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/
- Khalil Stemmler, "Clean Node.js Architecture" (2019) — https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/

## DDD, repositories, layering

- Eric Evans, "Domain-Driven Design Reference" (2015, CC-BY 4.0) — https://www.domainlanguage.com/ddd/reference/ (PDF: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
- Vaughn Vernon, interview on *Implementing Domain-Driven Design* (InformIT, 2013) — https://www.informit.com/articles/article.aspx?p=2023702
- Vaughn Vernon, *Implementing Domain-Driven Design* (Addison-Wesley, 2013), ISBN 9780321834577, ch. 14 "Application"
- Martin Fowler, "Repository" (PoEAA catalog) — https://martinfowler.com/eaaCatalog/repository.html
- Martin Fowler, "Presentation Domain Data Layering" (2015) — https://martinfowler.com/bliki/PresentationDomainDataLayering.html

## Dependency injection

- Mark Seemann, "Composition Root" (2011) — https://blog.ploeh.dk/2011/07/28/CompositionRoot/
- Mark Seemann, "Pure DI" (2014) — https://blog.ploeh.dk/2014/06/10/pure-di/
- Mark Seemann, "Service Locator is an Anti-Pattern" (2010) — https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/

## Fastify

- "The hitchhiker's guide to plugins" — https://fastify.dev/docs/latest/Guides/Plugins-Guide/
- "Encapsulation" — https://fastify.dev/docs/latest/Reference/Encapsulation/
- "Decorators" — https://fastify.dev/docs/latest/Reference/Decorators/
- "Getting Started" (load order) — https://fastify.dev/docs/latest/Guides/Getting-Started/
- "Testing" (`build()` vs listen, `inject`) — https://fastify.dev/docs/latest/Guides/Testing/
- fastify-type-provider-zod — https://github.com/turkerdev/fastify-type-provider-zod
- Matteo Collina, "Building a modular monolith with Fastify" (Node Congress 2023) — https://gitnation.com/contents/building-a-modular-monolith-with-fastify

## Drizzle

- Transactions — https://orm.drizzle.team/docs/transactions
- Goodies (`$inferSelect`, `$inferInsert`, `drizzle.mock()`) — https://orm.drizzle.team/docs/goodies
- drizzle-zod — https://orm.drizzle.team/docs/zod
- Schema declaration (split by domain) — https://orm.drizzle.team/docs/sql-schema-declaration

## Enforcement tooling

- dependency-cruiser rules reference — https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- dependency-cruiser rules tutorial — https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md
- ESLint `no-restricted-imports` — https://eslint.org/docs/latest/rules/no-restricted-imports
- eslint-plugin-boundaries (considered, not adopted: the cruiser was already a dependency) — https://github.com/javierbrea/eslint-plugin-boundaries

## In this repository

- `server/docs/architecture.md`: boot, container, module trio, jobs, SSE.
- `server/specs/review-flow.md`: invariants of a review run.
- Vendored skills `fastify-best-practices`, `drizzle-orm-patterns`, `zod` in `.claude/skills/`: framework detail this skill does not repeat.
