---
name: onion-architecture
description: "Onion Architecture (ports & adapters, inward-only dependencies) for the DevDigest backend: server/ (Fastify 5, Drizzle + Postgres/pgvector, Zod, LLM/GitHub/git SDK adapters) and reviewer-core/. Defines which layer each file belongs to, what each layer may import, the lite module layout (flat routes / service / repository until a layer has more than one file), where ports and adapters live, how Fastify routes, Zod contracts, Drizzle repositories, transactions and SDK adapters fit the layers, DI through the composition root, and tests per layer. Use when adding or changing a backend module, route, service, repository, port or adapter; when importing drizzle-orm, fastify, zod or an SDK in server code; when deciding 'where should this go' on the backend; when refactoring a service or reviewing backend architecture. Complements fastify-best-practices, drizzle-orm-patterns and zod (API details), which it does not repeat."
---

# Onion Architecture (backend)

How to keep business logic in the center and tools (Fastify, Drizzle, Postgres, SDKs) at the
edge, in `server/` and `reviewer-core/`. This skill covers **dependency direction and file
placement only**. For framework APIs use `fastify-best-practices`, `drizzle-orm-patterns`,
`postgresql-table-design` and `zod`.
Every rule is sourced in [references.md](references.md). Good/bad code is in [examples.md](examples.md).
A future enforcement config is in [templates/](templates/) (not wired, see §13).

**Project overrides win.** `server/AGENTS.md` and `reviewer-core/AGENTS.md` override this skill.
Read them first.

Severity: **MUST** = breaks the dependency rule or causes bugs · **SHOULD** = default, deviate with a reason · **AVOID** = a smell.

---

## 1. Core principles

1. **Dependencies point inward only.** Presentation and infrastructure depend on application.
   Application depends on domain. Nothing inside knows anything about the outside. (Palermo, Martin)
2. **Inner layers define interfaces, outer layers implement them.** A port is owned by the code
   that *uses* it, not by the adapter that implements it. (Palermo, Cockburn)
3. **The core runs without infrastructure.** Domain and application code compile and unit-test
   with no Postgres, no network, no Fastify instance and no API keys.
4. **Enforce the direction, not the folders.** A small module stays flat. Folders appear only when
   a layer grows (§3). An onion with four empty folders per feature is overhead, not architecture
   (Palermo, part 4).
5. **Adapters and the DB are app-wide.** `src/adapters/` and `src/db/` are shared by all modules.
   Don't copy an onion (own adapters, own DB client) inside each feature.
6. **Parse at the edge, trust inside.** Untrusted data is parsed once where it enters
   (HTTP, env, LLM output, external API). Inner code works with typed values. (King)
7. **New code follows the rules, legacy is fixed when touched.** Don't copy existing violations
   (§14). Don't mass-refactor them in an unrelated PR.

## 2. Layers in DevDigest

```
┌ Presentation    modules/<m>/routes.ts · modules/_shared/{context,schemas}.ts · SSE routes
│ ┌ Infrastructure  modules/<m>/repository.ts · src/adapters/** · src/db/**
│ │ ┌ Application     modules/<m>/service.ts · ports.ts · src/application/ports/**
│ │ │ ┌ Domain          modules/<m>/domain.ts (pure rules, e.g. pulls/status.ts)
│ │ │ └
Composition root: src/app.ts · src/server.ts · platform/container.ts · modules/index.ts
```

Presentation and infrastructure are both **outer** rings. Neither imports the other.
Routes call services, and services reach the DB only through repositories passed in.

| Layer | May import | MUST NOT import |
|---|---|---|
| **Domain** | other domain code · `import type` / `z.infer` types from `@devdigest/shared` | runtime `zod` · `drizzle-orm` · `src/db/**` · `fastify` · any SDK · `node:fs`/`net`/`child_process` · `platform/container` · application / infrastructure / presentation code |
| **Application** | domain · ports (feature + app-wide + existing `@devdigest/shared` ports) · `@devdigest/shared` types · `platform/errors` · pure I/O-free libs (`graphology`) | `drizzle-orm` · `db/schema` · `db/rows` · `fastify` · SDKs · concrete classes from `src/adapters/**` · `platform/container` (new code) |
| **Infrastructure** | domain · application ports (to implement them) · `drizzle-orm` · `src/db/**` · SDKs · `node:*` · `platform/{resilience,errors}` | `fastify` · routes · services · other modules' internals |
| **Presentation** | services of its module · runtime Zod contracts from `@devdigest/shared` · `fastify` + plugins · `modules/_shared/*` · `platform/errors` | `drizzle-orm` · `src/db/**` · repositories · SDKs · `src/adapters/**` |
| **Composition root** | everything | business logic of any kind |

