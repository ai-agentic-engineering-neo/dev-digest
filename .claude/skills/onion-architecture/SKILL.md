---
name: onion-architecture
description: "Enforces Onion Architecture in the backend (server/ on Fastify 5 + Drizzle/Postgres + Zod 3 + LLM/GitHub/git adapters, with reviewer-core as the pure inner core). Decides which ring code belongs to (domain, application, infrastructure, http, composition root), where Zod schemas, Drizzle queries, repositories, ports, transactions, errors and config live, how dependencies are injected, and runs a dependency-cruiser check that fails on inward-rule violations. Use when adding or changing a server module, route, use case, repository, adapter, table or LLM call, moving backend code, asking where backend code should go, or reviewing a backend PR for layering. Not for Fastify/Drizzle/Zod API details (use fastify-best-practices, drizzle-orm-patterns, zod)."
metadata:
  version: "1.0.0"
  scope: "server/, reviewer-core/"
---

# Onion Architecture (backend)

Dependencies point **inward only**. The core compiles and is testable without
Fastify, Drizzle, Postgres or any SDK. Enforced by
`server/.dependency-cruiser.cjs` (section 9).

Details: [references/fastify.md](references/fastify.md) ·
[references/drizzle.md](references/drizzle.md) ·
[references/zod-boundaries.md](references/zod-boundaries.md) ·
[references/testing.md](references/testing.md) ·
[references/examples.md](references/examples.md) ·
[references/migration.md](references/migration.md) (known legacy violations).
Sources, decisions and changelog: [README.md](README.md).

## 1. Rings

| Ring | In a module (small → grown) | Shared | Owns | May import |
|---|---|---|---|---|
| **domain** | `domain.ts`, `helpers.ts`, `constants.ts` → `domain/` | `@devdigest/shared` types, `platform/errors.ts`, **reviewer-core** | entities, value objects, invariants, pure rules, domain errors | domain only, `zod`, `@devdigest/shared` |
| **application** | `service.ts` → `application/` | ports in `@devdigest/shared/adapters.ts` | use cases, port interfaces, transaction boundary, orchestration | domain, ports, own repository **as type** |
| **infrastructure** | `repository.ts` / `repository/` → `infrastructure/` | `src/adapters/*`, `src/db/*` | Drizzle schema + queries, mappers, SDK/GitHub/git/ast-grep adapters | domain, application ports, `src/db`, SDKs |
| **http** | `routes.ts` → `http/` | `modules/_shared` (context, schemas) | Fastify plugin, zod request/response schemas, DTO mapping | application, domain, `fastify`, `zod` |
| **composition root** | `composition.ts` (`build<Name>Module`) | `platform/container.ts`, `app.ts`, `server.ts`, `modules/index.ts`, `modules/composition.ts`, `platform/config.ts` | wiring: build adapters → repositories → use cases → plugins | everything |

Rules:
- An outer ring may call **any** inner ring (skipping is fine); never the reverse.
- `domain` never imports `fastify`, `drizzle-orm`, `postgres`, `openai`,
  `@anthropic-ai/*`, `octokit`, `simple-git`, `@ast-grep/*`, `process.env`, `fs`,
  `child_process`, network modules.
- Only the composition root knows concrete classes of more than one ring.
- A file's ring is its **name** (small module) or its **folder** (grown module).
  A new module file must be one of: `domain`, `helpers`, `constants`, `types`,
  `service`, `repository`, `routes`, `index`, `composition` (module wiring) — or live
  in one of `domain/`, `application/`, `infrastructure/`, `http/`. Any other name is
  checked as **application**; move it to its real ring.
- Split into folders when a ring's file passes ~300 lines or needs several files.

## 2. Where does it go?

| You have… | Ring → location |
|---|---|
| Business rule, calculation, state transition, validation of an invariant | domain → `domain.ts` / `helpers.ts` (pure function or entity method) |
| Magic value, enum-like map, limit | domain → `constants.ts` |
| "When X, load A and B, apply rule, save C, notify D" | application → method on the use case in `service.ts` |
| Interface the use case needs from the outside world | application → port: in `service.ts`/`application/ports.ts`; shared ports in `@devdigest/shared/adapters.ts` |
| SQL / Drizzle query, `pgTable`, relations, pgvector `<=>` | infrastructure → `repository.ts` (module) / `src/db/schema/*` (tables) |
| Row ↔ domain / DTO mapping | infrastructure → mapper next to the repository |
| LLM, GitHub, git, ast-grep, embeddings, filesystem call | infrastructure → `src/adapters/<kind>/` implementing a port |
| Request/response schema, params, status codes | http → `routes.ts` (module-local) or `@devdigest/shared` (contract shared with client — update **both** copies) |
| Domain error → HTTP status | http edge → the root `setErrorHandler` in `app.ts` |
| Env var | composition root → `platform/config.ts` zod schema; secrets only via `SecretsProvider` |
| New module | `modules/<name>/` + one line in `modules/index.ts` |
| Review engine logic (prompt, grounding, reduce) | domain core → `reviewer-core/src` (pure; I/O only via injected `LLMProvider`) |

## 3. Per-tool rules

**Fastify (http + composition root)** — details in `references/fastify.md`
- A module is an encapsulated plugin; call `app.withTypeProvider<ZodTypeProvider>()`
  in each plugin (type providers are not inherited).
