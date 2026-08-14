---
name: onion-architecture
description: "Onion Architecture for the backend (`server/` + `reviewer-core/`). Use when adding or restructuring a server module, deciding where business logic / persistence / adapter code lives, defining a new port or adapter, wiring dependencies, placing validation, choosing transaction boundaries, placing background jobs or streamed run events, deciding where config and secrets are read, or choosing what kind of test to write. Structural decisions only — Fastify mechanics live in `fastify-best-practices`, query idioms in `drizzle-orm-patterns`, schema idioms in `zod`, physical schema design in `postgresql-table-design`."
version: 1.0.0
---

# Onion Architecture (backend)

Which ring code belongs in, and which way imports may point, in `server/` and
`reviewer-core/`. Distilled from ~45 sources (Palermo, Cockburn, Martin, Fowler,
official Fastify/Drizzle/Zod docs, Node.js Best Practices, maintainer talks) —
every claim is sourced in [README.md](README.md).

Sibling skills — do not duplicate their territory:
- `fastify-best-practices` — plugins, hooks, lifecycle, serialization mechanics
- `drizzle-orm-patterns` — query, relation, and migration idioms
- `zod` — schema authoring idioms
- `postgresql-table-design` — physical schema, indexes, constraints
- `frontend-ui-architecture` — the client-side counterpart of this skill

## Core Principles

1. **Dependencies point inward, always.** Code may depend on layers more central
   than itself; nothing may depend on a layer further out. This is the one rule
   the other twelve are consequences of.
2. **The domain is the center; Postgres, Fastify, GitHub, and the LLM SDKs are
   external details.** The database is not the center — it is a plugged-in
   device, and so is the web framework.
3. **Inner layers define interfaces, outer layers implement them.** A port is a
   specification owned by the core; the adapter lives at the edge. Test doubles
   are adapters like any other.
4. **The core must compile and run with no infrastructure present.**
   `reviewer-core` is the proof: it has exactly two dependencies (`zod`,
   `openai` for types), no DB, no filesystem, no `process.env`. If a change to
   it would break that, the change belongs in `server/`.
5. **Package by module, layer inside the module.** The repo root is organized by
   domain (`modules/agents`, `modules/reviews`), not by technical layer. Layers
   are the structure *inside* a module, never the top-level folder scheme.
6. **The number of rings is not the point.** Sources give three, four, or five.
   Consensus exists on direction, not on count — do not add a layer because a
   diagram has one.

## Layer Map

The normative reference for "where does this go".

| Ring | Holds | Lives in |
|---|---|---|
| Domain core | Review pipeline, prompt assembly, grounding, structured output; pure module logic | `reviewer-core/src`, `modules/*/helpers.ts`, `modules/reviews/findings.ts` |
| Ports (core-owned interfaces) | `LLMProvider`, `GitClient`, `GitHubClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`; module facades | `vendor/shared/adapters.ts`, `modules/repo-intel/types.ts` (`RepoIntel`) |
| Application services | Orchestration, transaction boundaries, job registration, event emission | `modules/*/service.ts`, `modules/reviews/run-executor.ts` |
| Persistence adapters | Drizzle queries, row→domain mapping | `modules/*/repository.ts` (+ `repository/` split by aggregate) |
| Driven adapters | octokit, simple-git, ripgrep, ast-grep, OpenAI/Anthropic/OpenRouter, tiktoken, dependency-cruiser | `adapters/*` |
| Driving adapters | HTTP routes, SSE streams, job handlers | `modules/*/routes.ts`, the callbacks passed to `jobs.register` |
| Composition root | Config parsing, container wiring, job runner, run bus, error handler | `platform/config.ts`, `platform/container.ts`, `platform/jobs.ts`, `platform/sse.ts`, `app.ts` |

- **`platform/prompt.ts`, `platform/grounding.ts`, `platform/structured.ts` are
  re-export shims** over `reviewer-core`. They exist so server code imports one
  path; fix the engine, never the shim.
- **`platform/` is composition-root territory, not a junk drawer.** Something
  belongs there when the whole app needs one instance of it. A rule that only
  one module needs belongs in that module.

## Module Anatomy & the Promotion Ladder

A module grows layers as it earns them; it does not start with all of them.

| Stage | Files | Promote when |
|---|---|---|
| 1 — routes-only | `routes.ts` | — |
| 2 — + service | `+ service.ts` | a business rule appears, a second caller needs the same operation, or the handler exceeds "parse, delegate, map" |
| 3 — + repository | `+ repository.ts` | the module owns tables, or a query is issued from more than one place |
| 4 — split repository | `repository.ts` facade + `repository/*.repo.ts` | the repository covers several aggregates (`modules/reviews/` is the worked example) |

