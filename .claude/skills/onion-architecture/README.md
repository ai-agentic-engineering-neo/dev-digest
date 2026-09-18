# Sources — `onion-architecture`

Collected in a research pass on **2026-09-18**. Tiers:

- **T1 — primary**: the tool's or the idea's own documentation/author.
- **T2 — established secondary**: named practitioners writing about their own systems; widely cited.
- **T3 — practitioner post**: useful, single-author, unverified.

Entries marked *(read in full)* were fetched and read; the rest were reviewed
through search summaries and are cited for orientation, not for load-bearing
claims. Everything the skill asserts about **this repo** comes from reading
`server/src` directly, not from any source below.

## The architecture itself

| Source | Tier | What it contributes |
|---|---|---|
| [Jeffrey Palermo — *The Onion Architecture: part 1*](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) (2008) *(read in full)* | T1 | The origin. "All coupling is toward the center"; "the database is not the center, it is external"; repository *interfaces* belong to the core, implementations to the edge. The skill's one principle is this sentence. |
| [Herberto Graça — *DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together*](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) (2017) | T2 | The reconciliation: P&A, Onion and Clean share one rule and differ in ring names. Basis for the skill saying "these are the same rule with different vocabularies". |
| [Herberto Graça — *Onion Architecture*](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) | T2 | Onion as DDD layers folded into Ports & Adapters. |
| [Allegro Tech — *Onion Architecture*](https://blog.allegro.tech/2023/02/onion-architecture.html) (2023) | T2 | Engineering-org write-up; the "inner layers define interfaces, outer layers implement them" phrasing. |
| [Eric Damtoft — *Onion vs Clean vs Hexagonal Architecture*](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91) | T3 | Short comparison; used for the "where the ecosystem disagrees" section. |

## TypeScript / Node practice

| Source | Tier | What it contributes |
|---|---|---|
| [Khalil Stemmler — *Implementing DTOs, Mappers & the Repository Pattern*](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) | T2 | Row → DTO mapping as an explicit step, and repository methods named for domain operations. Behind rules 5 and 6. |
| [Sentry — *Atomic Repositories in Clean Architecture and TypeScript*](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) | T2 | Translating database errors into domain errors at the repository boundary; leaking query builders or driver error types defeats the abstraction. Behind rule 7. |
| [André Bazaglia — *Clean architecture with TypeScript: DDD, Onion*](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/) | T3 | A concrete TS ring layout; useful as a contrast to this repo's vertical slices. |
| [Remo Jansen — *Enforce Clean Architecture in TypeScript with fresh-onion*](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) | T3 | States the core problem this skill's tooling solves: TypeScript has no native mechanism to stop a forbidden cross-layer import. |
| [Jay Freestone — *You might not need the repository pattern*](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b) | T3 | The counter-argument, deliberately included: over a typed query builder the pattern can degenerate into a leaky wrapper. Cited in "where the ecosystem disagrees" so the skill does not argue only one side. |
| [Paul Șerban — *Drizzle ORM Best Practices*](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) | T3 | Drizzle as a typed query builder rather than an entity mapper — why the repository boundary has to be deliberate here. |

## Functional core

| Source | Tier | What it contributes |
|---|---|---|
| [*Functional Core, Imperative Shell*](https://functional-architecture.org/functional_core_imperative_shell/) | T2 | The shape this codebase actually has: pure functions over values (`helpers.ts`) wrapped by an effectful shell (services, adapters). |
| [Kenneth Lange — *The Functional Core, Imperative Shell Pattern*](https://kennethlange.com/functional-core-imperative-shell/) | T3 | The testing split the skill uses: deterministic unit tests for the core, integration tests for the shell. |
| [*Functional Core with Ports and Adapters*](https://dev.to/siy/functional-core-with-ports-and-adapters-3m0g) | T3 | Ports at the boundary with pure functions rather than rich entities inside — the reason the skill tells you not to introduce entity classes here. |

## Tooling

| Source | Tier | What it contributes |
|---|---|---|
| [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) *(read in full)* | T1 | `forbidden` rule semantics, `path`/`pathNot` as regexes, group capture reused as `$1` in `to`, `dependencyTypes` including `type-only`, and the `via` family for circular rules. The config's `no-cross-module-import` and `no-circular` rules come from here. |
| [Fastify — Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) | T1 | `decorate` + encapsulation as Fastify's own DI mechanism — why `app.decorate('container', …)` is the single injection seam and a second one is not wanted. |
| [Fastify — The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | T1 | Plugin scoping and the DAG model behind module registration. |
| [Snyk — *Fastify plugins as building blocks for a backend Node.js API*](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/) | T2 | Plugins as cohesive blocks; background for keeping route registration static and explicit. |
| [Atomic Object — *Dependency Cruiser: Restrict Imports in JavaScript*](https://spin.atomicobject.com/dependency-cruiser-imports/) | T3 | Practical framing of dependency-cruiser as a structural linter that exits non-zero. |
| [lastminute.com — *How We Enforce Architecture Boundaries at Scale*](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/) | T2 | An org-scale account of running boundary rules as a gate, and of allowlisting existing debt rather than blocking on it. Behind the "known debt" approach. |
| [*Avoid Cross Module Dependencies with Dependency Cruiser*](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) | T3 | The cross-module rule shape adapted for `modules/<name>/`. |

## Verified against this repo, not against a source

These claims were established by reading and running code at commit `e885435`,
and are the ones to re-check if the codebase moves:

- The ring table, and which files sit in each ring.
- The known-debt inventory (8 files querying the DB outside a repository, one cycle, one cross-module import, two ports declared inside `adapters/`).
- That `pnpm arch` is green on that tree, and that each rule family fires against a deliberately injected violation.
- Two dependency-cruiser gotchas found the hard way: excluding `node_modules` from the graph silently disables every npm-package rule, and `viaNot` ("no module in the cycle matches") is not interchangeable with `via: { pathNot: … }` ("some module does not match").
