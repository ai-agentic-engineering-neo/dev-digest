# onion-architecture — sources

Local skill (not vendored, not in `skills-lock.json`). Rules in [SKILL.md](SKILL.md) cite
these sources by short name.

## Onion and related architectures
- **Palermo, part 1** — Jeffrey Palermo, *The Onion Architecture: part 1* (2008): https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- **Palermo, part 4** — Jeffrey Palermo, *Onion Architecture: Part 4 – After Four Years* (2013): https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/
- **Graça — Onion** — Herberto Graça, *Onion Architecture* (Software Architecture Chronicles): https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85
- **Graça — Explicit Architecture** — *DDD, Hexagonal, Onion, Clean, CQRS, … How I put it all together*: https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/
- **Drotbohm — Sliced Onion** — Oliver Drotbohm, *Sliced Onion Architecture* (2023): https://odrotbohm.github.io/2023/07/sliced-onion-architecture
- **Cockburn** — Alistair Cockburn, *Hexagonal Architecture (Ports & Adapters)*: https://alistair.cockburn.us/hexagonal-architecture/
- **Martin** — Robert C. Martin, *The Clean Architecture* (Dependency Rule): https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- **Domain-Driven Hexagon** — Sairyss, TypeScript reference implementation: https://github.com/Sairyss/domain-driven-hexagon

## Dependency injection and the composition root
- **Seemann** — Mark Seemann, *Composition Root*: https://blog.ploeh.dk/2011/07/28/CompositionRoot/
- Mark Seemann, *Composition Root location*: https://blog.ploeh.dk/2019/06/17/composition-root-location/
- InfoQ interview with Mark Seemann on DI (container must not leak; Service Locator): https://www.infoq.com/articles/di-mark-seemann

## Fastify
- **Fastify — Encapsulation**: https://fastify.dev/docs/latest/Reference/Encapsulation/
- Fastify — Plugins Guide: https://fastify.dev/docs/latest/Guides/Plugins-Guide/
- **Fastify — Testing** (`inject`): https://fastify.dev/docs/latest/Guides/Testing/
- `@fastify/awilix` (container-based DI alternative): https://www.npmjs.com/package/@fastify/awilix
- marcoturi/fastify-boilerplate — Fastify 5 + hexagonal/onion + dependency-cruiser: https://github.com/marcoturi/fastify-boilerplate
- Snyk — Fastify plugins as lightweight DI: https://snyk.io/blog/fastify-plugins-for-backend-node-js-api

## Drizzle and the repository pattern
- **Drizzle — Transactions**: https://orm.drizzle.team/docs/transactions
- Folionaut ADR 004 — Repository pattern over Drizzle: https://spencerjireh.github.io/folionaut/decisions/004-repository-pattern
- **Stemmler** — Khalil Stemmler, *Implementing DTOs, Mappers & the Repository Pattern* (TypeScript DDD): https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper
- LogRocket — Exploring the repository pattern with TypeScript and Node: https://blog.logrocket.com/exploring-repository-pattern-typescript-node

## Zod and trust boundaries
- **King** — Alexis King, *Parse, don't validate*: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- *Parse, don't validate* in TypeScript: https://cekrem.github.io/posts/parse-dont-validate-typescript
- Validation at the Boundary (TypeScript patterns): https://jagreehal.github.io/jagreehal-typescript-patterns/patterns/validation

## Enforcement (optional, not wired in CI)
- dependency-cruiser rules reference (`forbidden` rules): https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- lastminute.com — Enforcing architecture boundaries at scale: https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/
- fresh-onion — onion rules for TypeScript imports: https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi

Sketch of the dependency-cruiser rules if the team decides to enforce (inner rings must not
import outer ones):
```js
// server/.dependency-cruiser.cjs (not committed)
forbidden: [
  { name: 'core-no-persistence', severity: 'error',
    from: { path: '^src/modules/[^/]+/(service|helpers|constants|types)\\.ts$' },
    to:   { path: '(^src/db/|node_modules/drizzle-orm)' } },
  { name: 'routes-no-db', severity: 'error',
    from: { path: '^src/modules/[^/]+/routes\\.ts$' },
    to:   { path: '(^src/db/|node_modules/drizzle-orm)' } },
  { name: 'no-cross-module-internals', severity: 'error',
    from: { path: '^src/modules/([^/]+)/' },
    to:   { path: '^src/modules/([^/]+)/(?!index\\.ts$)', pathNot: '^src/modules/($1|_shared)/' } },
]
```
