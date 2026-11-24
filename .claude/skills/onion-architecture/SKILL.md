---
name: onion-architecture
description: Enforces Onion Architecture in DevDigest backend code (server/, reviewer-core/) — which ring a file belongs to (domain / application / infrastructure / http), the inward-only dependency rule, and how to apply it with Fastify 5, Drizzle, Zod, the DI container (platform/container.ts), JobRunner/SSE and the external SDK adapters. Use when creating or changing a server module, route, service, use case, repository, mapper, adapter or port; when deciding "where does this code go"; when reviewing a backend PR; or when migrating a legacy module. Triggers - "onion", "layers", "clean/hexagonal architecture", "ports and adapters", "new module", "repository", "use case", "where should this go", "архітектура модуля", "шари", "куди покласти", "цибулева архітектура".
---

# Onion Architecture — DevDigest backend

**Scope:** `server/src/**` and `reviewer-core/src/**`. Not `client/`, not `e2e/`.
**One rule above all:** source-code dependencies point **inward only**. An inner ring never
imports, names, or receives a type from an outer ring.

```
 http/ · infrastructure/ · src/adapters · src/db · platform/container.ts      ← outer: mechanisms
   application/  (use cases, orchestration, transactions via ports)
     domain/ports.ts  (repository + gateway interfaces the core needs)
       domain/  (entities, value types, pure policies, domain errors)        ← inner: policy
 reviewer-core/ = a whole package that is domain + application, no infrastructure
```

## Target module layout

```
server/src/modules/<feature>/
  domain/          types.ts · policies.ts · errors.ts · ports.ts        pure TS, no I/O
  application/     <feature>.service.ts                                 use cases
  infrastructure/  <feature>.repository.ts · mappers.ts                 Drizzle lives here
  http/            routes.ts · schemas.ts · presenter.ts                Fastify + Zod live here
  index.ts         export default createModule(deps) → FastifyPluginAsync
```

Small modules may drop empty folders, but **never merge rings into one file**.
Cross-module shared code goes to `modules/_shared/` (same ring rules apply) or, if it is a
port for an external system, `vendor/shared/adapters.ts`.

## Allowed imports (enforced — see "Enforcement")

| From ↓ may import → | domain | application | infrastructure | http | `src/db`, `src/adapters`, `platform/*` | `drizzle-orm`, `fastify`, SDKs | `zod` (runtime) | `@devdigest/shared` |
|---|---|---|---|---|---|---|---|---|
| **domain** | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | `import type` only |
| **application** | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | types + port interfaces |
| **infrastructure** | ✔ | ports/types | ✔ | ✘ | `db/`, `adapters/` | `drizzle-orm` | ✔ (parse JSON cols) | ✔ |
| **http** | types, errors | ✔ | ✘ | ✔ | `platform/errors`, `_shared/context` | `fastify` | ✔ | ✔ |
| **index.ts** (module factory) | ✔ | ✔ | ✔ | ✔ | type of deps only | `fastify` types | — | — |
| **reviewer-core/src** | — | — | ✘ | ✘ | ✘ | `openai` only in `llm/openrouter.ts` | ✔ (structured output) | ✔ |

A module never imports another module's folder — talk through a port or through `container.*`.

## Where does this code go?

| The code… | Ring / file |
|---|---|
| decides something business-y from data already in memory (version bump, severity filter, cost rule) | `domain/policies.ts` — pure function, unit-tested without mocks |
| names a business failure ("agent not found", "run already finished") | `domain/errors.ts` — subclass of `DomainError` (`modules/_shared/domain/errors.ts`) with a `code`, **no HTTP status** |
| describes what the core needs from the outside world (load/save, call GitHub, enqueue job) | `domain/ports.ts` interface (module-local) or `vendor/shared/adapters.ts` (shared external system) |
| sequences steps for one user intent, checks existence/tenancy, opens a transaction | `application/<feature>.service.ts` |
| builds SQL, touches `t.<table>`, `db.transaction`, `$inferSelect` | `infrastructure/<feature>.repository.ts` |
| converts DB row ⇄ domain type, parses a jsonb column | `infrastructure/mappers.ts` |
| reads `req`/`reply`, declares a Zod body/params/response schema, sets status codes | `http/routes.ts` + `http/schemas.ts` |
| converts domain type → API contract (`snake_case` DTO from `@devdigest/shared`) | `http/presenter.ts` |
| calls an SDK (octokit, openai, simple-git, ripgrep, ast-grep, tiktoken) | `src/adapters/<name>/` behind a port + a mock in `adapters/mocks.ts` |
| `new`s anything concrete (repo, adapter, service) | `platform/container.ts` or the module's `index.ts` factory — nowhere else |

## Rules per tool (short form — details in `references/`)

**Fastify** (`references/fastify.md`) — delivery adapter, outermost.
1. A handler does: Zod-parsed input → `getContext` → **one** use-case call with plain values → presenter. Nothing else.
2. `FastifyRequest`, `FastifyReply`, `FastifyInstance` never enter application/domain.
3. Use cases throw `DomainError`s; one `setErrorHandler` in `app.ts` maps `code → status`. Routes don't translate `undefined` into 404 by hand in new code.
4. Each module is one encapsulated plugin built by a factory that receives its deps; only `app.ts` decorates `container`.