- **Routes-only is a legitimate resting stage**, not debt. `polling/` and
  `workspace/` are correct at stage 1.
- **What is not legitimate is skipping a stage you have already outgrown.** Four
  of eight modules currently import `drizzle-orm` and `db/schema` directly in
  `routes.ts` (`polling`, `pulls`, `settings`, `workspace`); `pulls` is stage-3
  work living in a stage-1 file. Adding to those files, add the layer.
- **Supporting files per module:** `constants.ts` (kinds, limits, job names),
  `helpers.ts` (pure mapping and rules), `types.ts` (the module's port when it
  exposes a facade). Anything importable by another module goes through the
  container, never by reaching into a sibling module's folder.
- **Cross-module access is via the container** (`container.agentsRepo`,
  `container.repoIntel`). A module importing `../otherModule/service.js`
  couples two domains at the source level; the container makes the dependency
  a wiring decision instead.

## Thin Routes

A handler does four things in order: **parse → resolve context → delegate → map**.

- **Validation is schema-first.** Declare `schema.params` / `schema.body` with
  zod via `fastify-type-provider-zod`; invalid input is rejected before the
  handler runs. Never hand-roll `Schema.parse(req.body)` inside a handler.
- **`request` and `reply` never travel inward.** A service takes plain values.
  If a service signature mentions Fastify, the layering is already broken —
  the exception is `getContext(container, req)` in `modules/_shared/context.ts`,
  which exists precisely so the adaptation happens in exactly one place.
- **Every route resolves tenancy through `getContext`**, then passes
  `workspaceId` down. Workspace scoping is a service/repository argument, not
  something the DB layer infers.
- **Declare `schema.response`.** It is an output *allowlist* — it strips fields
  the handler did not promise, which is a security boundary, not a formality.
  No route in this repo declares one today, so the serializer compiler wired in
  `app.ts` currently compiles nothing. New routes should declare it.
- **Errors are thrown, not shaped.** Throw `NotFoundError` / `ValidationError` /
  `ExternalServiceError` from `platform/errors.ts`; the single error handler in
  `app.ts` maps them to status codes. A handler building its own error body
  duplicates a decision made once.
- **DTO mapping happens at the edge**, in `helpers.ts` (`toAgentDto`), not in
  the service and never by returning a Drizzle row.

## Ports & Adapters

**The test for "is this an adapter?": does the code leave the process?** Network,
disk, subprocess, clock, randomness. If it does not, it is core logic wherever it
currently sits — `adapters/git/diff-parser.ts` (`parseUnifiedDiff`) and
`adapters/codeindex/extract.ts` (`extractEndpoints`) are pure functions filed
under `adapters/`, and a service importing them is not a layering violation.
Classify by behavior, not by folder.

Adding a new external tool, in order:

1. **Define the port first** — an interface in `vendor/shared/adapters.ts` for
   app-wide capabilities, or in the module's `types.ts` for a module-scoped
   facade. It is written in the vocabulary of the caller, not of the library.
2. **Implement it in `adapters/<capability>/<impl>.ts`.** The SDK's types stay
   inside that file. This is an anti-corruption layer: its job is to translate a
   vendor's model into ours so a vendor change lands in one file.
3. **Add a test double in `adapters/mocks.ts`** implementing the same interface.
   If writing the mock is awkward, the port is shaped like the library instead
   of like the need.
4. **Wire it in `platform/container.ts`** as a lazy getter, and add the override
   slot to `ContainerOverrides`.

- **A port earns its keep in exactly two cases:** the thing behind it is outside
  your control (anti-corruption), or a second implementation is realistic.
  `LLMProvider` scores on both — three providers today, all with different SDKs.
  A one-implementation wrapper over your own code scores on neither: inline it
  and depend on the concrete module.
- **`vendor/shared/` is the canonical copy**, hand-mirrored into
  `client/src/vendor/shared/` with no sync script. Changing a port here means
  porting the delta by hand — see the root `INSIGHTS.md`.
- **Adapter resilience is the adapter's business.** Retries, timeouts, and
  backoff (`platform/resilience.ts`) wrap the edge; a service must not encode
  "this provider is flaky".

## Persistence

- **Repositories are the only code that touches the DB for their domain**, and
  they are domain-shaped, not table-shaped: methods read like the ubiquitous
  language (`markReviewed`, `setFindingDismissed`), not `findByXAndY`.
- **Drizzle row types stop at the repository boundary.** A `$inferSelect` type in
  a route signature or an API response makes the wire contract a mirror of the
  physical schema, so a column rename becomes a breaking API change. Map to the
  contract types from `@devdigest/shared`.
