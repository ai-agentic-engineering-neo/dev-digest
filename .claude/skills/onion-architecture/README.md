# Onion Architecture — sources and rationale

## What Onion Architecture is

Jeffrey Palermo introduced the term in 2008, building on Alistair Cockburn's
2005 Hexagonal ("Ports and Adapters") Architecture:

- Jeffrey Palermo, ["The Onion Architecture: part 1"](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
  and [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) —
  the original definition. Core claim: the application's domain model and
  domain services sit at the center, free of any reference to persistence
  (SQL) or transport (HTTP) details; everything else is a ring around that
  center, and **all dependencies point inward**, never outward.
- Herberto Graça, ["Onion Architecture"](https://herbertograca.com/2017/09/21/onion-architecture/) —
  a clear rings diagram and DDD framing of the same idea, useful for seeing
  how Onion, Hexagonal, and Clean Architecture converge on one dependency
  rule with different vocabulary for the same rings.
- Milan Jovanović, ["Clean vs Onion vs Hexagonal Architecture"](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal) —
  a practical compare/contrast. The useful takeaway for this repo: all
  three "circle around fundamentally the same concept... business logic at
  the center, infrastructure at the edges," so this skill doesn't need to
  litigate which of the three names is "more correct" — it borrows Onion's
  ring vocabulary because it best matches this repo's existing
  `routes.ts`/`service.ts`/`repository.ts` file-per-ring convention.

## TypeScript / Node.js implementations referenced

- Alex Rusin, ["Future-Proof Your Code: A Guide to Ports & Adapters (Hexagonal) Architecture"](https://blog.alexrusin.com/future-proof-your-code-a-guide-to-ports-adapters-hexagonal-architecture/) —
  TypeScript-specific mechanics for "ports as interfaces, adapters as concrete
  implementations, injected at the boundary" — the same shape as this repo's
  `src/platform/container.ts` DI container and `src/adapters/mocks.ts` test
  doubles.
- Sankhadip Samanta, ["Onion Architecture in Node.js with TypeScript"](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391) —
  a concrete Express/TS example of the domain → application → infrastructure
  split, useful as a second reference point for the same layering this skill
  states for Fastify.

## How this maps onto `server/`

| Onion ring (canonical) | This repo | Why |
|---|---|---|
| Domain model / Domain services | `src/vendor/shared/` (Zod contracts) | Framework-free shapes both `server/` and `client/` depend on; depends on nothing itself |
| Application services | `modules/<name>/service.ts` | Orchestrates business logic, calls the repository and (via DI) adapters |
| Infrastructure (data access) | `modules/<name>/repository.ts`, `src/adapters/*` | Drizzle queries and outbound integrations (GitHub, LLM, git, astgrep) live only here |
| Infrastructure (UI/transport, outermost) | `modules/<name>/routes.ts` | Fastify HTTP surface: request validation, calls into the service, nothing else |

This repo doesn't literally nest folders as concentric rings (no
`domain/`/`application/`/`infrastructure/` tree) — the ring boundary is
enforced by *which file a piece of logic lives in* within each
`modules/<name>/` folder, plus the DI container as the seam between
services and adapters. That's a deliberate, lighter-weight expression of
the same dependency rule, not a deviation from it — see `reviewer-core/`'s
own `LLMProvider` interface (defined in `@devdigest/shared`, implemented by
`OpenRouterProvider`, injected into `reviewPullRequest()`) for another
worked example of the identical dependency-inversion pattern already in
this codebase, just for a different concern (LLM calls, not the database).

## Where the pattern already works vs. where it's been skipped

`repo-intel` and `reviews` follow the full `routes.ts → service.ts →
repository.ts` split correctly (see [examples.md](examples.md) for the
concrete code). `pulls`, `settings`, `polling`, and `workspace` currently
call `container.db` directly from `routes.ts` with no repository layer —
flagged in [SKILL.md](SKILL.md) §2 as known debt this skill's threshold
rule should catch going forward, not something this skill retroactively
fixes.
