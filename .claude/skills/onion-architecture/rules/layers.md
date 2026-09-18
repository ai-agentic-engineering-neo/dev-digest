# The four layers and the dependency rule

Onion Architecture (Jeffrey Palermo, 2008) arranges code in concentric rings. Each ring may only know about the rings inside it:

```
 ┌─────────────────────────────────────────┐
 │  Infrastructure          Presentation    │   outer rings: frameworks, DB,
 │  (repository.ts,         (routes.ts)     │   HTTP clients, SDKs — swappable
 │   adapters/*)                            │
 │      ┌───────────────────────────┐       │
 │      │      Application          │       │   use-cases, orchestration,
 │      │      (service.ts)         │       │   defines the ports it needs
 │      │   ┌───────────────┐       │       │
 │      │   │    Domain     │       │       │   business rules, entities —
 │      │   │  (pure logic) │       │       │   zero framework imports
 │      │   └───────────────┘       │       │
 │      └───────────────────────────┘       │
 └─────────────────────────────────────────┘
```

The rule that matters in practice: **an inner ring never imports a concrete type from an outer ring.** It can only depend on an interface (a "port") that it — or something equally inward — defines. The outer ring implements that interface. This is the Dependency Inversion Principle applied at the architecture level, and it's the entire point of the pattern: swap Postgres for something else, swap OpenRouter for Anthropic, and the application/domain code doesn't change.

Background reading if you want the full theory:
- [Onion Architecture in Software Development — Codefinity](https://codefinity.com/blog/Onion-Architecture-in-Software-Development)
- [Understanding Onion Architecture: A Clean Approach to Software Design — Medium](https://medium.com/lets-code-future/understanding-onion-architecture-a-clean-approach-to-software-design-f41af77b72d8)
- [Mastering Onion Architecture — Number Analytics](https://www.numberanalytics.com/blog/mastering-onion-architecture)
- [Onion Architecture in Practice — Number Analytics](https://www.numberanalytics.com/blog/onion-architecture-in-practice)
- [What Is Onion Architecture? Structuring Code from the Core Out — TMS Outsource](https://tms-outsource.com/blog/posts/onion-architecture/)

## How this maps onto DevDigest's vertical slices

This repo organizes by **feature**, not by layer-folder — `server/src/modules/<feature>/` holds all four rings for that feature side by side, distinguished by filename:

```
modules/reviews/
  routes.ts        ← Presentation: Fastify handlers
  service.ts        ← Application: ReviewService, orchestrates the use-case
  repository.ts      ← Infrastructure: the ONLY layer touching Drizzle for this feature
  helpers.ts, findings.ts, run-executor.ts  ← split-out application logic
```

Import direction within a module (and across modules) must be:

```
routes.ts  →  service.ts  →  [port interface]  ←  repository.ts
                                     ↑
                          adapters/* (cross-cutting ports:
                          GitHub, LLM, git, embedder, ...)
```

`repository.ts`'s own doc-comment in `modules/reviews/repository.ts` states this rule out loud already: *"the ONLY layer touching the DB for the review domain"* — that's the Dependency Rule enforced by convention, not yet by tooling (see [enforcement.md](enforcement.md) if you want to make it structural).

`reviewer-core` is a **separate package that is itself one onion core** — no `modules/` slicing needed because it has no presentation or infrastructure layer beyond a single injected `LLMProvider` port. See [../references/reviewer-core-case-study.md](../references/reviewer-core-case-study.md).

## Which ring is new code in?

Ask, in order:

1. **Does it need a database row, an HTTP call, a filesystem path, or an SDK client to run?**
   Yes → Infrastructure (`repository.ts` / `adapters/*`), and it must implement (or be reached through) a port.
2. **Does it decide *what* to do — orchestrating calls, checking business preconditions, shaping a use-case — but doesn't itself do I/O?**
   Yes → Application (`service.ts`). It may call ports (interfaces), never concrete adapters.
3. **Is it a rule that would be true regardless of Fastify, Postgres, or OpenRouter — a pure function of its inputs?**
   Yes → Domain. In `server` this is often a small pure module imported by a `service.ts` (no dedicated file convention exists yet — colocate it in the module and keep it import-free of Fastify/Drizzle/SDK types); in `reviewer-core` this is `prompt.ts` / `grounding.ts`.
4. **Does it translate an HTTP request into a service call, or a service result into an HTTP response?**
   Yes → Presentation (`routes.ts`). Nothing else belongs here.

If you can't answer #1–#4 confidently, it's a sign the responsibility is mixed and should be split — see [anti-patterns.md](anti-patterns.md).

## A terminology note: Onion vs. Clean vs. Hexagonal

You'll see "Clean Architecture" and "Hexagonal Architecture" (Ports & Adapters) used near-interchangeably with Onion Architecture in blog posts and in this repo's own conversations — they're close enough cousins that mixing the vocabulary rarely causes real confusion, but it's worth knowing the actual distinction so a design discussion doesn't get stuck on naming:

- **Hexagonal (Cockburn, 2005)** frames everything as ports (interfaces) and adapters (implementations) around one core, without prescribing internal rings.
- **Onion (Palermo, 2008)** — what this skill follows — adds explicit concentric rings (domain → application → infrastructure/presentation) inside that same ports-and-adapters idea.
- **Clean (Martin, 2012)** is the most prescriptive of the three: it names "entities" and "use cases" explicitly and states the Dependency Rule as a formal law.

For this repo, the practical takeaway is Onion's: name the rings, keep dependencies pointing inward, define ports where the core needs them. If someone says "hexagonal" or "clean" about this codebase's structure, they mean the same thing this skill describes.

- [Clean vs Onion vs Hexagonal Architecture — Milan Jovanović](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal)
- [Onion vs Clean vs Hexagonal Architecture — Eric Damtoft, Medium](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91)
- [Understanding Hexagonal, Clean, Onion and Traditional Layered Architectures — Roman Glushach](https://romanglushach.medium.com/understanding-hexagonal-clean-onion-and-traditional-layered-architectures-a-deep-dive-c0f93b8a1b96)
