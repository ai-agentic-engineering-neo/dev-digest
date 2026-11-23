# Onion fundamentals

Contents: [The idea](#the-idea) · [The rings](#the-rings) · [Ports and adapters](#ports-and-adapters) · [Onion vs Hexagonal vs Clean vs DDD](#onion-vs-hexagonal-vs-clean-vs-ddd) · [Vertical slices](#vertical-slices-rings-inside-each-module) · [When it is overkill](#when-it-is-overkill) · [Common failure modes](#common-failure-modes)

## The idea

Palermo's four tenets (restated in part 4, 2013): [O1][O1c]
1. The application is built around an **independent object model** (the domain).
2. **Inner layers define interfaces**; outer layers implement them.
3. **Coupling points toward the center.**
4. The core can run **without the infrastructure** (database, UI, services).

Everything else is a consequence. The database, the web framework and every SDK are *details* on the outside; the policy (what the product does) is on the inside and doesn't know the details exist. [O1][K1][C1]

## The rings

| Ring | Contains | May import | DevDigest examples |
|---|---|---|---|
| **Domain** | Entities/value rules, pure functions, domain errors, **ports** (interfaces the core needs) | Only itself and types | `pulls/status.ts` (`deriveReviewStatus`), `pulls/cost.ts`, `reviews/findings.ts`, `@devdigest/shared` port interfaces (`LLMProvider`, `GitHubClient`…), `@devdigest/reviewer-core` |
| **Application** | Use cases: orchestrate domain + ports, own transactions | Domain | `agents/service.ts`, `reviews/service.ts`, `reviews/run-executor.ts`, `repo-intel/service.ts` |
| **Infrastructure** | Implementations of ports: DB, SDKs, filesystem, queue | Domain + Application (to implement their interfaces) | `*/repository.ts`, `adapters/*`, `db/*`, `platform/jobs.ts` |
| **Presentation** | Transport: HTTP routes, zod at the edge, SSE, error mapping | Application (+ Domain types) | `*/routes.ts`, `_shared/context.ts`, `app.ts` |
| **Composition root** | Builds the object graph | Everything | `platform/container.ts`, `modules/index.ts` |

Graça's reading: any outer layer may call any inner layer (not only the next one), but never the reverse. Onion = Ports & Adapters + the internal DDD layers. [O2]

Infrastructure and Presentation are both "outside" and **do not import each other**: a route must not reach for Drizzle, and a repository must not know about HTTP.

## Ports and adapters

- A **port** is an interface owned by the core, shaped by what the core needs (`GitHubClient.listPullRequests`), not by the vendor's API surface. [H2][H1]
- An **adapter** implements a port with a concrete tool (`OctokitGitHubClient`). *Driving* adapters call the core (a Fastify route calls a service); *driven* adapters are called by the core through a port (the service calls `GitHubClient`). [H1][H2]
- Wiring happens once, in the composition root, so tests can substitute fakes. In DevDigest that is `Container` + `ContainerOverrides` (see `adapters-and-ports.md`). [O1b]

## Onion vs Hexagonal vs Clean vs DDD

Same dependency rule, different vocabulary: [W1][O2][C1]
- **Hexagonal (Cockburn, 2005):** inside/outside; ports and adapters. [H1]
- **Onion (Palermo, 2008):** concentric layers, repository interfaces in the core; adds explicit inner layers (domain model, domain services, application services). [O1]
- **Clean (Martin, 2012):** entities → use cases → interface adapters → frameworks; the Dependency Rule; data crossing boundaries should be simple structures, not DB rows. [C1]
- **DDD** supplies *what goes in the domain ring* (entities, value objects, aggregates, domain services). It is not required to use the rings.

This skill uses Onion's rings and Hexagonal's port/adapter wording. Don't spend review time on which name is "right".

## Vertical slices: rings inside each module

DevDigest keeps `modules/<name>/` as a **vertical slice** (one Fastify plugin per feature), so each module holds its own share of every ring:

```
modules/reviews/
├── routes.ts        presentation
├── service.ts       application
├── run-executor.ts  application (long-running use case)
├── repository.ts    infrastructure (+ repository/{pull,review,run}.repo.ts)
├── helpers.ts       domain (pure mapping/rules)
└── constants.ts     domain constants
```
Shared inner pieces (ports, contracts, errors) live outside modules: `@devdigest/shared` (`src/vendor/shared`), `platform/errors.ts`. Shared outer pieces (adapters, db) live in `adapters/`, `db/`, `platform/`. Add a `domain/` subfolder inside a module only when the pure rules outgrow `helpers.ts`. [O2][B2]

## When it is overkill

- A route that reads one table and returns it: `routes → service → repository` is enough; a `domain/` folder with nothing in it is noise. [G1]
- A repository interface with a single implementation and no test double adds indirection with no benefit. Add it when you need the fake. [G1][K1]
- Mappers between row and domain types only pay off when the shapes differ or the row type would leak a column the core shouldn't see. [G1][C1]

The rings are a tool for *keeping change local and logic testable*. If a rule doesn't buy either in a given spot, don't pay for it there — but never break the **direction** of dependencies, which is free.

## Common failure modes

- **Leaky repository:** returns Drizzle rows everywhere; every caller now depends on the table shape. [O4]
- **Fat route:** parsing + queries + GitHub sync + rules in one handler (`pulls/routes.ts` today). Impossible to unit test without Fastify and Postgres.
- **Service locator:** a service takes the whole `Container` and pulls whatever it wants; the application ring now transitively depends on every adapter. Prefer receiving the specific ports/repositories it uses. [O1b]
- **Port shaped like the SDK:** the interface mirrors Octokit's return types, so swapping vendors changes the core. [H2]
- **Anemic everything:** all logic in services because "services are where logic goes", leaving the domain ring empty and untestable in isolation. Put pure rules in pure functions. [O1]
- **Exceptions with transport baked in:** domain code throwing `statusCode`-bearing errors couples the core to HTTP. Map in one place. [O4]
