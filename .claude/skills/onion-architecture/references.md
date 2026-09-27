# References

Sources behind the rules in this skill, and what each one contributes.

## Primary sources

- [Jeffrey Palermo — The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) ·
  [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) ·
  [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/)
  — the original: "all coupling is toward the centre", the domain model coupled only to itself.
- [Alistair Cockburn — Hexagonal Architecture (Ports & Adapters), 2005](https://alistair.cockburn.us/hexagonal-architecture/)
  — where ports and adapters come from; driving vs driven sides.
- [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)
  — the ring model used in `rules/layers.md` (domain model → domain services → application services → outside).
- [Herberto Graça — Ports & Adapters Architecture](https://medium.com/the-software-architecture-chronicles/ports-adapters-architecture-d19f2d476eca)
  — a port as a consumer-agnostic entry/exit point; why the interface belongs to the inside.
- [Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
  — reconciles the three schools; the composition-root argument.
- [Microsoft Learn — Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)
  — "the Application Core has no dependencies on other layers"; abstractions declared inside, implemented outside.
- [Microsoft Learn — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
  — repository as a DDD pattern: abstraction in the domain, implementation as a persistence adapter.

## TypeScript / Node practice

- [Wolk Software — Implementing SOLID and the onion architecture in Node.js with TypeScript](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs)
  — the core must be free of side effects and of persistence/transport detail.
- [Melzar/onion-architecture-boilerplate](https://github.com/Melzar/onion-architecture-boilerplate) — Node + TypeScript layout reference.
- [onicagroup/hexagonal-example](https://github.com/onicagroup/hexagonal-example) — ports & adapters in TypeScript, small enough to read end to end.
- [Hexagonal Architecture and Clean Architecture (with examples)](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi) — controllers as driving adapters, composition root wiring.
- [Eric Damtoft — Onion vs Clean vs Hexagonal](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91) — what actually differs between the three names.

## Persistence and contracts

- [Drizzle ORM best practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
  — do not expose raw schema types beyond the repository; the schema is a data-access detail.
- [Repository pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) — controllers → services → repositories with a typed query builder.
- [You might not need the repository pattern](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b)
  — the counter-argument, deliberately kept: the pattern earns its place when the domain has rules, not when it is CRUD.
- [Zod](https://zod.dev/) · [Runtime validation with Zod](https://www.api-contract-testing.com/schema-design-validation-patterns/runtime-validation-with-zod/)
  — parse at the boundary; one schema as both runtime guard and static type.

## Enforcement tooling

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — the checker used here; already a `server/` dependency.
- [Avoid cross-module dependencies with dependency-cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) — rule-writing patterns.
- [eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries) — the alternative, if ESLint is ever added to this repo.
- [Steve Kinney — Architectural linting](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise) — why the rule has to be machine-checked.

## In-repo context

- `specs/onion-architecture-skill.md` — the plan this skill was built from, including the measured baseline.
- `reviewer-core/AGENTS.md` § Conventions — "Stay pure", the existing statement of the core contract.
- `server/AGENTS.md` § Conventions — schema-first validation, plugin order, module registration.
- `TESTING.md` — the unit/integration split and the `*.it.test.ts` lane rule.
