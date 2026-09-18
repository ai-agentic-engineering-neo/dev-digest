---
name: onion-architecture
description: "Backend architecture and layering for @devdigest/api (`server/`) — Onion / ports-and-adapters: which ring a piece of code belongs to, and which imports it may make. Use this skill whenever you are adding or changing a route, service, repository, adapter, DB query, port interface or container wiring in `server/src`; deciding where a query, helper, type or constant belongs; wiring a new dependency; splitting a route that has grown; or reviewing backend code for layer violations — even when the user only says 'where should this query go', 'this route is getting big', 'clean this up' or 'is this the right place for it'. It decides placement and dependency direction; it does not cover Fastify APIs (see fastify-best-practices), Drizzle query syntax (see drizzle-orm-patterns), schema design (see postgresql-table-design) or contract shape (see zod)."
version: 1.0.0
metadata:
  tags: architecture, onion, ports-and-adapters, layering, fastify, drizzle, dependency-rule, backend
  authored: local
  researched: 2026-09-18
---

# Onion Architecture

Placement and dependency-direction decisions for `@devdigest/api` (`server/`):
which ring a piece of code belongs to, which imports it may make, and how that
is enforced mechanically rather than by hope.

Companion files:
- `examples.md` — ✅/❌ pairs for every rule with a shape worth seeing, taken from real files in this repo.
- `README.md` — the sources this skill is built from, with dates and trust tiers.
- `server/.dependency-cruiser.cjs` — the machine-checkable half. Run it with `cd server && pnpm arch`.

## Scope, and what this deliberately leaves alone

This skill answers **where**. Other skills answer **what** and **how**:

| Question | Skill |
|---|---|
| Where does this backend code live? Which import may it make? | **this one** |
| Same question for React/Next UI | `frontend-ui-architecture` |
| How does this Fastify API behave? | `fastify-best-practices` |
| How do I write this Drizzle query / migration? | `drizzle-orm-patterns` |
| How should this table be shaped and indexed? | `postgresql-table-design` |
| How should this contract be validated? | `zod` |

Scope is `server/` only. `reviewer-core/` already has a stronger invariant of its
own (ZERO I/O, stated in its `CLAUDE.md`) and needs no second set of rules;
`client/` is `frontend-ui-architecture`'s.

## Read this first: say which kind of rule you are invoking

Not every rule below carries the same authority, and presenting a convention as
a hard rule shuts down a decision the team is entitled to make differently. Each
rule is tagged:

- **[Framework]** — Fastify, Drizzle or TypeScript works this way. Violating it breaks something.
- **[Convention]** — Onion / ports-and-adapters as an industry practice. Defensible, not vendor-mandated.
- **[House]** — this repo's own choice, written in `server/CLAUDE.md`. Match it.

Onion Architecture itself is a **convention**: Jeffrey Palermo's 2008 framing of
"all coupling points toward the centre", which Herberto Graça later showed is
the same rule as Ports & Adapters and Clean Architecture with different ring
names. Node gives you no mechanism to enforce it — TypeScript will happily
compile an import from any ring into any other — which is exactly why the
`pnpm arch` half of this skill exists.

## The one principle everything else falls out of

**Dependencies point inward. The inner ring declares the interface; the outer
ring implements it.**

Every rule below is a specialisation of that sentence. When two rules seem to
conflict, this is the tiebreaker. Its value is not tidiness — it is that the
review pipeline's logic can be tested without Postgres, GitHub or an LLM key,
and that swapping an adapter is a container edit rather than a refactor.

The failure mode it prevents is the one that kills most "clean architecture"
attempts: **treating the folder layout as the architecture**. Folders here are
vertical slices (`modules/<name>/`), and `repository.ts` sits inside the slice
while belonging to the infrastructure ring. The ring is decided by the
*filename and its imports*, not by the folder.

## The rings in this codebase

