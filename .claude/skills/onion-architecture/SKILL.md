---
name: onion-architecture
description: "Onion Architecture for the DevDigest backend (server/ and reviewer-core/): which ring a file belongs to, which way imports may point, where ports, adapters, repositories, services, routes and the composition root live, and how Fastify, Drizzle, Zod and external SDKs (octokit, simple-git, openai/anthropic, ripgrep, ast-grep, dependency-cruiser, tiktoken) fit those rings. Use whenever creating, moving, splitting or reviewing anything under server/src/modules, server/src/adapters, server/src/platform, server/src/db or reviewer-core/src; adding a new module, endpoint, service, repository, adapter, background job or LLM call; deciding \"where should this go?\"; pulling logic out of a route handler; or reviewing a backend diff — even if the user never says \"architecture\" or \"onion\". Not for table design (postgresql-table-design, drizzle-orm-patterns) or Fastify API details as such (fastify-best-practices)."
metadata:
  version: 1.0.0
  updated: 2026-11-27
  scope: backend-architecture-and-boundaries
---

# Onion Architecture — DevDigest backend

The goal: business rules that compile and test **without** Postgres, Fastify, GitHub,
git or an LLM. Infrastructure is a detail plugged in from the outside.

Rules here are about **placement, dependency direction and responsibilities**. How to
write a good Fastify route, Drizzle query or Zod schema lives in `fastify-best-practices`,
`drizzle-orm-patterns` and `zod` — don't duplicate them here.

Sources are cited in *(italics)*; links are in [README.md](README.md).

**Read next, when relevant:**
- [references/fastify.md](references/fastify.md) — routes/plugins as the transport ring, error mapping, DI without service locator.
- [references/drizzle.md](references/drizzle.md) — repository ports, row ↔ contract mapping, transactions.
- [references/zod-contracts.md](references/zod-contracts.md) — parse at trust boundaries, `@devdigest/shared` as the domain model.
- [references/adapters-and-ports.md](references/adapters-and-ports.md) — every external SDK as port + adapter + mock; the composition root.
- [references/reviewer-core.md](references/reviewer-core.md) — the pure engine at the centre.
- [references/examples.md](references/examples.md) — real before/after refactors from this repo.

---

## 0. Core principles

1. **The application is built around an independent domain model.** *(Palermo, part 1)*
2. **Dependencies point inward only.** Inner rings never import outer rings — not even a type. *(Palermo; Martin — Dependency Rule)*
3. **Inner rings define interfaces (ports); outer rings implement them (adapters).** *(Palermo; Cockburn — Ports & Adapters)*
4. **Infrastructure is pushed to the edge** — DB, HTTP, SDKs, filesystem, clock, env. *(Palermo; Graça — Explicit Architecture)*
5. **The core is testable in isolation** — a service test needs fakes, not Docker. *(Palermo, part 4)*
6. **Objects are composed in exactly one place** — the composition root. Nothing else news-up infrastructure or pulls dependencies from a container. *(Seemann — Composition Root; Service Locator is an anti-pattern)*
7. **Slice by feature, layer inside the slice.** A module is a vertical slice; rings live inside it as file roles. *(Drotbohm — Sliced Onion)*

---

## 1. Ring map — DevDigest

We keep the existing file roles (no `domain/` / `infrastructure/` folders). Each file
role **is** a ring.

| Ring (inner → outer) | Files | May import |
|---|---|---|
| **1. Domain model** | `vendor/shared/contracts/*` · `modules/*/types.ts` (data types) · `modules/*/constants.ts` · `modules/*/helpers.ts` and other pure files (`pulls/status.ts`, `pulls/cost.ts`) · `platform/errors.ts` | ring 1 only, `zod` |
| **2. Domain services & ports** | `vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`) · port interfaces in `modules/*/types.ts` (`RepoIntel`, `XxxRepositoryPort`) · `adapters/<x>/index.ts` interface-only exports (`Tokenizer`, `DepGraph`) · **`reviewer-core/src/*`** | rings 1–2 |
| **3. Application services** | `modules/*/service.ts` · `reviews/run-executor.ts` · other orchestration (`diff-loader.ts`, `findings.ts`) | rings 1–2 **only** — never `drizzle-orm`, `db/*`, `fastify`, an SDK, `node:fs`, `process.env` |
| **4. Infrastructure & transport** | `modules/*/routes.ts` (HTTP) · `modules/*/repository.ts` (Drizzle) · `adapters/*/<impl>.ts` · `db/*` · `platform/{jobs,sse,config,resilience,run-logger}.ts` · `app.ts`, `server.ts` · **`platform/container.ts` (composition root)** | everything inward |