`src/platform/` is mixed. Classify each file by its role: `container.ts` and `config.ts` belong to
the composition root, `errors.ts` is a shared kernel usable by every layer except domain,
and `jobs.ts`, `sse.ts`, `run-logger.ts`, `resilience.ts` are infrastructure. **MUST NOT** put
business logic into `platform/`.

## 3. Module layout: lite by default

Start flat. A layer becomes a folder **only when it has more than one file**.

```
modules/<name>/
  routes.ts        # presentation: Fastify plugin (default export), thin handlers
  service.ts       # application: use cases, orchestration, depends on ports
  ports.ts         # application: feature-only port interfaces (only if needed)
  domain.ts        # domain: pure rules / invariants (only if needed)
  repository.ts    # infrastructure: Drizzle queries + row → contract mapping
  constants.ts     # data only
  helpers.ts       # pure functions used by this module (domain-level by nature)
```

Growing a layer:

```
modules/reviews/
  routes.ts
  service.ts
  run-executor.ts          # second application file → may become application/
  repository/              # infrastructure grew → folder (already exists here)
    review.repo.ts
    run.repo.ts
```

- **MUST** keep the dependency direction from §2 inside a flat module. "Flat" means fewer folders, not fewer rules.
- **MUST** create a layer folder (`domain/`, `application/`, `repository/` or `infrastructure/`, `http/`) only when that layer has **≥2 files**. Never scaffold empty folders.
- **MUST** register each new module explicitly in `src/modules/index.ts` (static registry, no autoload).
- **MUST NOT** import another module's internals (`../agents/repository.ts`). Cross-module data comes through a shared repository on the container, a facade (repo-intel: `modules/repo-intel/index.ts`) or an app-wide port.
- **SHOULD** name files after their role so the layer is obvious without a folder: `*.routes.ts`, `*.service.ts`, `*.repo.ts`, `*.ports.ts` once a folder holds several.
- **AVOID** a "god" `helpers.ts` mixing pure rules with DB calls. If a helper queries, it's repository code (see §14).

## 4. "Where does this go?" decision table

| Thing | Goes to |
|---|---|
| HTTP handler, route schema, rate-limit config, status codes | `modules/<m>/routes.ts` |
| Request → workspace/user context | `modules/_shared/context.ts` |
| Use case: "run review", "accept finding", "sync repo" | `modules/<m>/service.ts` |
| Pure rule / invariant / derivation (no I/O) | `modules/<m>/domain.ts` or `helpers.ts` (e.g. `pulls/status.ts`) |
| Interface a service needs, used by one module | `modules/<m>/ports.ts` |
| Interface used by ≥2 modules (new code) | `src/application/ports/<name>.ts` |
| Drizzle query, aggregate, upsert, row mapping | `modules/<m>/repository.ts` (or `repository/*.repo.ts`) |
| Table definition, migration, seed | `src/db/**` |
| Code that calls an external system (LLM, GitHub, git, ripgrep, ast-grep, embeddings, tokenizer, fs scan) | `src/adapters/<system>/<impl>.ts` |
| Test double for an adapter port | `src/adapters/mocks.ts` |
| Wiring: which implementation backs which port | `platform/container.ts` (app-wide) or the module's `routes.ts` plugin body (module-local) |
| Error type | `platform/errors.ts` (`AppError` subclasses) |
| HTTP/API contract (Zod) | `src/vendor/shared/contracts/*` **and** the client copy (root `AGENTS.md`) |
| Pure review logic (prompt, grounding, reduce) | `reviewer-core/src` (§11) |

## 5. Ports and adapters (new code)

- **MUST** declare a port in the layer that consumes it:
  - feature-only port → `modules/<m>/ports.ts` (→ `modules/<m>/application/ports.ts` once grown)
  - port shared by ≥2 modules → `src/application/ports/<name>.ts`