| Ring | What lives there | May import |
|---|---|---|
| **L0 core** | `vendor/shared/**` (Zod contracts + port interfaces), `modules/*/helpers.ts`, `pulls/status.ts`, `reviews/findings.ts`, `platform/grounding.ts`, `platform/prompt.ts`, `@devdigest/reviewer-core` | `zod`, `platform/errors.ts`, `db/rows.ts` (types only), other L0 |
| **L1 ports** | `vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `SecretsProvider`, `AuthProvider`, `CodeIndex`, `Embedder`), `repo-intel/types.ts` (`RepoIntel`), `Tokenizer`, `DepGraph` | L0 |
| **L2 services** | `modules/*/service.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repo-intel/pipeline/**` | L0, L1, `type { Container }`, `platform/{errors,jobs,sse}` |
| **L3 infrastructure** | `adapters/**`, `db/**`, `modules/*/repository.ts` | L0, L1, `db`, its own SDK |
| **L4 composition root** | `platform/container.ts`, `app.ts` | everything |
| **L5 entry** | `modules/*/routes.ts`, `modules/index.ts`, `modules/_shared/context.ts` | L0, L2, `container` |

L4 sits outside on purpose: the composition root is the one place allowed to
know every concrete class, because knowing them is its entire job.

## Where a piece of backend code goes

Work down this list and stop at the first match.

1. **It talks to Postgres** → `modules/<name>/repository.ts` (or a file under `repository/`). No exceptions that aren't already in *Known debt*.
2. **It talks to something outside the process** (GitHub, an LLM, git, the filesystem, a tokenizer) → an adapter under `adapters/`, behind an interface in `vendor/shared/adapters.ts`.
3. **It is a pure transform** — row → DTO, rollup, parse, format, score → `helpers.ts` (or the module's named pure file: `status.ts`, `findings.ts`).
4. **It is a literal** — limit, timeout, default, regex, table of model names → `constants.ts`. Every literal, including the ones that look obvious.
5. **It decides or orchestrates** — what happens, in what order, under what conditions → `service.ts`.
6. **It is HTTP** — schema, status code, SSE stream, request/response shape → `routes.ts`.
7. **It is a contract two packages share** → `vendor/shared/contracts/`, in **both** physical copies.

A `routes.ts` should read as: resolve context → validate → call one service
method → return. When a handler starts building a query or branching on
business conditions, steps 1 and 5 were skipped.

## The rules

1. **[Convention] Dependencies point inward, never outward.** L0 never imports L2/L3/L5.
2. **[House] All persistence lives in `repository.ts`.** No `drizzle-orm` import, no `db/schema`, no raw SQL anywhere else. A query in a handler hides tenancy scoping and pins the storage model to a URL.
3. **[House] Fastify types stay in `routes.ts`.** A service that imports `fastify` cannot be called from a job, a script or a test without inventing a request. The only other file allowed to touch it is `modules/_shared/context.ts`.
4. **[House] Take dependencies from the container, never import a concrete adapter.** `container.github()`, not `new OctokitGitHubClient()`. Importing the class defeats `ContainerOverrides`, which is how every test swaps a mock (`src/adapters/mocks.ts`). The one thing a service *does* construct is its own slice's repository, from `container.db` — that is this module's code, and tests swap the database rather than the class.
5. **[Convention] `helpers.ts` / `status.ts` / `findings.ts` are the functional core.** Pure functions over values: no I/O, no `container`, no ORM. They may import row *types* from `db/rows.ts` — a mapper needs the row shape — but never `db/schema` itself. This is the part that unit-tests without Docker.
6. **[House] The Zod contract is the boundary.** A Drizzle row does not leave `repository.ts`; `helpers.ts` maps it to the DTO from `vendor/shared/contracts/`. A route declares `schema.body` / `schema.params` and lets the type provider validate and serialise — never `Schema.parse(req.body)` by hand.
7. **[Convention] Errors are translated at the ring boundary.** A repository raises `AppError` / `NotFoundError` from `platform/errors.ts`; a Postgres error code never travels outward. Callers should not need to know what stores the data.
8. **[House] Tenancy is a domain invariant, not a WHERE clause you remember.** Every handler starts with `getContext(container, req)`. Tables without their own `workspace_id` (`findings`, `pr_*`, `run_traces`) are scoped by joining to the parent that has one — `server/INSIGHTS.md` (2026-09-17) documents the trap.
9. **[House] Secrets come from `container.secrets`; `process.env` is read only in `platform/config.ts`.** After storing a key, call `container.invalidateSecretCaches()` or the cached client keeps the old one.
10. **[Convention] Modules are slices, not a namespace to reach into.** No `modules/a/**` → `modules/b/**` import. Shared entities come from the container (`container.agentsRepo`, `container.reviewRepo`); shared code goes to `modules/_shared/`.

## Ports and the container

A port is an interface written for what the *inside* needs, not a mirror of the
SDK outside. `GitHubClient` in `vendor/shared/adapters.ts` speaks in PRs,
comments and reviews — not in Octokit responses. That is what makes
`MockGitHubClient` a four-line class instead of an HTTP fixture.

The container's shape encodes a distinction worth preserving when you add to it:

- **Sync getters** (`container.git`, `container.codeIndex`, `container.repoIntel`, `container.agentsRepo`) — constructible from config alone.
- **Async methods** (`container.github()`, `container.llm(id)`, `container.embedder()`) — need a secret, so resolving them is I/O and must be awaited.

Wiring a new dependency, in order: interface in `vendor/shared/adapters.ts` →
implementation under `adapters/` → field in `ContainerOverrides` → lazy
getter/method on `Container` → mock in `adapters/mocks.ts`. Skip the override
and the dependency becomes untestable the moment something real sits behind it.

Fastify's own plugin system is a DI mechanism (`decorate` + encapsulation), and
`app.ts` uses exactly one decoration — `app.decorate('container', container)`.
Resist adding a second: two competing injection mechanisms is how a codebase
ends up with services resolved three different ways.

## Persistence: repository, rows, DTOs

Drizzle is a typed query builder, not an entity mapper — there is no ORM layer
that would isolate you by itself, which is precisely why the repository boundary
has to be deliberate. Three consequences:

- Repository methods are named for **domain operations**, not column updates: `completeAgentRun`, `linkSkills`, not `updateColumns`.
- Row types are inferred once in `db/rows.ts` and re-exported by the owning repository. A helper that needs a row shape imports it from `db/rows.ts` directly — importing it *through* another module's repository creates a cycle (see *Known debt*).
- Raw SQL is a special case: `typecheck` cannot see inside `sql.raw(...)`, so a wrong column name reaches production as a runtime `42703`. The only raw query in `src/` is parameterised, in `repo-intel/repository.ts`; a new one needs an `.it.test.ts` proving its columns exist.

The counter-argument is real and worth knowing: with a query builder the
repository pattern can degenerate into a thin, leaky wrapper. The reason it
earns its keep *here* is tenancy and testability, not purity — the workspace
scope and the mock seam both live at that boundary.

## Testing follows the rings

The ring a file sits in decides the kind of test it gets, and the split is
already wired into the filename convention:

| Ring | Test | File |
|---|---|---|
| L0 core, pure helpers | unit, no Docker, no mocks | `test/*.test.ts` |
| L2 services | `buildApp({ overrides })` + `app.inject()` with mocks from `adapters/mocks.ts` | `test/*.test.ts` |
| L3 repositories, raw SQL | testcontainers Postgres | `test/*.it.test.ts` |

If a "unit" test needs Docker, the code under test is in the wrong ring — that
is the cheapest signal this architecture gives you, and it fires before review.

## Enforcement — pick the cheapest tier that fits

A boundary that lives only in documentation decays. Ordered by cost; take the
first tier that expresses what you need and do not stack them.

| Tier | Tool | Use when |
|---|---|---|
| 1 | Review checklist (below) | A one-off judgement call: does this belong in the service or the helper? |
| 2 | `grep` on the diff | Things the import graph cannot see: `process.env`, `sql.raw`, a row shape escaping a repository. |
| 3 | `pnpm arch` (dependency-cruiser) | Anything expressible as "file X may not import Y". Already configured, already green — keep it that way. |
| 4 | TypeScript project references | You want the compiler, not a linter, to refuse. Fits the four-package split, not folders inside `server/`. |

`server/.dependency-cruiser.cjs` holds eight rules: `core-is-pure`,
`pure-helpers-stay-pure`, `orm-only-in-repository`,
`http-framework-only-in-routes`, `no-concrete-adapter-in-modules`,
`no-vendor-sdk-outside-adapters`, `no-cross-module-import`, `no-circular`.
`cd server && pnpm arch` is a few seconds and exits non-zero on a violation.

Three configuration details it depends on — do not "tidy" them away:

- `tsPreCompilationDeps: true` — otherwise `import type` crossings are invisible, and half these rules check exactly those.
- `node_modules` is **not** excluded — excluding it silently disables every rule about an npm package (drizzle, fastify, the SDKs), and the run still reports success.
- `no-circular` uses `viaNot` on the container: a service importing `type { Container }` while the container constructs that service is the composition root working correctly, not a cycle to break.

What it structurally cannot check, and therefore belongs in the grep pass:
`process.env` outside `config.ts`, a missing `getContext()`, raw SQL column
names, and a Drizzle row escaping a repository through a DTO that was never
mapped.

## Recipe: a new module, ring by ring

1. **Contract** — request/response Zod schemas in `vendor/shared/contracts/<name>.ts`, added to **both** copies of `vendor/shared`.
2. **Port** — only if the feature needs something outside the process: interface in `vendor/shared/adapters.ts`, implementation under `adapters/`, mock in `adapters/mocks.ts`, field in `ContainerOverrides`, accessor on `Container`.
3. **Schema** — table in `db/schema/<name>.ts` (snake_case SQL, camelCase key), re-exported via `db/schema.ts`; row type in `db/rows.ts`; `pnpm db:generate`, never a hand-edited migration.
4. **Repository** — `modules/<name>/repository.ts`, workspace-scoped, domain-named methods, `AppError` on failure.
5. **Helpers + constants** — `helpers.ts` for row → DTO and any pure transform, `constants.ts` for every literal.
6. **Service** — `modules/<name>/service.ts`, constructor takes `Container`, orchestration only.
7. **Routes** — `modules/<name>/routes.ts`: `getContext` → `schema` → one service call.
8. **Register** — one import plus one entry in `modules/index.ts` (registration is static; there is no autoload).
9. **Verify** — `pnpm arch && pnpm typecheck && pnpm test`.

## Known debt

These files break the rules today and are allowlisted in
`.dependency-cruiser.cjs` so that *new* violations stand out. Do not add to the
lists. When you touch one of these files for another reason, the expectation is
that you move its persistence into a repository and delete its line — and if
that is out of scope for your task, say so rather than extending the pattern.

- **DB access outside a repository** — `pulls/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`, `settings/routes.ts`, `settings/feature-models.ts`, `repos/helpers.ts`, `reviews/diff-loader.ts`, `reviews/run-executor.ts`. `pulls`, `polling` and `workspace` have no `service.ts`/`repository.ts` at all — a query there goes straight from HTTP to SQL.
- **`repos/helpers.ts` imports `db/schema`** although its own docblock promises "pure functions only — no I/O, no DB, no container".
- **Cycle `agents/repository.ts` ↔ `agents/helpers.ts`** — the helper takes its row types *through* the repository. One-line fix when next touched: `import type { AgentRow } from '../../db/rows.js'`.
- **`repos/service.ts` imports `repo-intel/constants.ts`** — a cross-module import of constants only.
- **Ports declared inside `adapters/`** — `Tokenizer` and `DepGraph` live next to their implementations instead of in `vendor/shared/adapters.ts`. Importing the *interface* from there is fine and allowlisted; importing the class is not.
- **Pure functions under `adapters/`** — `git/diff-parser.ts`, `codeindex/extract.ts`, `astgrep/index.ts` do no I/O and are core code in an infrastructure folder. Allowlisted; leave them alone unless you are already refactoring that area.

## Where the ecosystem genuinely disagrees

Do not paper over these. Say it is contested, give the trade-off, follow the codebase.

- **Repository pattern over a query builder.** Advocates: a swappable, domain-named seam. Critics: with Drizzle it is often a thin wrapper that buys nothing. Here it buys workspace scoping and the mock seam — that is the argument to make, not purity.
- **How many rings.** Palermo's four, Clean's four, Ports & Adapters' two. They are the same rule with different vocabularies; extra ring names are a cost, not a free upgrade.
- **Rich domain entities vs pure functions over data.** Classic Onion assumes entities with behaviour; this codebase is functional-core/imperative-shell — pure functions in `helpers.ts`, values from contracts. Do not introduce entity classes into a module that has none.
- **Where DTO mapping belongs.** Repository vs a dedicated mapper vs the service. House answer: `helpers.ts`, because it keeps the mapping unit-testable.

## Review checklist

When reviewing backend structure — a PR, or your own work before proposing it:

- Does any `routes.ts` build a query, or branch on business conditions?
- Does every handler start with `getContext()`, and does every query reach `workspace_id` — directly or through a join?
- Is there a `new SomeAdapter()` where `container.<thing>` would do?
- Does a service or repository import `fastify`?
- Did a Drizzle row escape `repository.ts` without being mapped to a contract DTO?
- Is a literal sitting inline instead of in `constants.ts`?
- Does a new `helpers.ts` function do I/O, or take the container?
- Does a new port have a mock and a `ContainerOverrides` field?
- Was a contract changed in only one copy of `vendor/shared`?
- Does `pnpm arch` still pass, and did the allowlist grow?

## In DevDigest specifically

- **Modules register statically** in `src/modules/index.ts` — a new module is a file plus one import and one entry. There is no autoload.
- **Layer filenames are fixed**: `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`. Anything else is a kebab-case module (`diff-loader.ts`, `run-executor.ts`), and a folder (`reviews/repository/`) when one file stops being enough.
- **`@devdigest/shared` exists in two physical copies** (`server/src/vendor/shared/`, `client/src/vendor/shared/`) that have already drifted. Change a contract → change both in the same commit. `reviewer-core` reads the server copy.
- **`vendor/**` is vendored** — read it, do not edit it except when changing a contract.
- **`_` means private to its parent** (`modules/_shared/`, `db/schema/_shared.ts`). Never import one from outside.
- **Migrations never run on boot**; `relation ... does not exist` means `pnpm db:migrate`, not a schema bug.
- **`POST /pulls/:id/review` is fire-and-forget** by design, and `repo-intel` degrades rather than throwing. Both are deliberate shapes of the service ring — do not "fix" them into synchronous or throwing code.
- The repo is **not a pnpm workspace**; packages are linked only by tsconfig path aliases, which is why `pnpm arch` is configured per package and reads `server/tsconfig.json` to resolve `@devdigest/shared`.

## Version history

- **1.0.0** (2026-09-18) — First version. Rings, rules and the debt inventory derived from a read of `server/src` at commit `e885435`; `pnpm arch` verified green on that tree, with each rule confirmed to fire against a deliberately injected violation. Sources in `README.md`.
