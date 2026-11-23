---
name: onion-architecture
description: "Onion Architecture for the DevDigest backend (Fastify + zod + Drizzle + adapters): which layer code belongs in and which way imports may point. Use whenever the user adds or changes a server module/feature; asks where logic, a query, a validation, an SDK call or a constant should go on the backend; writes or reviews a route, service, repository or adapter; sees Drizzle/`db/schema`/Fastify/Octokit/OpenAI imports outside their layer; adds an external integration; or asks to review server code for layering, coupling or testability. Trigger even if the user never says 'onion' or 'architecture' (e.g. 'where do I put this query', 'can the service call drizzle', 'add a Slack notifier', 'this route is getting fat'). Layering and dependency direction only — Fastify API details, Drizzle API, SQL schema design, zod API and security have their own skills."
metadata:
  version: 1.0.0
---

# Onion Architecture (`server/`)

Answers: **"which ring does this code belong in, and what may it import?"**
Version 1.0.0 · sources and changelog: [README.md](README.md) · IDs like `[O1]` resolve there.

## Scope — and what to use instead

| Question | Use |
|---|---|
| Which layer / who may import whom / how to test each layer | **this skill** |
| Fastify plugins, hooks, schemas, serialization, perf | `fastify-best-practices` |
| Drizzle query/relations/migrations API | `drizzle-orm-patterns` |
| Table/index/constraint design | `postgresql-table-design` |
| zod API details | `zod` |
| AuthN/Z, injection, secrets | `security` |
| Client-side structure | `frontend-ui-architecture` |

## The one rule

**Source-code dependencies point inward.** Inner rings know nothing about outer rings; the application core runs without the database, the web framework or any SDK. [O1][O2][C1]

```
        ┌───────────────────────────────────────────────┐
        │ Presentation   routes.ts · _shared/ · app.ts   │  Fastify, zod, HTTP codes, SSE
        │ ┌───────────────────────────────────────────┐ │
        │ │ Infrastructure  repository.ts · adapters/ │ │  Drizzle, Octokit, LLM SDKs, git, queue
        │ │ ┌───────────────────────────────────────┐ │ │
        │ │ │ Application   service.ts · executors  │ │ │  use cases, transactions, orchestration
        │ │ │ ┌───────────────────────────────────┐ │ │ │
        │ │ │ │ Domain  helpers.ts · domain/ ·    │ │ │ │  pure rules, types, ports (interfaces),
        │ │ │ │ ports (vendor/shared/adapters.ts) │ │ │ │  domain errors
        │ │ │ └───────────────────────────────────┘ │ │ │
        │ │ └───────────────────────────────────────┘ │ │
        │ └───────────────────────────────────────────┘ │
        └───────────────────────────────────────────────┘
   Composition root (platform/container.ts, modules/index.ts) may import every ring — it wires them.
```
Presentation and Infrastructure sit side by side on the outside: both depend inward, neither depends on the other. Each module is a **vertical slice** (`modules/<name>/`) containing its own share of every ring. [H2][O2]

## Why it matters here

Every external system (LLM, GitHub, git, disk, Postgres) is slow, flaky or paid, and the product must boot with no API keys and be testable with mocks. Keeping those at the edge is what makes `ContainerOverrides` + `adapters/mocks.ts` possible. When a rule is unclear, ask: *could this code run in a unit test with no Docker, no network and no Fastify?* If not, it belongs in an outer ring. [O1][H1]

## Step 1 — Place it: decision flow (first "yes" wins)

1. **HTTP concern?** (route path, zod params/body, status code, headers, streaming/SSE, reading `req`) → `routes.ts`.
2. **Talks to an external system or the database?** SQL/Drizzle → `repository.ts`. GitHub/LLM/git/disk/embeddings/queue → an **adapter** behind a **port** (`adapters/<name>/`).
3. **Orchestrates a use case?** (call repository + ports, in order, inside a transaction, emit events) → `service.ts` (or an executor like `run-executor.ts`).
4. **Pure rule/calculation/mapping?** (no `await` on I/O, no `Container`, no `db`, no `process.env`) → `domain/` or `helpers.ts`.
5. **A fixed value?** → `constants.ts` in the module.
6. **Wiring?** (which concrete class implements which port) → `platform/container.ts`.
7. **Used by several modules?** → a facade/port the container hands out (see rule 10), not a deep import.

## Core rules

