# Onion Architecture — sources

Why each rule in [SKILL.md](SKILL.md) exists. Read the primary sources when a
rule seems arbitrary; every one of them derives from "imports point inward".

## The pattern

- Jeffrey Palermo, *The Onion Architecture* —
  [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/),
  [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/),
  [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/),
  [part 4 — after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/).
  The origin. "All code can depend on layers more central, but code cannot
  depend on layers further out from the core"; "inner layers define interfaces,
  outer layers implement interfaces". Part 4: the pattern needs neither DDD nor
  an IoC container.
- Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/).
  Ports and adapters: the application is driven and tested through ports, and
  reaches the database only through an adapter that a mock can replace.
- Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).
  The Dependency Rule, and that data crossing a boundary is a simple structure,
  never a database row. Source of "rows stop at the repository".
- Mark Seemann, [Layers, Onions, Ports, Adapters: it's all the same](https://blog.ploeh.dk/2013/12/03/layers-onions-ports-adapters-its-all-the-same/).
  The three names are one idea: the Dependency Inversion Principle applied to
  layers.
- Mark Seemann, [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/).
  Compose the object graph as close to the entry point as possible, and
  reference the container only there. Source of "a service never imports the
  container".
- Herberto Graça, [DDD, Hexagonal, Onion, Clean, CQRS — how I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/).
  Ports are "created to fit the Application Core needs and not simply mimic the
  tools APIs". Source of "a port is shaped by what the service needs".
- Allegro Tech, [Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html).
  Domain, application and infrastructure layers, with boundaries enforced by
  the build rather than by convention.

## Staying pragmatic

- Victor Rentea, [Overengineering in Onion/Hexagonal Architectures](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/).
  "Question any interface with a single implementation"; the Pragmatic Onion.
  Source of the "Do not over-build" section. Here a repository port earns its
  place through the in-memory fake in the service's unit test.
- Eric Normand, [Don't overcomplicate the onion architecture](https://ericnormand.me/dont-overcomplicate-the-onion-architecture/).
  "The domain should not know about the database"; impure reads and writes
  belong in the outer layer, and the core receives values.
- Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/).
  Turn untrusted input into a precise type once, at the boundary. Source of the
  Zod rules.

## Reference implementations in TypeScript

- [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon).
  Ports, repositories, mappers and domain errors, with the caveat that much of
  it is too heavy for small CRUD modules.
- [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate).
  Fastify 5 with clean architecture; "business logic has no Fastify
  dependency"; dependency-cruiser in pre-commit and CI.
- Khalil Stemmler, [DTOs, Mappers & the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/).
  "Repositories are facades to persistence technologies."

## The tools

- Fastify: [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/),
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/),
  [Testing](https://fastify.dev/docs/latest/Guides/Testing/) (build the app in a
  factory, test with `inject`),
  [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/),
  [Plugins Guide](https://fastify.dev/docs/v5.7.x/Guides/Plugins-Guide/).
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) —
  route schemas as the validation boundary.
- Drizzle: [Transactions](https://orm.drizzle.team/docs/transactions),
  [Goodies — Type API](https://orm.drizzle.team/docs/goodies) (`$inferSelect`,
  the type that must not leave the repository).
- Zod: [Defining schemas](https://zod.dev/api).
- dependency-cruiser: [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md),
  [rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md).
  The syntax behind `server/.dependency-cruiser.cjs`.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) —
  the alternative if this repo ever adopts ESLint.