- **The caller owns the transaction; the repository receives it.** Start
  `db.transaction()` in the service and pass the typed handle down as an
  optional last parameter — repositories never call `db.transaction()`
  themselves, because only the caller knows what the unit of work is.
- **Nothing in this repo currently runs in a transaction.** The
  `insertReview → insertFindings → markReviewed` sequence in
  `modules/reviews/run-executor.ts` and the `delete`+`insert` of `pr_files` /
  `pr_commits` in `modules/pulls/routes.ts` are the two places that need one.
  Treat this section as prescriptive, not descriptive.
- **A repository query that is issued from a second module means the entity is
  shared** — construct the repository in the container (as `agentsRepo` and
  `reviewRepo` already are) rather than instantiating it per module.

## Validation

Two kinds of validation, both mandatory, at different rings:

| | Transport validation | Domain invariants |
|---|---|---|
| Where | route schema, at the edge | inside the core |
| Input is | untrusted | already parsed |
| A failure means | the caller sent something wrong | **a bug in our code** |
| Result | 4xx (422 here) | throw |

- **Parse, don't validate.** The boundary consumes loose input and produces a
  typed value; inner layers accept only that type and never re-check its shape.
  A service that defensively re-validates its arguments is a symptom of the
  boundary not being trusted.
- **Check once, at the edge.** Validation scattered through processing steps is
  the failure mode the literature calls shotgun parsing.
- **Invalid input is not exceptional** — it is an expected outcome with a status
  code. An invariant violation *is* exceptional, and swallowing it hides a bug.
- Zod at the boundary makes the schema the single source of truth for both the
  runtime check and the static type (`z.infer`). Do not maintain a hand-written
  interface next to a schema that already describes it.

## Config & Secrets

- **Exactly two files may read `process.env`:** `platform/config.ts` (parses the
  environment once, at boot, through a zod schema) and
  `adapters/secrets/local.ts` (the `SecretsProvider` fallback). Everything else
  receives config as a value.
- **Secrets are not config.** API keys and `GITHUB_TOKEN` go through
  `SecretsProvider` — not `AppConfig`, not the DB, not the environment read
  directly. The port exists so the storage (a `0600` file today) can change
  without touching feature code.
- **Config is a composition-root argument.** A service reading a feature flag
  from a global cannot be tested with that flag flipped; take it as a
  constructor value or read it off the container.
- The codebase should be publishable open-source at any moment without leaking a
  credential — that is the practical test for whether something is config or a
  secret.

## Dependency Injection

- **One composition root.** `platform/container.ts` constructs everything; it is
  the only place that knows which concrete class satisfies which port. Its
  lazy getters exist so an unused adapter never demands a key at boot.
- **Tests inject through `ContainerOverrides`,** not by mocking modules.
  Module-level mocking couples the test to the import graph; passing an object
  that satisfies the interface tests the seam the architecture already has.
- **No DI framework at this size.** Containers earn their keep at dozens of
  services or when per-request scoping and disposal are needed. Manual wiring in
  one file is the consensus for an app this size — a container is optional
  tooling, not part of the pattern.
- **Fastify decorators are legitimate DI at the delivery ring only.** Below it,
  dependencies are constructor arguments, so a service's needs are visible in
  its signature rather than resolved from an ambient registry.
- **Existing services take the whole `Container`** (`constructor(private
  container: Container)`). It is a type-only import and it keeps override-based
  testing working, so it is not worth a sweeping refactor — but a **new** service
  should take the capabilities it actually uses, because a wide dependency hides
  what a class touches and makes its tests over-provision.

## Async Work: Jobs, Queues, Streams

- **A job handler is a driving adapter, exactly like a route handler.** It may
  adapt a payload and call a service; it may not hold business rules. The
  callbacks registered in `modules/repos/service.ts` and
  `modules/repo-intel/service.ts` are the boundary — the work belongs in the
  methods they call.
- **`enqueue` is the port; the queue is infrastructure.** `p-queue`,
  concurrency, timeouts, retries, and the `jobs` table are `platform/jobs.ts`'s
  private business. A caller says *what* should happen later, never *how* it is
  scheduled.
- **Services emit run events through the injected bus** (`container.runBus`);
  only `routes.ts` touches `reply.sse`. The producer must not know whether
  anyone is listening — that is what makes the same run executable from CI with
  no HTTP connection attached.
- **Cancellation is a checkpoint the core reads, not a transport concern.**
  `run-executor.ts` polls `runBus.isCancelled(runId)` between units of work;
  the HTTP layer only sets the flag.
- **Events emitted before the write commits can outlive a rollback.** The bus is
  in-memory, so a crash loses buffered events by construction; anything that
  must survive is persisted (the run trace is written as one document on
  completion). If a future event must be delivered exactly once, the pattern to
  reach for is a transactional outbox, not a bigger buffer.