- Handler = parsed input → `getContext` → use case → DTO. No `db`, no Drizzle, no
  `new XxxRepository`, no business `if`s.
- Schema-first: zod `params`/`querystring`/`body`/`response` on the route; never
  `Schema.parse(req.body)` in a handler.
- Errors: throw domain errors; the one root `setErrorHandler` maps them
  (validation → 422, `AppError` → its code).
- Infrastructure plugins that must be visible app-wide use `fastify-plugin` with
  `name` + `dependencies`; feature plugins stay encapsulated.

**Drizzle (infrastructure)** — details in `references/drizzle.md`
- `drizzle-orm`, `src/db/*`, `InferSelectModel`/row types stay in infrastructure.
- A repository method is shaped by the use case (`listEnabledForWorkspace`), returns
  domain objects / read models — never a query builder, `SQL` fragment or `tx`.
- Transactions: the **use case** decides the boundary via a `TransactionRunner`
  port (`run(fn)`), implemented with `db.transaction(tx => …)`; repositories are
  built from `tx ?? db`.
- Translate driver errors (unique/foreign-key violations) into domain errors
  inside the adapter.

**Zod** — details in `references/zod-boundaries.md`
- Transport schemas (http) ≠ domain types. Don't reuse a request schema as an entity.
- Parse at the edge once (route schema, config, LLM output inside its adapter);
  inner rings receive already-typed data.
- `drizzle-zod` output is an adapter helper, never an API contract.

**LLM / GitHub / git / ast-grep / embeddings (infrastructure)**
- Only through ports (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`,
  `Embedder`, …). SDK types never cross the port.
- Model ids and keys come from injected config / `SecretsProvider`.
- Structured LLM output is validated inside the adapter / reviewer-core, not in routes.

## 4. Dependency injection

- A use case receives **only the ports it uses** through its constructor or
  factory: `new AgentsService({ agents, llm })` — not the whole `Container`.
- Construction happens in the composition root (`platform/container.ts` or the
  module's plugin factory). No DI library.
- Pragmatic CRUD: a use case may reference its own module repository **as a type**
  (`import type`). Extract a port interface when real invariants, a second
  implementation or a test fake is needed.
- Request-scoped data (`workspaceId`, `userId`) is passed as arguments from
  `getContext`, not stored on the service.

## 5. Proportionality

- CRUD endpoint with no rules: `routes.ts` → thin `service.ts` method → repository.
  No entity, no mapper beyond row → DTO, no port interface.
- Add a domain entity/value object when there is an invariant to protect.
- Add a port interface when there is a swap point (tests, second provider, SDK).
- Never add a ring file "for symmetry"; an empty `domain.ts` is noise.

## 6. Workflow: new module / use case

```
- [ ] 1. Read server/INSIGHTS.md (+ reviewer-core/INSIGHTS.md if the engine changes) and the spec
- [ ] 2. domain: types, invariants, pure rules + unit tests (no doubles)
- [ ] 3. application: use case method, ports it needs, transaction boundary
- [ ] 4. infrastructure: repository/adapter implementing the port, mapper, *.it.test.ts
- [ ] 5. http: zod schemas, handler → use case → DTO; errors thrown, not formatted
- [ ] 6. composition root: wire in the module's composition.ts; register in modules/index.ts + modules/composition.ts
- [ ] 7. Run the layer check (section 9) → pnpm typecheck → unit tests
```

## 7. Review checklist

- [ ] Layer check passes with no new violations (baseline file unchanged or shrunk)
- [ ] No Drizzle/`src/db` import outside infrastructure; no SDK import outside adapters
- [ ] Routes don't query, don't `new` repositories, don't hold business rules
- [ ] New/changed use cases take ports, not `Container`
- [ ] Domain/`helpers.ts` code is pure and unit-tested without mocks
- [ ] Errors: domain throws typed errors; only the root handler knows HTTP
- [ ] Contract changes updated in both `vendor/shared` copies
- [ ] reviewer-core still has no server import, I/O or SDK outside `src/llm/`

## 8. Anti-patterns

- Handler that runs Drizzle queries (`pulls/routes.ts` style) — move to repository + service.
- Service locator: `constructor(private container: Container)`.
- Domain helper importing a repository or `db/schema` to reuse a type — declare a
  domain type instead.
- Generic `BaseRepository<T>` mirroring Drizzle's API; ports named after tools
  (`DrizzleAgentsPort`) instead of needs.
- HTTP status codes decided in services; `reply` passed into a use case.
- `process.env` outside `platform/config.ts` / `SecretsProvider`.
- Adapters importing feature modules (`adapters/* → modules/*`).
- Reaching into another module's internals instead of its `index.ts`/`types.ts`.

## 9. Enforcement (dependency-cruiser)

Run from `server/` (pnpm may be missing on WSL → `npx -y pnpm@10 exec …`):

```bash
pnpm exec depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --ignore-known
```

- Exit 0 = no **new** violations. Legacy ones are listed in
  `server/.dependency-cruiser-known-violations.json` and explained in
  `references/migration.md`.
- A new violation → fix the code. Never add it to the baseline.
- After fixing a legacy violation ("fix on touch"), shrink the baseline:
  `pnpm exec depcruise-baseline src ../reviewer-core/src --config .dependency-cruiser.cjs`
  and check the diff only **removes** entries.
- See all, including known: add `--no-ignore-known`.
