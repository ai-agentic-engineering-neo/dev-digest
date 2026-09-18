---
name: onion-architecture
description: "Forces Onion Architecture's inward dependency rule on DevDigest's backend packages (server/, reviewer-core/): domain and application logic must stay ignorant of Fastify, Drizzle, and vendor SDKs, with infrastructure only ever implementing ports the core defines. Use this skill whenever creating or reviewing a server module (routes.ts / service.ts / repository.ts), adding or changing an adapter under server/src/adapters or reviewer-core/src/llm, wiring dependencies through platform/container.ts, defining a new port interface in @devdigest/shared, or reviewing backend code for layering violations — even when the user doesn't say 'architecture' explicitly (e.g. 'add a repository for X', 'where should this service call the GitHub client from', 'is this route doing too much', 'how do I test this without a real database')."
metadata:
  tags: onion-architecture, clean-architecture, backend, server, reviewer-core, dependency-injection, layering, ports-and-adapters
---

## When to use

Use this skill when you need to:
- Add a new backend module or feature in `server/src/modules/<feature>/` and decide what goes in `routes.ts`, `service.ts`, and `repository.ts`
- Add or change an integration under `server/src/adapters/*` (GitHub, GitLab, LLM providers, git, embedder, …) or `reviewer-core/src/llm/`
- Wire a new dependency through `server/src/platform/container.ts`
- Define or change a port interface in `server/src/vendor/shared/adapters.ts` (`@devdigest/shared`)
- Review backend code for layering violations (a route querying the DB directly, a service importing Fastify or Drizzle types, business logic that can't be unit-tested without Postgres)
- Decide whether new logic belongs in `reviewer-core` (pure) or `server` (has I/O)

This skill does **not** cover `client/` (Next.js — see `ui-architecture`, `next-best-practices`) or `e2e/` (browser driver, no business logic).

## The Dependency Rule

> Dependencies point inward, only. Outer layers may import inner layers; inner layers may never import outer layers.

Concretely in this repo: `routes.ts` → `service.ts` → **port interface** ← `repository.ts` / `adapters/*`. The port interface is the seam — inner code defines it, outer code implements it, and nothing inward-facing ever names a concrete outer-layer type (`FastifyRequest`, a Drizzle table, the `openai` SDK's types).

This repo does **not** use horizontal folders (`src/domain/`, `src/application/`, `src/infrastructure/`) — it uses vertical-slice modules (`modules/<feature>/`) where the layer is implied by the filename. Don't propose restructuring into horizontal folders; the goal is to make the *dependency direction* inside the existing structure correct, not to reshape the folder tree.

## Layer → DevDigest mapping

| Onion layer | What it is | Where it lives here | Depends on |
|---|---|---|---|
| **Domain** | Business rules, entities, pure functions — zero framework/SDK imports | `reviewer-core/src/prompt.ts`, `reviewer-core/src/grounding.ts`; any pure logic module in `server` | nothing but types |
| **Application** | Use-case orchestration; defines the ports it needs as interfaces | `server/src/modules/<feature>/service.ts`; `reviewer-core/src/review/run.ts` | Domain + port interfaces (not concrete adapters) |
| **Infrastructure** | Implementations of ports: DB access, HTTP clients, SDKs | `server/src/modules/<feature>/repository.ts`, `server/src/adapters/*`, `reviewer-core/src/llm/openrouter.ts` | Application's port interfaces (implements them) |
| **Presentation** | Entry points that translate the outside world into application calls | `server/src/modules/<feature>/routes.ts` | Application (service) only |

The port interfaces themselves (`LLMProvider`, `CodeHostClient`, `GitClient`, `Embedder`, `AuthProvider`, `SecretsProvider`, …) live in `server/src/vendor/shared/adapters.ts` (`@devdigest/shared`) — centrally, not inside `adapters/`. That's the concrete proof of Dependency Inversion in this codebase: the core names the contract, `server/src/platform/container.ts` wires a concrete adapter to it, and tests substitute a fake via `ContainerOverrides`.

`reviewer-core` as a whole is the cleanest example of an onion **core** already working in this repo — see [references/reviewer-core-case-study.md](references/reviewer-core-case-study.md).

## Recommended Reading Order

- **Adding a new feature module?** `layers.md` → `application-layer.md` → `infrastructure-layer.md` → `presentation-layer.md`
- **Adding a new external integration (GitHub/LLM/etc.)?** `infrastructure-layer.md` → `dependency-injection.md`
- **Deciding server vs. reviewer-core for new logic?** `domain-layer.md` → `references/reviewer-core-case-study.md`
- **Reviewing a PR for architecture issues?** `anti-patterns.md`
- **"Why can't I test this without Postgres?"** `testing-strategy.md`
- **Want this enforced automatically instead of by review?** `enforcement.md`

## How to use

Read the relevant rule file(s) for detailed explanations and repo-grounded code examples:

- [rules/layers.md](rules/layers.md) — the four layers and the inward dependency rule, mapped onto `routes.ts → service.ts → port ← repository.ts/adapters/*`
- [rules/domain-layer.md](rules/domain-layer.md) — pure business rules with zero framework dependencies
- [rules/application-layer.md](rules/application-layer.md) — use-case orchestration in `service.ts`, defining ports near the use-case
- [rules/infrastructure-layer.md](rules/infrastructure-layer.md) — `repository.ts` and `adapters/*` as port implementations
- [rules/presentation-layer.md](rules/presentation-layer.md) — thin Fastify routes, Zod validation at the boundary
- [rules/dependency-injection.md](rules/dependency-injection.md) — wiring ports to adapters through `platform/container.ts`
- [rules/testing-strategy.md](rules/testing-strategy.md) — why hermetic vs. `.it.test.ts` maps directly to the layer boundary
- [rules/anti-patterns.md](rules/anti-patterns.md) — concrete violations to flag in review
- [rules/enforcement.md](rules/enforcement.md) — optional lint-level enforcement (eslint-plugin-boundaries / dependency-cruiser)
- [references/reviewer-core-case-study.md](references/reviewer-core-case-study.md) — `reviewer-core` walked through end-to-end as the working example

## Core Principles

- **The dependency rule is directional, not optional.** A `service.ts` may import a port interface; it may never import the class that implements it.
- **Ports are defined by the layer that needs them, not the layer that provides them.** In this repo that's `@devdigest/shared/adapters.ts` — central and framework-agnostic — not `server/src/adapters/`.
- **If it needs a real Postgres or a real API key to unit-test, it's in the wrong layer.** Domain and application code must be testable with stubs alone (mirrors the repo's `*.it.test.ts` vs. hermetic split).
- **Prefer explaining "why" over "must".** When reviewing, point at the concrete failure mode (untestable without infra, swapping providers requires touching business logic) rather than citing the pattern name.
- **`reviewer-core` is the existence proof.** When in doubt about what "pure" looks like in this codebase, read it before inventing a new convention.
