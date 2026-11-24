# Layers — definitions, repo mapping, enforcement rules

## The rings

Onion Architecture (Palermo, 2008) puts an **independent object model** at the center; each
outer ring may depend on any ring inside it, never the reverse. Inner rings **declare
interfaces**; outer rings **implement** them. Infrastructure (DB, HTTP, SDKs, file system) is
pushed to the edge so the core is testable without it. Clean Architecture's "dependency rule"
and Hexagonal's "ports & adapters" are the same idea with different names — see `sources.md`.

| Ring | Contains | Knows about | DevDigest location |
|---|---|---|---|
| **Domain model** | entity/value types, pure policies, domain errors | nothing outside itself (+ `import type` from shared kernel) | `modules/<f>/domain/{types,policies,errors}.ts`; `reviewer-core/src` (grounding, reduce, to-review, prompt) |
| **Domain services / ports** | interfaces the core needs from the world | domain model | `modules/<f>/domain/ports.ts`; `vendor/shared/adapters.ts` (LLMProvider, GitClient, GitHubClient, CodeIndex, Embedder, SecretsProvider, AuthProvider) |
| **Application** | use cases: load → apply policy → save, tenancy checks, transactions via UoW port, publishing events via port | domain + ports | `modules/<f>/application/*.service.ts`; `reviewer-core/src/review/run.ts` (orchestration over an injected LLM) |
| **Infrastructure** | implementations of ports: Drizzle repositories, mappers, SDK adapters, JobRunner, RunBus, secrets/config loaders | everything inside | `modules/<f>/infrastructure/`, `src/adapters/**`, `src/db/**`, `platform/{jobs,sse,config,price-book,...}.ts` |
| **Delivery (HTTP)** | Fastify routes, request/response schemas, presenters, error → status mapping | application + domain types | `modules/<f>/http/`, `app.ts` error handler, `modules/_shared/context.ts` |
| **Composition root** | constructs and wires everything | everything | `platform/container.ts`, `app.ts`, `modules/<f>/index.ts` factories |

### Shared kernel: `@devdigest/shared`
`server/src/vendor/shared` mixes two things:
- **Port interfaces** (`adapters.ts`) — legitimately inner; application may import them.
- **Zod transport contracts** (`contracts/*`) — API ⇄ client DTOs. Domain may reuse their
  *inferred types* through `import type` (e.g. `Provider`, `ReviewStrategy` enums) to avoid
  duplicating vocabularies, but must not call the schemas at runtime and must not treat a
  `snake_case` DTO as its own model. Presenters do the domain → DTO mapping.

### `platform/` is not one ring
Classify per file:
| File | Ring |
|---|---|
| `container.ts` | composition root |
| `errors.ts` | today mixed (codes + HTTP status). Target: the `DomainError` base (code only) moves to `modules/_shared/domain/errors.ts` so `domain/` may import it; `AppError` + the code → status table stay here as delivery concerns used by the `app.ts` error handler |
| `jobs.ts`, `sse.ts`, `config.ts`, `price-book.ts`, `contained-read.ts`, `resilience.ts`, `run-logger.ts`, `trace-builder.ts` | infrastructure |
| `local-only.ts` | delivery (do not touch — DNS-rebinding guard) |
| `grounding.ts`, `prompt.ts`, `structured.ts`, `prompts.ts` | shims over reviewer-core (do not move logic here; change reviewer-core) |
| `model-router.ts` | infrastructure-side routing over LLM ports — pass its result to use cases through deps (e.g. `llmFor`), don't import it from `application/` |

## Enforcement rules (dependency-cruiser)

Source of truth: `server/.dependency-cruiser.cjs` (don't copy it here — it would drift).
Run by `server/test/architecture.test.ts` in CI `server-unit`; legacy violations frozen in
`server/.dependency-cruiser-known-violations.json`. Paths are relative to `server/`.

| Rule | Forbids | Legacy hits (2026-11-24) |
|---|---|---|
| `domain-is-pure` | `modules/*/domain/` importing anything but domain code (any module's `domain/`, incl. `_shared/domain`) and `vendor/shared` | 0 (no `domain/` folders yet) |
| `domain-shared-types-only` | runtime (non-`import type`) imports of `vendor/shared` from `domain/` | 0 |
| `application-no-outer-rings` | `modules/*/application/` → `infrastructure/`, `http/`, `src/db`, `src/adapters`, `src/platform`, drizzle-orm, fastify, postgres, zod, SDKs | 0 |
| `no-drizzle-outside-infrastructure` | drizzle-orm / `db/schema` / `db/rows` outside `infrastructure/`, legacy `repository(.ts\|/)`, `src/db`, `src/adapters`, `src/platform`, `app.ts` | 15 (routes of settings/pulls/polling/workspace, reviews service/run-executor/diff-loader, repos/helpers, settings/feature-models) |
| `no-sdk-outside-adapters` | octokit, openai, @anthropic-ai, simple-git, @ast-grep, ripgrep, tiktoken outside `src/adapters` | 0 |
| `no-cross-module-imports` | `modules/A/**` → `modules/B/**` (except `_shared`) | 1 (repos → repo-intel/constants) |
| `adapters-no-modules` | `src/adapters/**` → `src/modules/**` | 2 (depgraph, astgrep → repo-intel/constants) |
| `no-container-in-core` | `domain/`/`application/` → `platform/container` | 0 |
| `reviewer-core-is-pure` | `../reviewer-core/src` → drizzle-orm, postgres, fastify, simple-git, octokit, `fs`, `child_process`, any `server/src` file except `vendor/shared` | 0 |
| `no-circular` | import cycles (type-only included) | 5 (container ⇄ repo-intel service/pipeline — the Service Locator; agents helpers ⇄ repository) |

Notes:
- Ring rules (`domain-*`, `application-*`, `no-container-in-core`) bite only on files inside
  ring folders; legacy flat modules are covered by the drizzle/SDK/cross-module/cycle rules.
- `tsPreCompilationDeps: true` keeps `import type` edges visible, which `domain-shared-types-only`
  relies on and which makes type-only cycles count.
- Every rule was probed with deliberately bad files when it was written (all caught; clean
  type-only imports passed).
- The test compares npm targets by package name (pnpm store paths embed versions), so a
  dependency bump doesn't invalidate the baseline.
