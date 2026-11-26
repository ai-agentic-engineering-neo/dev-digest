# Sources — onion-architecture

Research date: 2026-11-25. Every rule in [SKILL.md](SKILL.md) is backed by at least one source
below. **Primary** = the original author or official docs. **Community** = secondary write-ups
and sample repos (useful for nuance, weaker as authority). Most Node/Drizzle-specific guidance
is community practice: no official "onion for Fastify/Drizzle" document exists.

## 1. Onion and related architectures (primary)

| Source | Used for |
|---|---|
| [Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | Origin. Inner layers define interfaces, outer layers implement them; coupling points to the center; infrastructure is externalized (§1, §5) |
| [Jeffrey Palermo: The Onion Architecture, part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) | Worked example of layers and where repositories and their interfaces live (§2, §8) |
| [Jeffrey Palermo: Onion Architecture, part 4: After Four Years](https://jeffreypalermo.com/tag/onion-architecture) | Don't over-apply; layering is about dependency direction, not ceremony (§1.4, §3 lite layout) |
| [Robert C. Martin: The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | The Dependency Rule: "source code dependencies can only point inwards" (§1.1, §2) |
| [Hexagonal architecture (Ports & Adapters), Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) | Cockburn's ports and adapters, 2005; ports owned by the core (§5) |
| [arc42 Quality: Hexagonal architecture](https://quality.arc42.org/approaches/hexagonal-architecture) | The core owns driving and driven ports (§5) |

## 2. Onion overviews and practice (community)

| Source | Used for |
|---|---|
| [Herberto Graça: Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | Layer contents (domain model, domain services, application services) and how onion relates to hexagonal/clean (§2) |
| [Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) | A pragmatic production take; testing the core without infrastructure (§1.3, §12) |
| [NDepend: Onion Architecture layers](https://blog.ndepend.com/onion-architecture-layers/) | Layer responsibilities; enforcing direction with tooling (§2, §13) |
| [Bitloops: Onion Architecture](https://bitloops.com/resources/software-architecture/onion-architecture) | Onion vs clean: same rule, more specific placement guidance; learning-curve trade-off (§1) |
| [Software Architecture Chronicles: Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) | Summary of Palermo's tenets (§1) |

## 3. Node.js / TypeScript (community)

| Source | Used for |
|---|---|
| [Remo Jansen: Onion Architecture in Node.js with TypeScript](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) | Onion + SOLID in TS; constructor injection of interfaces (§10). We use a plain composition root instead of InversifyJS |
| [Remo Jansen: Enforce Clean Architecture with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) | TS has no native layer boundaries, so they need tooling (§13) |
| [Khalil Stemmler: Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) | Use cases, repositories and mappers in Node/TS (§4, §8) |
| [Domain-Driven Hexagon](https://github.com/thecooldrop/domain-driven-hexagon) | Reference repo: ports, adapters, mappers at the repository boundary (§5, §7, §8) |

## 4. Fastify

| Source | Used for |
|---|---|
| [Fastify docs: Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) (primary) | Child contexts can't leak upward; `fastify-plugin` only breaks encapsulation for the plugin it wraps (§6) |
| [Fastify docs: Plugins reference](https://github.com/fastify/fastify/blob/main/docs/Reference/Plugins.md) (primary) | Decorators are scoped to the plugin unless wrapped with `fastify-plugin` (§6) |
| [Fastify docs: Plugins Guide](https://fastify.dev/docs/v5.2.x/Guides/Plugins-Guide) (primary) | "Everything is a plugin"; DB connection set up in a registered plugin (§6, §10) |
| [marcoturi/fastify-boilerplate](https://raw.githubusercontent.com/marcoturi/fastify-boilerplate/main/README.md) (community) | Fastify 5 + hexagonal: handlers depend on repository ports; SQL only in repositories; dependency-cruiser in CI (§6, §8, §13) |
| [mcollina fastify-best-practices: decorators](https://tessl.io/registry/mcollina/fastify-best-practices/files/rules/decorators.md) (community) | `fp()` for infrastructure decorators visible to siblings and parents (§6) |

## 5. Drizzle, repositories, transactions

| Source | Used for |
|---|---|
| [Drizzle docs: Transactions](https://orm.drizzle.team/docs/transactions) (primary) | `db.transaction(async (tx) => …)`, nested savepoints (§8 UnitOfWork) |
| [Sentry: Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript) (community) | Take transaction management out of repositories; the use case owns atomicity (§8, examples §5) |
| [Transactions with DDD and Repository Pattern in TypeScript, part 2](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901) (community) | ORM-specific repositories; Drizzle tx scope passed to repositories (§8) |
| [Repository pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) (community) | Repository classes over Drizzle that accept a transaction handle (examples §5) |
| [Database architecture patterns: from domain models to repositories](https://dev.to/shreyas1009/database-architecture-patterns-from-domain-models-to-production-ready-repositories-o6k) (community) | Map DB rows to domain/contract types inside the repository; don't export row models (§7, §8) |

## 6. Zod and boundaries

| Source | Used for |
|---|---|
| [Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (primary; the Zod README links it) | Parse untrusted data once into precise types (§1.6, §7) |
| [Runtime validation in TypeScript: where Zod ends](https://dev.to/gabrielanhaia/runtime-validation-in-typescript-where-zod-ends-and-the-type-system-begins-4e9e) (community) | Which inputs are boundaries (HTTP, env, files, third-party APIs); re-parsing inside signals a misplaced boundary (§7) |
| [Validation at the Boundary](https://jagreehal.github.io/jagreehal-typescript-patterns/patterns/validation) (community) | Boundary parsing; inner functions take already-valid types (§7) |
| [Boundary Defense guide](https://iwasa-kosui.github.io/kamae-ts/en/boundary-defense.html) (community) | Types are erased at runtime and `as` casts bypass checks, so parse at the edge (§7) |

## 7. Enforcement

| Source | Used for |
|---|---|
| [dependency-cruiser: rules reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/HEAD/doc/rules-reference.md) (primary) | `forbidden` rules, `path`/`pathNot`, group matching (`$1`), `dependencyTypesNot`, `circular` (templates/) |
| [Validate dependencies according to Clean Architecture](https://medium.com/better-programming/validate-dependencies-according-to-clean-architecture-743077ea084c) (community) | Layer rules expressed as dependency-cruiser config (§13) |
| [Atomic Object: Restrict imports with dependency-cruiser](https://spin.atomicobject.com/dependency-cruiser-imports/) (community) | Practical forbidden-import rules and CI validation (§13) |

## 8. DevDigest sources (project)

| Source | Used for |
|---|---|
| `server/AGENTS.md` | Module layout, Zod type provider convention, static module registry, `*.it.test.ts` rule |
| Root `AGENTS.md` | Two copies of the Zod contracts; reviewer-core consumed as source |
| `server/src/platform/container.ts` | Composition root, `ContainerOverrides` for tests |
| `server/src/modules/pulls/status.ts` | Existing example of a pure domain file |
| `reviewer-core/package.json` description | The engine is pure; its only side effect is an injected `LLMProvider` |
| Ad-hoc run of `templates/dependency-cruiser.example.cjs` (2026-11-25) | The legacy-violation list in §14 |
