---
name: ports-and-di
description: Narrow ports instead of the DI container; constructor injection; the composition root
metadata:
  tags: ports, adapters, dependency-injection, container, composition-root
---

# Ports and dependency injection

## A port is defined by the consumer

The inside declares what it needs; the outside satisfies it. A port named after the
library (`OpenAIClient`) has already inverted the wrong way. Name it after the
capability: `LLMProvider`, `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`.

Existing ports live in `server/src/vendor/shared/adapters.ts` with the contract
"ALL external calls go behind these interfaces". Implementations live in
`server/src/adapters/*`, mocks in `server/src/adapters/mocks.ts`.

## Inject ports, not the container

Passing `Container` into a service is the service-locator anti-pattern: the dependency
list disappears from the signature, the service can reach anything at any time, and a
test must build a whole container to substitute one collaborator.

```ts
// BAD — what does this service actually use? Unknowable without reading the body.
export class ReviewService {
  constructor(private container: Container) {}
}
```

```ts
// GOOD — the constructor is the dependency list, and each one is substitutable
export class ReviewService {
  constructor(
    private readonly reviews: ReviewRepositoryPort,
    private readonly agents: AgentsRepositoryPort,
    private readonly llm: LLMProvider,
    private readonly bus: RunEventBus,
  ) {}
}
```

Rule of thumb: more than five constructor parameters means the use case is doing more
than one thing. Split the service, do not reintroduce the container.

## The composition root is the only place with `new`

`server/src/platform/container.ts` constructs concrete classes, resolves secrets, and
caches instances. That is its whole job. Consequences:

- A service never calls `new DrizzleReviewRepository(...)` — today several do, which is
  why `container.reviewRepo` and `container.agentsRepo` exist; prefer those.
- A route resolves the service from the container (or from a factory) and injects
  nothing itself.
- Tests build a container with `ContainerOverrides`, or — better for a unit test —
  construct the service directly with mock ports and skip the container entirely.

## Adding a new external capability

Six steps, in this order:

1. Write the interface in `vendor/shared/adapters.ts` (both copies of `@devdigest/shared`
   when the contract is shared with the client).
2. Add a mock to `src/adapters/mocks.ts`.
3. Write the use case against the interface, with tests using the mock.
4. Implement the real adapter in `src/adapters/<capability>/<technology>.ts`.
5. Wire it in `Container` as a lazy getter with an `overrides` escape hatch.
6. Only then touch a route.

Doing step 4 first is how an SDK type ends up in a service signature.

## Adapters do not know about modules

`src/adapters/**` must not import `src/modules/**`. An adapter that needs a domain type
takes it from the domain or from the shared contracts; if it needs a use case, the
dependency is pointing the wrong way — invert it with a callback or an event.

## No global state

No module-level singleton holding a DB handle, no ambient `process.env` read outside
`platform/config.ts`, no import-time side effects. Everything a unit needs arrives
through its constructor, so the same unit can run twice in one process with different
dependencies.
