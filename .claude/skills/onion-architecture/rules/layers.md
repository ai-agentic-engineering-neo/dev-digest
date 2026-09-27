---
name: layers
description: The layers, the dependency rule, and how to decide where a new file belongs
metadata:
  tags: onion, layers, dependency-rule, module-structure
---

# Layers and the dependency rule

## The rings

From the centre outward. Each ring may use everything inside it and nothing outside it.

1. **Domain model** — entities, value objects, invariants. Pure data + pure functions.
   No `await` on anything external.
2. **Domain services** — rules that span more than one entity and still need no I/O
   (the grounding gate, score recomputation, prompt assembly).
3. **Application services (use cases)** — orchestration: sequence the domain, call
   ports, decide transaction boundaries, emit events. Knows *what* happens, never *how*
   it is stored or transported.
4. **Ports** — interfaces the inside declares so the outside can be plugged in. They
   belong to the inside, even though only the outside implements them.
5. **Adapters** — the implementations: HTTP in, SQL out, LLM out, git out.
6. **Composition root** — constructs adapters and hands them to use cases.

## Deciding where a file goes

Ask, in order:

| Question | Yes → |
|---|---|
| Would this still be true if we dropped Postgres and Fastify? | domain |
| Does it coordinate several domain calls and ports to fulfil one request? | application service |
| Is it an interface describing something the outside must provide? | port |
| Does it translate between our model and a library/protocol/table? | adapter |
| Does it only decide which concrete class to build? | composition root |

Two or more "yes" answers means the file is doing two jobs. Split it.

## Module shape

A server feature is one folder, and the file names already encode the layer:

```
server/src/modules/<name>/
├── routes.ts        # driving adapter    — transport only
├── service.ts       # application layer  — the use cases
├── repository.ts    # driven adapter     — Drizzle lives here and nowhere else
├── helpers.ts       # pure mappers/DTO conversion (no I/O)
├── constants.ts     # pure constants
└── domain/          # optional: entities + invariants when the module has real rules
```

Registering the module stays one import plus one `app.register` in `src/modules/index.ts`.

## Cross-module rules

- A module may import another module's **service** or **port**, never its
  `repository.ts` or `helpers.ts`.
- Entities shared by several modules (agents, reviews, runs) are resolved from the
  composition root — that is why `container.agentsRepo` and `container.reviewRepo`
  exist. Use those instead of reaching into the owning folder.
- If two modules need the same pure logic, it goes to the domain or to
  `reviewer-core`, not into one of the two modules.

## Naming

- A use case method reads as an action: `runReview`, `addRepo`, `refreshClone`.
  Not `handleX`, not `processX`, not `doX`.
- A port is `<Capability>Port` or the capability itself (`LLMProvider`,
  `ReviewRepositoryPort`). The implementation names its technology:
  `DrizzleReviewRepository`, `OctokitGitHubClient`, `SimpleGitClient`.
- A domain type never carries a technology prefix. `Finding`, not `DbFinding`.

## Smells that mean a layer leaked

- A service imports something from `src/db/`.
- A route contains an `if` about business state (status transitions, eligibility).
- A repository method is named after a use case (`repo.runReview`) instead of a
  data operation (`repo.insertRun`).
- A domain function takes a `FastifyRequest`, a `Db`, or a `Container`.
- You must start Postgres to unit-test a rule.