- **MUST** put implementations of external-system ports in `src/adapters/<system>/`. Feature data
  access (Drizzle) stays in the module's `repository.ts` over the shared `src/db/`.
- **MUST NOT** declare a new port inside an adapter file. The adapter `implements` an interface it imports.
- **MUST NOT** add new ports to `@devdigest/shared` (`src/vendor/shared/adapters.ts`). Existing
  ports there (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`,
  `SecretsProvider`, `AuthProvider`) **stay where they are**. Keep importing them from
  `@devdigest/shared`. Moving them is a separate migration task.
- **MUST NOT** let an adapter import from `modules/**`, **except the `ports.ts` file it implements**.
  Never a module's service, repository, constants or helpers. If an adapter needs a constant,
  it belongs in the port file or is passed in as an argument.
- **SHOULD** shape a port in domain terms (`listOpenPulls(repo)`), not in SDK terms
  (`octokit.rest.pulls.list(params)`). Port types are `@devdigest/shared` contract types or
  feature domain types, never SDK or Drizzle types.
- **SHOULD** keep ports small (interface segregation). A service that uses two methods of a
  ten-method port should get a two-method port.

## 6. Fastify (presentation + composition)

- **MUST** keep handlers thin: (1) input already parsed by the Zod type provider, (2) `getContext()`,
  (3) one service call, (4) return the contract shape. No Drizzle, no SDK, no loops building DTOs from rows.
- **MUST** define route `schema` with Zod contracts via `fastify-type-provider-zod`. No manual
  `Schema.parse(req.body)` in handlers (`server/AGENTS.md`).
- **MUST** treat each module as an **encapsulated plugin** (`routes.ts` default export). Module-local
  wiring (`new FooService({ repo: new FooRepository(container.db), github: container.github })`)
  happens in the plugin body, which is the module's composition root.
- **MUST NOT** `decorate` the root instance with module services. Only app-wide infrastructure
  (`container`) is shared upward with `fastify-plugin`. Encapsulation keeps modules from seeing
  each other's internals (Fastify: Encapsulation).
- **MUST** throw `AppError` subclasses from services and let the single `setErrorHandler` in
  `src/app.ts` map them to HTTP. Services never know about `reply`, status codes in responses,
  or headers.
- **SHOULD** keep cross-cutting HTTP concerns (helmet, cors, rate-limit, auth context) in
  bootstrap or hooks, and per-route limits in route `config`, never in services.
- **SHOULD** treat SSE as presentation. The application publishes `RunEvent`s to the run bus. Only
  the route knows the transport (`fastify-sse-v2`).

## 7. Zod (boundaries)

- **MUST** run Zod at boundaries only:
  - HTTP in/out: route schemas (presentation)
  - env and config: `platform/config.ts`
  - LLM structured output: `reviewer-core/src/llm/structured.ts`
  - external API payloads and JSON or file reads: inside the adapter
- **MUST NOT** import runtime `zod` (`z.object`, `.parse`, `.safeParse`) in domain code. Application
  code should not need it either. If it does, the boundary is in the wrong place.
- **MAY** use `import type { X } from '@devdigest/shared'` and `z.infer<…>` types in domain and
  application code. **Don't create parallel domain types** for things a contract already describes.
- **MUST** map only infrastructure types (Drizzle rows, SDK responses) at the repository or adapter
  boundary, into contract or domain types. Inner code never sees `typeof table.$inferSelect` or
  an Octokit response type.
- **SHOULD** parse once. Don't re-validate the same value deeper in the call chain.
- **MUST** update both contract copies (`server/src/vendor/shared`, `client/src/vendor/shared`) when a contract changes.

## 8. Drizzle + Postgres / pgvector (infrastructure)

- **MUST** import `drizzle-orm`, `src/db/schema`, `src/db/client` and `src/db/rows` only in
  repositories (`modules/<m>/repository.ts`, `repository/*.repo.ts`) and in `src/db/**` itself.
- **MUST** return contract or domain types from repository methods, mapped inside the repository.
  Row types (`AgentRow`, `PullRow`…) don't leave the repository.
- **MUST** express queries as intent-named methods (`sumCostByPr(prIds, workspaceId)`), not
  generic `query(sql)` passthroughs.
- **MUST** scope every query by `workspaceId`. The repository method takes it as a parameter, so a
  caller can't forget it.
- **SHOULD** make a use case that writes **≥2 tables atomically** own the transaction through an
  application port (`UnitOfWork.run(work)`), implemented with `db.transaction(async (tx) => …)`
  that builds tx-bound repositories. Services never call `db.transaction` directly.
  Single-statement writes need no UoW. (Sentry: Atomic Repositories)
- **SHOULD** keep pgvector similarity search, `sql` templates and raw SQL inside repository methods.
  The service asks "nearest chunks for this embedding", not "ORDER BY embedding <=> $1".
- **MUST NOT** edit applied migrations. Add new ones via `pnpm db:generate`.

## 9. External SDKs (adapters)

| Port | SDK | Adapter |
|---|---|---|
| `LLMProvider` | `openai`, `@anthropic-ai/sdk` | `src/adapters/llm/{openai,anthropic}.ts`, `reviewer-core/src/llm/openrouter.ts` |
| `GitHubClient` | `octokit` | `src/adapters/github/octokit.ts` |
| `GitClient` | `simple-git` | `src/adapters/git/simple-git.ts` |
| `CodeIndex` | `@vscode/ripgrep` | `src/adapters/codeindex/ripgrep.ts` |
| `Embedder` | `openai` | `src/adapters/embedder/openai.ts` |
| `DepGraph` | `dependency-cruiser` | `src/adapters/depgraph/` |
| `Tokenizer` | `js-tiktoken` | `src/adapters/tokenizer/` |
| ast-grep | `@ast-grep/napi` | `src/adapters/astgrep/` |
| `SecretsProvider` / `AuthProvider` | — | `src/adapters/{secrets,auth}/local.ts` |

- **MUST** import an SDK only inside its adapter. A new external system gets a new port + adapter first.
- **MUST** translate SDK errors to `ExternalServiceError` (or another `AppError`) at the adapter boundary.
- **MUST** resolve keys only through `SecretsProvider`, in the container. Adapters receive keys or
  clients via the constructor and never read `process.env`.
- **SHOULD** apply timeouts and retries in the adapter (`platform/resilience.ts`), not in services.
- **SHOULD** add a fake for every new port to `src/adapters/mocks.ts`.
- Pure, I/O-free computation libraries (`graphology`, `graphology-metrics`) **MAY** be used in
  application code. Libraries that do I/O, spawn processes or call the network go behind a port.

## 10. Composition root and DI

- **MUST** give new services their dependencies explicitly through the constructor, as one `deps` object
  of ports: `new PullsService({ pulls, runs, github })`.
- **MUST NOT** pass the whole `Container` into new services or call `new XRepository(container.db)`
  inside a service. That's a service locator, and it hides what the service depends on.
- **MUST** construct implementations only in the composition root: `platform/container.ts`
  for app-wide adapters and shared repositories, and the module plugin body for module-local ones.
- **SHOULD** in tests, construct the service directly with fakes, or use `ContainerOverrides` for
  route tests. Never patch modules.

## 11. reviewer-core

`reviewer-core` is the review engine's domain + application. It's consumed as TS source.

- **MUST NOT** import from `server/`, `src/db`, `fastify`, `node:fs` or GitHub/git SDKs. Its only side
  effect is the injected `LLMProvider`.
- **MUST** keep its SDK usage (`openai` for OpenRouter) and runtime Zod parsing of LLM output inside
  `reviewer-core/src/llm/`, its boundary folder. `grounding.ts`, `prompt.ts`, `review/`, `output/` stay pure.
- **MUST** change review logic in `reviewer-core/src`, not in the `server/src/platform/{grounding,prompt,structured}.ts` shims.

## 12. Tests per layer (vitest)

| Layer | How | Lane |
|---|---|---|
| Domain | plain inputs → outputs, no mocks, no container | unit |
| Application | service built with fakes of its ports (`adapters/mocks.ts` or inline objects) | unit, no Docker |
| Repository | real Postgres via `test/helpers/pg.ts` (testcontainers) | `*.it.test.ts` |
| Adapter | SDK client stubbed or recorded responses, never real keys | unit |
| Route | `app.inject` with `ContainerOverrides` | unit or `.it` |

- A service whose unit test needs Postgres or a real Fastify instance is a layering bug, not a test problem.
- **MUST** name any test importing `test/helpers/pg.ts` `*.it.test.ts` (`server/AGENTS.md`).

## 13. Enforcement (not active yet)

These rules are **described, not enforced** today. [templates/dependency-cruiser.example.cjs](templates/dependency-cruiser.example.cjs)
holds the forbidden-rules config for when they are enforced. In this skill:
- **MUST NOT** copy it to `server/`, add a `depcruise` script or add a CI step.
- Enforcement is a separate task: first migrate one module, generate a baseline of known violations,
  then wire `depcruise --validate` into CI.

Until then, check direction manually with the §15 checklist, or run the template ad hoc:
`pnpm exec depcruise src --config ../.claude/skills/onion-architecture/templates/dependency-cruiser.example.cjs`.

## 14. Known legacy violations (don't copy, fix when touched)

| Violation | Where (2026-11) | Correct pattern |
|---|---|---|
| Service takes `Container` and builds its repository | `reviews/service.ts`, `agents/service.ts`, `repos/service.ts`, `repo-intel/service.ts` | §10 explicit deps |
| Drizzle in routes | `pulls/routes.ts` (`costByPr`), `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts` | §6 + repository method |
| Drizzle outside repositories | `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts`, `settings/feature-models.ts` | move query to `repository.ts` |
| Row types in application | `reviews/service.ts` imports `db/rows` (`AgentRow`) | map in repository (§8) |
| Port declared in adapter | `adapters/depgraph/index.ts` (`DepGraph`), `adapters/tokenizer/index.ts` (`Tokenizer`) | §5 port in consumer |
| Adapter imports a module | `adapters/depgraph/index.ts`, `adapters/astgrep/index.ts` → `modules/repo-intel/constants.js` | pass as argument / port file |
| Service imports concrete adapters | `repo-intel/service.ts` → `adapters/astgrep`, `adapters/codeindex/extract` | inject via port (§5, §10) |
| Cross-module internal import | `repos/service.ts` → `modules/repo-intel/constants.ts` | facade / app-wide port |
| Import cycles | `repo-intel/service.ts`, `repo-intel/pipeline/*`, `agents/helpers.ts` | break when touched |
| Ports in a contracts package | `vendor/shared/adapters.ts` | stays for now (separate migration) |

A run of the template on 2026-11-25 reported **34 errors + 5 circular warnings** in `server/src`.
That's the expected starting baseline.

When you touch one of these files for a feature, fix the violation **in the code you change**,
and only if it's small. Otherwise follow the existing pattern locally and leave the
module-wide migration for its own task (consistency over a half-migrated module).

## 15. Review checklist

- [ ] Each new file sits in the layer §4 says. No empty layer folders. A folder appears only with ≥2 files.
- [ ] Domain code has no runtime `zod`, `drizzle-orm`, `fastify`, SDK, `node:fs` or `db/*` imports. Types from `@devdigest/shared` are `import type`.
- [ ] Services get ports through a `deps` constructor object. No `Container` and no `new *Repository` inside.
- [ ] Routes: Zod schema, `getContext`, one service call, return the contract. No Drizzle, no SDK.
- [ ] `drizzle-orm` / `db/*` imported only in repositories and `src/db`. Repositories return contract or domain types and take `workspaceId`.
- [ ] Multi-table atomic writes go through a `UnitOfWork` port, not `db.transaction` in a service.
- [ ] New external system = port in the consumer layer + adapter in `src/adapters/<system>/` + fake in `mocks.ts`.
- [ ] No new ports in `@devdigest/shared`. No port declared inside an adapter. No adapter importing `modules/**` beyond the port file it implements.
- [ ] SDK errors become `AppError` in the adapter. Secrets come only via `SecretsProvider`.
- [ ] No cross-module internal imports. Modules talk through shared repositories, facades or app-wide ports.
- [ ] New module registered in `src/modules/index.ts`. A contract change is made in both shared copies.
- [ ] Application tests run without Docker. Repository tests are `*.it.test.ts`.
- [ ] No legacy violation from §14 copied into new code.