**Drizzle** (`references/drizzle.md`) — infrastructure.
1. `drizzle-orm`, `db/schema*`, `db/rows` are imported only in `infrastructure/`, `src/db/`, `platform/container.ts`.
2. A repository **implements a port** from `domain/ports.ts` and returns **domain types via mappers**, never raw rows.
3. No business rules inside repositories (e.g. "config change bumps version" is a domain policy the use case applies).
4. Multi-write use cases run through a `UnitOfWork` port; its Drizzle implementation wraps `db.transaction(tx => …)` and hands out tx-bound repositories. `tx` never appears in application code.

**Zod** (`references/zod.md`) — boundaries only.
1. Parse untrusted data **once, where it enters**: HTTP schema, jsonb mapper, LLM structured output, config/env, secrets file.
2. Domain types are plain TS (branded where useful); `domain/` never calls Zod at runtime.
3. `@devdigest/shared` contracts are transport DTOs (two copies — server and client; change both). Presenters map domain → contract.

**DI / composition root** (`references/composition-root.md`).
1. `platform/container.ts` (plus module `index.ts` factories) is the only place that constructs concrete classes.
2. Use cases take a **narrow deps object** (`{ agents, uow, llm }`), never `Container` — passing the container is the Service Locator anti-pattern.
3. Tests replace ports with in-memory fakes / `ContainerOverrides`; use-case tests need no Docker.

**Background work & events.** Application talks to `JobScheduler` / `RunEvents` ports; `JobRunner` (p-queue + jobs table) and `RunBus` (SSE) are infrastructure. Any promise an adapter does not await gets a `.catch` that records the failure (an unhandled rejection kills the API — see server/INSIGHTS.md).

**External SDKs.** Imported only under `src/adapters/**` (and `reviewer-core/src/llm/openrouter.ts`). The adapter translates SDK errors into `ExternalServiceError` and SDK shapes into port types.

**reviewer-core.** Already the reference pure core: no `fs`, `child_process`, `drizzle-orm`, `postgres`, `fastify`; side effects only through injected ports (`LLMProvider`). Keep it that way.

## Checklists

**New module**
- [ ] Folders `domain/ application/ infrastructure/ http/` + `index.ts` factory; registered in `modules/index.ts`.
- [ ] Ports declared in `domain/ports.ts`; Drizzle repo implements them; mapper row ⇄ domain.
- [ ] Service constructor takes `{ …ports }`, not `Container`; wiring in `index.ts` from `app.container`.
- [ ] Domain errors with codes; codes added to the error-handler map.
- [ ] Unit tests: policies (pure) + service (fakes). Integration (`*.it.test.ts`): repository only.
- [ ] Architecture test green, no new baseline entries.

**Reviewing a backend diff** — flag any of:
- `drizzle-orm` / `db/schema` / `container.db` outside `infrastructure/`, `src/db`, `platform/container.ts`.
- `fastify` types or `req` passed below `http/`.
- `Container` as a constructor/function parameter in new code.
- `new SomethingRepository(` / `new SomethingAdapter(` outside the composition root.
- A route doing more than parse → context → one call → present.
- A repository deciding business outcomes; a domain file importing Zod or anything outward.
- A row type (`*Row`, `$inferSelect`) or an SDK type in a service signature.
- An import from another module's folder.

## Legacy code (most modules today)

Existing modules predate this skill (flat `routes.ts / service.ts / repository.ts`, services taking
`Container`, routes using `container.db`). Policy:
- **New code follows the rules even inside a legacy module** — don't add another violation to match the file's style.
- Touching a legacy file? Fix the violation on the lines you change if it's local; don't start a whole-module refactor uninvited.
- Known violations are frozen in a baseline; the architecture test fails only on **new** ones. Remove baseline entries as modules migrate.
- Full module migration: follow `references/migration.md` (one module per PR; `agents` is the pilot, `reviews` last).

## Enforcement

`server/.dependency-cruiser.cjs` encodes the import table above; `server/test/architecture.test.ts`
runs it in the unit suite, so CI `server-unit` fails on any violation not in
`server/.dependency-cruiser-known-violations.json` (12 legacy entries after agents, settings, workspace, polling, pulls — 2026-11-24).

- Check locally (from `server/`): `pnpm exec vitest run test/architecture.test.ts`
  or, for readable output, `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`.
- The test fails on **new** violations → fix the import; never regenerate the baseline to hide one.
- It also fails when a baseline entry is **fixed** but still listed → regenerate so the baseline only shrinks:
  `pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs`.
- npm targets are compared by package name, so dependency bumps don't break the baseline.

Rule names and what they catch: `references/layers.md` → "Enforcement rules".

## References

- `references/layers.md` — ring definitions, mapping to repo paths, depcruise rules
- `references/fastify.md` · `references/drizzle.md` · `references/zod.md` · `references/composition-root.md`
- `references/migration.md` — current violations inventory and step-by-step module refactor
- `references/sources.md` — articles and docs this skill is based on
- `examples.md` — bad → good pairs from the agents module
- Related skills (tool usage, not layering): `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert`, `postgresql-table-design`
