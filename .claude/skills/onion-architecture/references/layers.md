# Rings, dependency rule, imports

## The tenets (Palermo, Part 4 — verbatim)
1. "The application is built around an independent object model"
2. "Inner layers define interfaces. Outer layers implement interfaces"
3. "Direction of coupling is toward the center"
4. "All application core code can be compiled and run separate from infrastructure"

Uncle Bob's Dependency Rule says the same: "source code dependencies can only point inwards", and data crossing a boundary is a simple structure "in the form that is most convenient for the inner circle" — never a framework row or request object.

## Rings in this repo

| Palermo ring | Here | Contents |
|---|---|---|
| Domain Model | `modules/<m>/domain-model/` | entity types + behaviour (`canCancel(run)`), value objects (`RepoRef.parse`), invariants, domain errors (`AppError` subclasses from `platform/errors.ts`) |
| Domain Services | `modules/<m>/domain-services/` | `ports.ts` — repository and other interfaces the core needs; pure logic spanning several entities (e.g. score from findings) |
| Application Services | `modules/<m>/application-services/` | use cases: `add-repo.ts`, `start-review-run.ts`; orchestrate ports, own the transaction, enforce workspace access |
| Outer ring — Infrastructure | `modules/<m>/infrastructure/`, `src/adapters/**`, `src/db/**` | Drizzle repositories + mappers, job handlers, SDK adapters |
| Outer ring — UI | `modules/<m>/routes.ts` | Fastify plugin: Zod parse, use-case call, DTO mapping, status code |
| Outer ring — Tests | `*.test.ts`, `*.it.test.ts` | fakes for ports, testcontainers for infrastructure |
| (composition root) | `modules/<m>/compose.ts`, `platform/container.ts` | the only code that `new`s concrete repositories/adapters and hands them to use cases |

## Shared kernel
Things every ring may use because they have no dependencies of their own:
- `src/platform/errors.ts` (`AppError`, `NotFoundError`, `ValidationError`, …) — verified: zero imports.
- `import type` of enum-like / port types from `@devdigest/shared` (`Severity`, `GitHubClient`, `LLMProvider`). **Not** its Zod object schemas as entity types — those are API DTOs (decision 2026-11-28: entities own their types; enums may be shared).

## Ports: where they live
- Port to an external system already shared across modules → `@devdigest/shared/adapters.ts` (`GitHubClient`, `GitClient`, `LLMProvider`, `Embedder`, `CodeIndex`, `SecretsProvider`, `AuthProvider`). Don't duplicate.
- Port specific to one module (its repository, `JobQueue`, `RunEvents`, `Clock`) → that module's `domain-services/ports.ts`.
- Name ports after what the core needs, not the tech: `RepoStore`, not `DrizzleRepoRepository`.

## Cross-module calls
A use case in module A needs module B → depend on a port that B's application layer satisfies, wired in `compose.ts`. Never import B's `infrastructure/` or `repository.ts`. Cross-cutting repositories already exposed by the container (`agentsRepo`, `reviewRepo`, `repoIntel`) count as ports — type them by an interface, not the class.

## When to simplify (avoid ceremony)
Palermo: "not appropriate for small websites"; Part 4: "If you are just looking for onion architecture, it has too much going on". Rules:
- A ring folder is created only when it has content. A CRUD module may be `domain-model/` + one `application-services/` file + `infrastructure/` repo + `routes.ts`.
- `domain-services/` may hold only `ports.ts`.
- Don't add a use case that only forwards to a repository *and* has no rule — but the route still must not call Drizzle; a thin use case is the price of the rule.
- Never introduce an IoC library; "Onion architecture works just fine without" one.