## Testing Shape

The test suite mirrors the architecture: **a honeycomb, not a pyramid** — many
integration tests through the module's own edges, few implementation-detail unit
tests.

- **Unit-test the pure core with no mocks.** `reviewer-core` and `helpers.ts` /
  `findings.ts` are pure by construction — if a test there needs a mock, the
  code under test is not actually core.
- **Integration-test through the API with a real Postgres.** Name DB-backed
  tests `*.it.test.ts`; that suffix is what splits the lanes. Testcontainers
  gives the same DB product as production — never mock the database.
- **A DB-backed test not named `*.it.test.ts` runs in the unit lane** and fails
  on any machine without Docker. Conversely, integration tests self-skip without
  a Docker daemon, so a green `pnpm test` is not proof the DB paths ran.
- **Fake other people's services, not your own code.** GitHub, the LLM
  providers, and the git binary get mocks from `adapters/mocks.ts`; your own
  service and repository do not.
- **The mock set is an adapter set.** When a port changes, `mocks.ts` must
  change with it — that compile error is the architecture doing its job.

## When NOT to Layer

The pattern is for behavior-rich modules, not for everything.

- **Onion is explicitly not for small applications** — its author excludes them
  by name. A module that reads a row and returns it has no domain to protect.
- **CRUD can be simpler.** Layer where significant business rules exist; a
  pass-through service that only forwards to a repository is ceremony, and the
  honest alternative is a transaction script in the service with no domain
  objects at all.
- **An anemic domain model incurs the cost of a domain model with none of the
  benefits.** If the "domain objects" are data bags, do not add a mapper layer
  to move data between three shapes of the same record.
- **Full transport/domain separation is a large effort** — prioritize a real
  domain boundary over a complete set of rings. Fastify's own reference apps
  demonstrate *less* layering than this repo already has; a codebase with
  `adapters/` and a container is a deliberate step beyond the baseline, and each
  further step needs its own justification.
- **Per-module choice is allowed.** Minimize coupling between modules, maximize
  cohesion inside one, and let a simple module stay simple.

## Enforcement

Convention that nothing checks is convention that drifts. `dependency-cruiser` is
already a `server/` dependency (it runs in-process as the depgraph adapter), so a
rules file costs no new dependency; `eslint` + `typescript-eslint` are installed
but have no config yet. The rules worth mechanizing, as `forbidden` entries:

| Rule | `from` → `to` |
|---|---|
| The core stays pure | `^reviewer-core/src` → `^server/src` |
| Transport never queries | `^src/modules/[^/]+/routes\.ts$` → `^src/db/schema` or `drizzle-orm` |
| No cross-module imports | `^src/modules/([^/]+)/` → `^src/modules/([^/]+)/` with `pathNot: ^src/modules/$1/` (allow `_shared/`) |
| The container is wired, not reached for | anything except `app.ts`, `modules/*/routes.ts`, `modules/*/service.ts` → `platform/container.js` |
| One env chokepoint | anything except `platform/config.ts`, `adapters/secrets/` → `process.env` |

Group matching with a `$1` back-reference expresses the cross-module rule in a
single entry; `reachable: true` covers transitive violations. Add a rule when a
review catches the same violation twice — not preemptively for rules nobody has
broken.

## Known Judgment Calls

Where respected sources genuinely disagree — decide per case, and do not present
either side as law:

- **Repository over a thin ORM.** Drizzle is deliberately close to SQL, and an
  ORM context is arguably already a repository. The weak justification is
  "swap the database"; the strong ones are a testing seam and aggregate
  encapsulation.
- **How many rings.** Three, four, or five depending on the author. Direction is
  the invariant; count is taste.
- **A separate domain model vs. the persistence model.** Two models plus mappers
  pay off only when there is real behavior to protect; otherwise inferred types
  plus a service is cheaper and more honest.
- **Transaction propagation:** passing an explicit `tx` handle (visible, threads
  a parameter through signatures) vs. AsyncLocalStorage (clean signatures,
  implicit, framework-coupled). Explicit passing is the better-documented
  Drizzle pattern.
- **Decorators as DI vs. explicit parameters** — anything reachable through
  `fastify.x` is a service locator; the resolution used here is to allow it at
  the delivery ring only.
- **Container-wide injection vs. narrow dependencies** — this repo does the
  former (see *Dependency Injection*); both are defensible, mixing them
  arbitrarily is not.
- **Uniform layering vs. per-module choice** — vertical slices argue every
  feature picks its own internals; the middle position (modules outside, layers
  inside where warranted) is the one this repo already embodies.