Tie-breaker: *"Would this file still compile if Postgres, Fastify and every SDK were
deleted from `package.json`?"* Yes → rings 1–3. No → ring 4.

---

## 2. Dependency rules

**MUST**
- **Services take narrow ports in the constructor**, e.g.
  `constructor(private deps: { repos: RepoRepositoryPort; git: GitClient; jobs: JobQueue })`.
  Only `platform/container.ts` (or the module's `routes.ts` plugin, which is the module's
  local composition root) builds them. *(Seemann)*
- **Every repository has a port** (`XxxRepositoryPort` in `types.ts`); `repository.ts`
  `implements` it with Drizzle. *(Palermo; Stemmler)*
- **Repositories return domain/contract types**, never `typeof t.x.$inferSelect` outside
  `repository.ts`. Map rows → `@devdigest/shared` DTOs inside the repository (or a
  `mapper` function next to it). *(Stemmler — Repository/DTO/Mapper)*
- **Parse at every trust boundary**: HTTP input via the route's Zod `schema`, LLM output via
  `parseWithRepair`, jsonb and job payloads with the contract schema. Inside the core,
  trust the types. *(King — Parse, don't validate)*
- **A new external dependency = port (ring 2) + adapter (ring 4) + mock in
  `adapters/mocks.ts` + wiring in `container.ts`** (+ `ContainerOverrides` entry). *(server/AGENTS.md; Cockburn)*
- **Domain/application code raises `AppError` subclasses** (`NotFoundError`,
  `ValidationError`, `ExternalServiceError`, `ConfigError`). Only the `setErrorHandler` in
  `app.ts` turns them into HTTP.
- **Cross-module use goes through the other module's public surface** — its `index.ts`
  barrel or a facade port (`RepoIntel` via `container.repoIntel`). *(Drotbohm; Graça)*
- **Transactions**: the application service decides *that* several writes are one unit;
  a repository/unit-of-work method in ring 4 opens `db.transaction(...)`. See [drizzle.md](references/drizzle.md).

**NEVER**
- `import ... from 'drizzle-orm'` or `'../../db/...'` in `service.ts`, `helpers.ts`, `constants.ts`, `types.ts`.
- `container.db` (or any query) in `routes.ts`.
- `constructor(private container: Container)` in new services — that is a Service Locator. *(Seemann)*
- `import ... from '../<other-module>/<internal-file>.js'` — use its `index.ts`.
- `fastify`, `FastifyRequest`, `reply` beyond `routes.ts` / `app.ts`.
- Importing a concrete adapter (`OctokitGitHubClient`, `SimpleGitClient`, `OpenAIProvider`) anywhere except `container.ts` and tests.
- Reading `process.env` / secrets outside `platform/config.ts` and `SecretsProvider`.
- DB, FS, network or `process.env` in `reviewer-core/src` — its only side effect is the injected `LLMProvider`.

---

## 3. Quick lookup — "where does X go?"

| I need to… | Put it in | Ring |
|---|---|---|
| Add an endpoint | `modules/<m>/routes.ts` — Zod `schema`, `getContext`, call service, set status | 4 |
| Write a SQL/Drizzle query | `modules/<m>/repository.ts` behind `XxxRepositoryPort` | 4 (port: 2) |
| Add a business rule / calculation | `modules/<m>/helpers.ts` (pure, unit-tested) | 1 |
| Orchestrate "load → decide → persist → enqueue" | `modules/<m>/service.ts` | 3 |
| Call GitHub / git / LLM / ripgrep | the existing port (`GitHubClient`, `GitClient`, `LLMProvider`, `CodeIndex`) injected into the service | 3 → 2 |
| Use a new SDK | new port in `vendor/shared/adapters.ts` (or `adapters/<x>/index.ts`), impl in `adapters/<x>/`, mock in `mocks.ts`, wire in `container.ts` | 2 + 4 |
| Define a request/response shape | `vendor/shared/contracts/*` — **both** copies (server + client) | 1 |
| Map a DB row to a DTO | inside `repository.ts` (or `mapper.ts` beside it) | 4 |
| A module-local literal | `modules/<m>/constants.ts` | 1 |
| A background job | handler logic in `service.ts`; registration (`jobs.register`) in `routes.ts` plugin; `JobRunner` is ring 4 | 3 / 4 |
| A multi-table write | service calls one repository/UoW method that wraps `db.transaction` | 3 → 4 |
| Use another module's data | its facade/port via `container.ts`, or its `index.ts` | — |
| Change the review engine | `reviewer-core/src/` — the server imports it as `@devdigest/reviewer-core` (no server-side shims) | 2 |

---

## 4. Recipe — new module or feature

1. **Read** the spec in `server/specs/`, `server/INSIGHTS.md`, and this skill.
2. **Contract (ring 1):** Zod schemas in `vendor/shared/contracts/` — update **both** copies (`server/src/vendor/shared`, `client/src/vendor/shared`).
3. **Types & ports (rings 1–2):** `modules/<m>/types.ts` — domain types + `XxxRepositoryPort` + any new external port.
4. **Pure rules (ring 1):** `helpers.ts` / `constants.ts` + unit tests in `server/test/`.
5. **Service (ring 3):** `service.ts`, constructor takes a `deps` object of ports. Throws `AppError`s.
6. **Repository (ring 4):** `repository.ts implements XxxRepositoryPort`; every query scoped by `workspaceId`; returns contract types.
7. **Routes (ring 4):** `routes.ts` default-exported plugin; Zod `schema` for params/body/query; build the service from `app.container` here (or a `container` getter); no queries.
8. **Register:** one entry in `modules/index.ts`; adapters/repositories shared across modules get a getter in `platform/container.ts`.
9. **Tests:** service unit tests with fake ports (no Docker); repository `*.it.test.ts` (testcontainers); route tests via `app.inject()` with `ContainerOverrides`.
10. **Done** = `pnpm typecheck` + `pnpm test` pass in every touched package; run the checklist below.

---

## 5. Legacy policy

The starter predates this skill. Known deviations — **don't copy them, don't mass-refactor them**:

| Deviation | Where |
|---|---|
| Services take the whole `Container` (service locator) | `repos`, `agents`, `reviews`, `repo-intel` `service.ts` |
| Queries in route handlers | `polling`, `settings`, `workspace` `routes.ts`; `settings/feature-models.ts` |
| DB row types in rings 1–3 | `repos/helpers.ts` (`toRepoDto(row: typeof t.repos.$inferSelect)`), `reviews/service.ts` (`AgentRow` from `db/rows.js`) |
| Repositories without ports | every `repository.ts` except `pulls/` |

**Reference implementation:** `modules/pulls/` already follows this skill. Its `types.ts`
defines `PullsRepositoryPort`, `PullsServiceDeps` and a `PullsLogger` port. `PullsService`
takes `deps` with no `Container` and no Fastify types. `routes.ts` wires it up:
`new PullsService({ pulls: new PullsRepository(container.db), github: () => container.github(), log: app.log })`.
Copy that shape.
| Import of another module's internal file | `repos/service.ts` → `../repo-intel/constants.js` |

**Boy-scout rule:** new code follows section 2. When you *touch* a legacy file, don't make
it worse; if the fix is cheap and in scope (e.g. moving one query from a route into a
repository), do it in the same change. Anything bigger → propose it separately. Never mix
a large architectural move into a feature PR.

---

## 6. Review checklist

Run from `server/`. Each command should print nothing for **new or changed** files
(legacy hits listed in §5 are expected until migrated).

1. `grep -nE "from 'drizzle-orm'|/db/" src/modules/*/service.ts src/modules/*/helpers.ts src/modules/*/constants.ts src/modules/*/types.ts` — no persistence in rings 1–3.
2. `grep -nE "container\.db|from 'drizzle-orm'" src/modules/*/routes.ts` — no queries in transport.
3. `grep -n "private container: Container" src/modules/*/service.ts` — no new service locators.
4. `grep -rnE "from '\.\./[a-z-]+/(constants|helpers|repository|service)\.js'" src/modules` — no cross-module internals.
5. `grep -rnE "from 'fastify'" src/modules --include='service.ts' --include='helpers.ts'` — no framework in the core.
6. `grep -rnE "new (Octokit|OpenAI|Anthropic)|OctokitGitHubClient|SimpleGitClient|OpenAIProvider|AnthropicProvider" src --include='*.ts' | grep -v -e container.ts -e adapters/` — concrete adapters only in the root.
7. `grep -rn "process.env" src | grep -v platform/config.ts` — env only in config.
8. `grep -rnE "from '(fs|node:fs|postgres|drizzle-orm|octokit)'" ../reviewer-core/src` — reviewer-core stays pure.
9. Every new port has a mock in `adapters/mocks.ts` and a `ContainerOverrides` field.
10. Every new service has a unit test that runs without Docker.

Optional, not wired in CI yet: `dependency-cruiser` (already a server dependency) can
enforce rules 1–8 with `forbidden` rules — see README.md → Enforcement.

---

## 7. Related skills
`fastify-best-practices` (route/plugin mechanics) · `drizzle-orm-patterns` (query API) ·
`postgresql-table-design` (schema) · `zod` (schema authoring) · `typescript-expert`
(types, branded ids) · `security` (trust boundaries) · `engineering-insights` (read
`server/INSIGHTS.md` first, append learnings last).
