# Sources — onion-architecture skill

Collected 2026-11-27/28. Legend: **[P]** primary/official · **[A]** recognised author / reference project · **[C]** community.
**Read in full** = page fetched and read while writing the rules; the rest are from search excerpts — re-read before turning them into new rules.

## Architecture (concept)
| Source | Tier | Read in full | Used for |
|---|---|---|---|
| [Palermo — The Onion Architecture, part 1 (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | P | ✓ | rings, "coupling toward the center", DB is external, "not appropriate for small websites" |
| [Palermo — Part 4: After Four Years (2013)](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) | P | ✓ | the 4 tenets, no IoC container needed, simplicity |
| [Robert C. Martin — The Clean Architecture (2012)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | P | ✓ | Dependency Rule; only simple data crosses boundaries; no rows inward |
| [Hexagonal architecture / Ports & Adapters](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) | C | — | ports & adapters vocabulary (Cockburn) |
| [Garrido de Paz — Hexagonal Architecture](https://jmgarridopaz.github.io/content/hexagonalarchitecture) | A | — | ports/adapters detail (co-author of Cockburn's book) |
| [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | A | — | overview of Palermo's series |
| [Allegro Tech — Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) | A | — | modern practice write-up |
| [Oliver Drotbohm — Sliced Onion Architecture](https://odrotbohm.github.io/2023/07/sliced-onion-architecture) | A | — | onion per module/slice (our per-module rings) |
| [NDepend — Onion Architecture layers](https://blog.ndepend.com/onion-architecture-layers/) | C | — | layer naming |

## Pitfalls / over-engineering
| Source | Tier | Read in full | Used for |
|---|---|---|---|
| [Milan Jovanović — Clean Architecture anti-patterns](https://milanjovanovic.tech/blog/clean-architecture-anti-patterns) | A | — | anti-pattern table |
| [The Clean Architecture Trap](https://dev.to/marcolenzo/the-clean-architecture-trap-241k) | C | — | over-layering warning |
| [Anemic domain model](https://en.wikipedia.org/wiki/Anemic_domain_model) | C | — | behaviour on entities |
| [Khalil Stemmler — When CRUD & MVC isn't enough](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/when-crud-mvc-isnt-enough/) | A | — | Node/TS motivation |

## Node.js / TypeScript references
| Source | Tier | Read in full | Used for |
|---|---|---|---|
| [Remo Jansen — Onion architecture in Node.js + TS](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) | A | — | TS onion example (we skip InversifyJS) |
| [domain-driven-hexagon](https://github.com/code-xhyun/domain-driven-hexagon) | A | — | reference layout |
| [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) | C | — | hexagonal on Fastify 5 |

## Fastify
| Source | Tier | Read in full | Used for |
|---|---|---|---|
| [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) | P | ✓ | one plugin per module, `fastify-plugin` only for cross-cutting |
| [Fastify — Plugins Guide](https://unpkg.com/fastify@5.12.8/docs/Guides/Plugins-Guide.md) | P | — | register/decorate semantics |

## Drizzle
| Source | Tier | Read in full | Used for |
|---|---|---|---|
| [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions) | P | ✓ | `tx` everywhere inside callback, savepoints, rollback by throw |
| [Sentry — Atomic repositories in Clean Architecture & TS](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript) | A | ✓ | tx-aware repositories, `tx ?? db`, tx owned above repositories (don't copy `tx?: any`) |
| [Repository pattern ADR — trade-offs](https://spencerjireh.github.io/folionaut/decisions/004-repository-pattern) | C | — | cost of the extra layer |

## Zod / boundaries
| Source | Tier | Read in full | Used for |
|---|---|---|---|
| [Alexis King — Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | A | — | parse once at the edge |
| [Validation at the boundary](https://jagreehal.github.io/jagreehal-typescript-patterns/patterns/validation) | C | — | TS pattern |
| [Boundary defense](https://iwasa-kosui.github.io/kamae-ts/en/boundary-defense.html) | C | — | no re-validation inside the domain |

## Enforcement
| Source | Tier | Read in full | Used for |
|---|---|---|---|
| [dependency-cruiser — rules reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/HEAD/doc/rules-reference.md) | P | — (rules verified by running them) | `forbidden`, `pathNot`, `dependencyTypes` |
| [Validate dependencies per Clean Architecture](https://medium.com/better-programming/validate-dependencies-according-to-clean-architecture-743077ea084c) | C | — | depcruise for layers |
| [fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) | C | — | alternative tool (not used) |
| [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) | C | — | alternative: architecture as tests (not used) |

## Decisions taken with the team (2026-11-28)
- Folder names follow Palermo's rings: `domain-model/`, `domain-services/`, `application-services/`, `infrastructure/` + `routes.ts`.
- Entities have own types in `domain-model/`; enum-like types may be `import type`d from `@devdigest/shared`.
- Enforcement is warnings-only during adoption.
- Scope: `server/` and `reviewer-core/`.