1. **Imports point inward; verify with the import list, not intent.** If a file imports from a ring outside its own (other than the composition root), it is wrong. [O1][O2][O3]
2. **Routes only translate.** Parse with zod (`params`/`body`), resolve the request context, call **one** service method, map the result or error. No Drizzle, no business rules, no SDKs. [F2][Z3][B2]
3. **Services own the use case and the transaction boundary, and import no infrastructure.** Never `drizzle-orm`, `db/schema`, `fastify`, or a vendor SDK in a service. Open the transaction here and pass it down. [O3][S1][D2]
4. **Domain code is pure.** It imports only types and other pure code — not `Container`, `db`, env, logger or clock singletons (inject time/random if needed). [O1][O4]
5. **Repositories are the only code that knows tables.** Drizzle types (`$inferSelect` rows, `t.*`) stop at the repository boundary; return module-owned types once a row shape would otherwise leak upward. [O1][D3][C1]
6. **External systems = port + adapter + container.** The interface lives in the inner ring (`@devdigest/shared` adapters), the implementation in `adapters/`, the choice in `platform/container.ts`. Design ports around what the core needs, not the vendor's API. [H1][H2][K1]
7. **Parse once at the edge, trust types inside.** zod at routes (and when reading untrusted external data in adapters). Do not re-validate in the domain. [Z1][Z2]
8. **Errors carry meaning, not transport.** Inner rings throw domain/app errors; one handler (`app.ts`) maps them to the HTTP envelope. Don't leak ORM or SDK exceptions upward — translate in the repository/adapter. [O4][O1]
9. **Only the composition root sees everything.** `platform/container.ts` and `modules/index.ts` may import all rings; nothing else may. [O2][H2]
10. **Modules talk through facades.** Another module's internals are off-limits; use its facade/port via the container (`repo-intel` is the model: consume `RepoIntel`, not its repository). [H2]
11. **Test each ring at its own level.** Domain: plain unit. Application: fakes through `ContainerOverrides`. Infrastructure: `*.it.test.ts` with a real Postgres. Presentation: `app.inject`. [TC1][V1]
12. **Right-size it.** Thin CRUD is `routes → service → repository` and needs no `domain/` or `ports.ts`. Add a ring's worth of structure when logic or a second implementation appears, not before. [G1][K1]

Repository interfaces (`ports.ts`) are **optional** here: add one only when a service needs a fake in a unit test, or when two implementations exist. Rules 3 and 5 hold either way.

## Where sources differ (decide, don't average)

- **Strict repo interfaces everywhere vs pragmatic.** Palermo/Jansen put every repository behind a core interface; Sairyss notes the boilerplate may be overkill for data-centric apps. *Default here: pragmatic (rule 12).* [O1][R1][G1]
- **Transaction handling.** Sentry passes an optional `tx` down; Allegro hides it behind an application-owned `Transactions` interface. *Default here: service opens `db.transaction`, passes `tx` to repositories; wrap in an interface only if the service must stay Drizzle-free in tests.* [S1][O3][D2]
- **"Onion" vs Hexagonal vs Clean.** Same dependency rule with different vocabulary; Onion adds explicit inner DDD layers. We use Onion's rings with Hexagonal's port/adapter wording. [O2][H1][C1]

## Step 2 — Read next (only what the question needs)

| If the question is about… | Open |
|---|---|
| What the rings are, how Onion relates to Hexagonal/Clean/DDD, when it is overkill | [references/onion-fundamentals.md](references/onion-fundamentals.md) |
| Routes, plugins, zod at the edge, error handler, request context, SSE | [references/fastify-presentation.md](references/fastify-presentation.md) |
| Where to validate, contracts in `vendor/shared`, transport vs domain types | [references/zod-boundaries.md](references/zod-boundaries.md) |
| Repositories, row mapping, transactions, workspace scoping, migrations | [references/drizzle-infrastructure.md](references/drizzle-infrastructure.md) |
| Ports/adapters, mocks, container overrides, jobs/queue | [references/adapters-and-ports.md](references/adapters-and-ports.md) |
| Which test goes where | [references/testing-by-ring.md](references/testing-by-ring.md) |
| Import rules as lint, review checklist for diffs | [references/enforcement.md](references/enforcement.md) |
| Working in **this repo** (ring map, exemplars, known violations) | [references/devdigest-profile.md](references/devdigest-profile.md) |
| Before/after code | [examples.md](examples.md) |

## Step 3 — Review checklist (use on a diff)

- [ ] No `drizzle-orm`, `db/schema`, `db/client` import in `routes.ts`, `service.ts`, `helpers.ts` or `domain/`.
- [ ] No `fastify`, `req`, `reply` or HTTP status in services/domain.
- [ ] No vendor SDK (`octokit`, `openai`, `@anthropic-ai/sdk`, `simple-git`) outside `adapters/`.
- [ ] Each route: zod schema, one service call, no rules inline.
- [ ] Each new external dependency has a port, an adapter, a container entry and a mock/override.
- [ ] Pure logic is in a function with a unit test that needs no container.
- [ ] Transaction opened in the service; repositories accept an optional `tx`.
- [ ] Errors thrown are domain/app errors; the status mapping stays in `app.ts`.
- [ ] Queries are workspace-scoped (`getContext` → `workspaceId`).
- [ ] Other modules are used via facade/container, not by importing their files.
- [ ] No structure added "for later" (empty `domain/`, a repository interface with one impl and no fake).

## Gotchas

- **Don't refactor existing violations unasked.** They are listed in the DevDigest profile; fix them only when the task already touches that code, and keep the diff scoped.
- Repo rules win over the textbook: `server/CLAUDE.md` ("routes → service → repository", "outside world only through adapters via `platform/container.ts`").
- `platform/{grounding,prompt,structured}.ts` are re-export shims — edit `reviewer-core`, not the shims. Never hand-edit `db/migrations/**` (use `pnpm db:generate`).
- `src/vendor/shared` has a drifted twin in `client/` — diff both before changing a contract; ports (`adapters.ts`) are server-side in practice.
