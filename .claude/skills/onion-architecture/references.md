# References — sources and rationale

Retrieved 2026-09-19. "Read" = page content fetched and read; "Snippet" = seen only in search results, skim before quoting.

## Architecture fundamentals

| Source | Why it matters here | Status |
|---|---|---|
| Jeffrey Palermo, [The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) (also [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/), parts 3–4 on the same blog) | Origin. "All code can depend on layers more central, but code cannot depend on layers further out." "The database is not the center. It is external." Only interfaces live in the core; implementations at the edge; needs DI. | Read (part 1) |
| Herberto Graça, [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | Ring definitions (Domain Model → Domain Services → Application Services → outer), and how Onion adds DDD-flavoured layering to Hexagonal. | Read |
| Herberto Graça, [DDD, Hexagonal, Onion, Clean, CQRS … How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | Reconciles the family of architectures; ports/adapters, components, "explicit architecture". | Snippet |
| Alistair Cockburn, [Hexagonal (Ports & Adapters) Architecture](https://alistair.cockburn.us/hexagonal-architecture/) | Ports/adapters: app driven equally by users, tests, batch; developed and tested in isolation from DBs/devices. | Snippet |
| Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | The Dependency Rule stated precisely: names declared in an outer circle must not be mentioned by inner code. | Snippet |
| Oliver Drotbohm, [Sliced Onion Architecture](http://odrotbohm.github.io/2023/07/sliced-onion-architecture/) | Slicing rings *by feature module* — matches our `modules/*` layout and the `no-cross-module` rule. | Snippet |
| Microsoft, [Anti-Corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) | Adapter + translator + facade around third-party SDKs so vendor types don't corrupt the domain. | Snippet |

## TypeScript / Node

| Source | Why | Status |
|---|---|---|
| Javi, [Domain Driven Design and the Onion Architecture](https://blog.itsjavi.com/target-software-architectures-the-onion-architecture) | Domain layer free of persistence/transport details; enforce imports with lint rules. | Snippet |
| André Bazaglia, [Clean architecture with TypeScript: DDD, Onion](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/) | TS-specific layering example. | Snippet |
| Wolk Software, [Implementing SOLID and the onion architecture in Node.js with TypeScript and InversifyJS](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs) | Injecting repository implementations into use cases. We use manual DI (Container), not Inversify. | Snippet |
| Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | Validate/parse once at the boundary → Zod route schemas. | Snippet |

## Tool-specific

| Source | Why | Status |
|---|---|---|
| Fastify, [Plugins guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) · [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | Encapsulation, `fastify-plugin`, decorators as transport-level DI — and why not to route domain services through them. | Read |
| Sentry, [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) | Repository interface in the application layer, returns domain entities, optional `tx` threaded through the call chain (Drizzle). | Read |
| Khalil Stemmler, [DTOs, Mappers & the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) | Three transformations (domain↔DTO, domain↔persistence); mapping outside controllers/repos; domain-specific repo methods. | Read |
| Drizzle ORM, [Transactions](https://orm.drizzle.team/docs/transactions) | `db.transaction`, savepoints via `tx.transaction`, `tx.rollback()`. | Read |
| dependency-cruiser, [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) · [CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md) | `forbidden` rules, `from/to/path/pathNot`, known-violations baseline. NB: the CLI doc on `main` describes `--baseline`; installed 17.4.x uses `--output-type baseline`. | Read |
| [JS Boundaries / eslint-plugin-boundaries](https://www.jsboundaries.dev/docs/overview/) | Alternative enforcement (editor-time feedback); not chosen because the repo has no ESLint. | Snippet |

## Local sources of truth

`server/CLAUDE.md` · `server/README.md` (request/DI diagram) · `server/INSIGHTS.md` · `server/src/platform/container.ts` · `server/src/vendor/shared/adapters.ts` · `server/src/modules/repo-intel/CLAUDE.md` · `reviewer-core/CLAUDE.md` · `TESTING.md`.
