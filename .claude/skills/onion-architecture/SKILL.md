---
name: onion-architecture
description: "Enforces Onion Architecture (ports & adapters) in the DevDigest backend packages — `server/` and `reviewer-core/`. Use when adding or changing a server module, a route, a service, a repository, an adapter or a DI wiring; when deciding where a piece of backend logic belongs; when a service needs a new external capability (LLM, git, GitHub, filesystem, index); when reviewing backend code for layering; or when a change makes an inner layer depend on an outer one. Covers the dependency rule, the layer map onto this repo, Fastify routes as driving adapters, Drizzle repositories as driven adapters, narrow ports instead of the DI container, Zod at the boundary, domain purity and dependency-cruiser enforcement. Trigger terms: onion architecture, hexagonal, ports and adapters, clean architecture, layering, dependency rule, repository pattern, where does this code go."
metadata:
  tags: architecture, onion, hexagonal, ports-and-adapters, backend, fastify, drizzle, zod, dependency-injection, dependency-cruiser
---

# Onion Architecture — DevDigest backend

Scope: `server/` (`@devdigest/api`) and `reviewer-core/` (`@devdigest/reviewer-core`).
Not the client, not e2e.

## The one rule

**All coupling points inward.** An outer layer may depend on an inner layer. An inner
layer must never depend — by import, by type, or by knowledge — on an outer one.

The domain does not know that Postgres, Fastify, GitHub or OpenAI exist. Everything
outside the core reaches the core through a **port** (an interface owned by the inside)
implemented by an **adapter** (a class owned by the outside), and the two are wired
together in exactly one place: the **composition root**.

If you cannot state which layer a new file belongs to, do not write it yet — read
`rules/layers.md`.

## The request path

```
route (driving adapter) → application service → domain
                              ↓ through ports
                         driven adapters (Drizzle, octokit, simple-git, LLM, ast-grep)
```

The **container** is what connects them: it builds each service with the concrete
adapters behind its ports. A route reaches a use case, never an adapter.

**A route never calls an adapter directly.** Not `container.github()`, not
`container.llm(id)`, not `container.git`, not `container.codeIndex`, not a Drizzle
query — even for "just one read". The moment a route talks to an adapter, the use case
is split between two rings, it can no longer be tested without HTTP, and the next
caller (a job, the CI runner) has to copy it. Put the call in a service method and
call that.

## Layer map onto this repository

| Layer | What it is here | Where it lives |
|---|---|---|
| Domain model | `Finding`, `Severity`, score, diff, PR identity, and their invariants | `reviewer-core/src`, `server/src/domain/<aggregate>/` |
| Domain services | grounding gate, scoring, prompt assembly | `reviewer-core/src/grounding.ts`, `src/prompt.ts` |
| Application services (use cases) | `runReview`, `addRepo`, `importPr`, `indexRepo` | `server/src/modules/<name>/service.ts` |
| Ports | `LLMProvider`, `GitClient`, `GitHubClient`, `SecretsProvider`, `CodeIndex`, `Embedder`, repository ports | `server/src/vendor/shared/adapters.ts` |
| Driven adapters | Drizzle repositories, octokit, simple-git, OpenAI/Anthropic/OpenRouter, ast-grep, tiktoken | `server/src/modules/*/repository.ts`, `server/src/adapters/*` |
| Driving adapters | Fastify routes, SSE stream, `JobRunner` handlers | `server/src/modules/*/routes.ts`, `server/src/platform/{sse,jobs}.ts` |
| Composition root | the DI container — the only place that constructs concrete classes | `server/src/platform/container.ts` |

`reviewer-core` is the reference implementation of a pure core: "no DB, network,
filesystem or environment reads; new outside capability arrives as an injected port".
This skill generalises that contract to the whole backend.

## Where a change starts

Build **inward-out**, never outward-in:

1. Name the use case in one sentence ("run a review for one agent on a PR").
2. Express the rule in the domain — a type, an invariant, a pure function. No I/O.
3. Declare the ports the use case needs. A port is named after what the *caller*
   wants (`ReviewRepositoryPort.listRunsForPull`), not after what the library offers.
4. Write the application service against those ports only.
5. Implement the adapters (Drizzle, HTTP client, LLM).
6. Wire them in the container.
7. Expose the use case through a route — last, and thinnest.

## Rule index

Read the file that matches what you are touching:

| Touching | Read |
|---|---|
| deciding where code belongs, a new module | `rules/layers.md` |
| `routes.ts`, HTTP status codes, SSE, job handlers | `rules/fastify-transport.md` |
| `repository.ts`, Drizzle queries, transactions, row types | `rules/drizzle-persistence.md` |
| a service constructor, `Container`, a new adapter | `rules/ports-and-di.md` |
| Zod schemas, `@devdigest/shared`, wire shapes | `rules/zod-contracts.md` |
| `reviewer-core/`, `server/src/domain/` | `rules/domain-purity.md` |
| writing tests for any of the above | `rules/testing.md` |
| CI, dependency-cruiser, verifying a change | `rules/enforcement.md` |

Worked before/after refactors: `examples.md`. Sources: `references.md`.

## Pre-flight checklist

Run through this before finishing any backend change. Each item maps to a
dependency-cruiser rule in `rules/enforcement.md`.

- [ ] No `routes.ts` imports `drizzle-orm`, `../../db/schema.js` or `../../db/rows.js`.
- [ ] No `routes.ts` calls an adapter: no `container.github()`, `container.llm()`,
      `container.git`, `container.codeIndex`, `container.embedder()`, `container.secrets`.
      It calls one service method. (dependency-cruiser sees imports, not property
      access, so this one is checked by review and by the grep in `rules/enforcement.md`.)
- [ ] No `service.ts` imports `drizzle-orm` or the Drizzle schema.
- [ ] No constructor under `src/modules/**` takes `Container`; it takes named ports.
- [ ] No public method signature exposes a `*Row` type (`typeof table.$inferSelect`).
- [ ] Every new external capability has a port in `vendor/shared/adapters.ts`, an
      implementation in `src/adapters/`, and a mock in `src/adapters/mocks.ts`.
- [ ] Nothing in `reviewer-core/src` or `server/src/domain/` imports fastify, drizzle,
      postgres, octokit, simple-git, an LLM SDK, a `node:` builtin, or reads `process.env`.
- [ ] Module A does not import module B's `repository.ts` or `helpers.ts`; shared
      repositories are resolved from the composition root.
- [ ] A business rule can be tested without starting Postgres.

## State of the tree

`pnpm arch:check` in `server/` is **green**, and all ten rules sit at `severity: 'error'`,
so a new violation fails CI rather than joining a backlog. The four routes that used to
query Drizzle, the container-as-dependency constructors and the repo-intel import cycle
are all gone (2026-09-21).

Two consequences worth knowing:

- **Consumer-declared ports are the house style.** A module that needs another module's
  data declares the slice it wants (`WorkspaceRepoReader`, `PollingPullWriter`,
  `PullsRepoReader`, `RepoIntelDeps`) and the concrete repository or the container
  satisfies it structurally. No `import type { Container }` inside a module.
- **Three files are named persistence-edge exceptions** in `.dependency-cruiser.cjs`:
  `src/app.ts` (boot probe), `src/platform/jobs.ts` (JobRunner owns the `jobs` table) and
  `src/adapters/auth/local.ts` (a driven adapter whose store is the DB). They are listed
  by name, not by folder, so nothing inherits the exception by location.

What the graph cannot check is signature shape: "no `*Row` type in a public service
signature" stays a review rule, enforced by the checklist above, because
dependency-cruiser sees imports and not types.
