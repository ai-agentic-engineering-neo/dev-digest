# onion-architecture

**Version:** 1.0.0 · **Scope:** `server/` (Fastify 5 · Drizzle + Postgres 16/pgvector · Zod 3 ·
OpenAI/Anthropic SDKs · octokit · simple-git · ast-grep) and `reviewer-core/` as the inner core.

Enforces Onion Architecture in the backend: which ring code belongs to, how the
tools map onto rings, how dependencies are injected, and a dependency-cruiser check
that fails on new violations of the inward dependency rule.

| File | Loaded | Contents |
|---|---|---|
| [SKILL.md](SKILL.md) | when the skill triggers | rings, placement table, per-tool rules, DI, workflow, review checklist, enforcement |
| [references/fastify.md](references/fastify.md) | on demand | module plugin shape, composition root, handler rules, error mapping |
| [references/drizzle.md](references/drizzle.md) | on demand | repository shape, mappers, TransactionRunner, pgvector, error translation |
| [references/zod-boundaries.md](references/zod-boundaries.md) | on demand | transport vs domain vs persistence schemas, config, LLM output |
| [references/testing.md](references/testing.md) | on demand | tests per ring |
| [references/examples.md](references/examples.md) | on demand | before/after code |
| [references/migration.md](references/migration.md) | on demand | known legacy violations and fix recipes |
| `server/.dependency-cruiser.cjs` | tooling | layer rules |
| `server/.dependency-cruiser-known-violations.json` | tooling | baseline of legacy violations (may only shrink) |

## Boundaries with other skills

- Fastify API details (hooks, plugins, serialization, security) → `fastify-best-practices`
- Drizzle API, relations, migrations → `drizzle-orm-patterns`; schema design → `postgresql-table-design`
- Zod API → `zod`; TypeScript typing → `typescript-expert`
- This skill only decides **which ring** and **through which port**.

## Decisions (2026-09-22)

Agreed with the team:
- **Strictness: pragmatic Onion.** Four rings are mandatory; small modules use ring
  file names (`domain.ts`/`helpers.ts`/`constants.ts`, `service.ts`, `repository.ts`,
  `routes.ts`), grown modules use ring folders. Port interfaces for repositories only
  where invariants, a second implementation or a fake are needed.
- **Enforcement: dependency-cruiser** (already a server dependency), run from the
  skill workflow; CI wiring is a separate decision.
- **Legacy: new code + fix on touch.** 25 known violations are baselined and
  documented in `references/migration.md`.
- **Scope:** `server/` + `reviewer-core` (inner ring, no server imports, no I/O, SDK
  only inside `src/llm/`).

Where sources disagree:

| Topic | Positions | Decision |
|---|---|---|
| Repository pattern | essential (A1, A2, A8, A16, B2) vs. worse than Drizzle for CRUD (D6) | repository per module, use-case-shaped methods; port interface only when needed |
| Full Onion vs 3-tier | A4, A6, A7, A16 vs. B4, B7, G2 | pragmatic Onion (4 rings, files before folders) |
| Transaction start | service layer (A9, A12) vs. controller (D5) | use case via `TransactionRunner` port |
| Strict vs relaxed layering | any outer → any inner (A3) vs. next tier only (A16, B4) | A3: inward only, skipping allowed |
| Testing the core | fakes (A5, F1) vs. pure functions (A13, A14) vs. real DB (D6) vs. nullables (F3) | pure domain, fakes for application, real DB for repositories |
| Package by layer vs. by feature | A16 vs. A7, B3, C11, G1 | by feature (`modules/<name>`), rings inside |
| What crosses boundaries | DTOs only (A6) vs. entities inside the app (A7, A16) | entities between domain/application; DTOs at http |
| DI container | IoC (A2, C9) vs. none (B7) | no library: constructor injection + `platform/container.ts` |

Caveats: `fastify-type-provider-zod` v5+ requires Zod 4 (stay on 4.x with Zod 3);
verify `drizzle-zod` against Zod 3 before adopting; Fastify "Recommendations" is
about operations, not structure (not cited).

## Sources

Checked 2026-09-22. `search-only` = found by search, page not fetched.

### A. Onion / Clean / Hexagonal
- A1 Jeffrey Palermo — The Onion Architecture, part 1 — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- A2 Jeffrey Palermo — part 2 — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
- A3 Jeffrey Palermo — part 3 — https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
- A4 Jeffrey Palermo — Part 4: After Four Years — https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/
- A5 Alistair Cockburn — Hexagonal Architecture — https://alistair.cockburn.us/hexagonal-architecture/
- A6 Robert C. Martin — The Clean Architecture — https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- A7 Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS… how I put it all together — https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/
- A8 Martin Fowler (PoEAA) — Repository — https://martinfowler.com/eaaCatalog/repository.html
- A9 Martin Fowler (PoEAA) — Service Layer — https://martinfowler.com/eaaCatalog/serviceLayer.html
- A10 Martin Fowler — AnemicDomainModel — https://martinfowler.com/bliki/AnemicDomainModel.html
- A11 Brett Schuchert — DIP in the Wild — https://martinfowler.com/articles/dipInTheWild.html
- A12 Martin Fowler (PoEAA) — Unit of Work — https://martinfowler.com/eaaCatalog/unitOfWork.html
- A13 Mark Seemann — Functional architecture is Ports and Adapters — https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/
- A14 Mark Seemann — Impureim Sandwich — https://blog.ploeh.dk/2020/03/02/impureim-sandwich/
- A15 Mark Seemann — Composition Root — https://blog.ploeh.dk/2011/07/28/CompositionRoot/
- A16 Microsoft Learn — Common web application architectures — https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
- A17 Vaughn Vernon — Effective Aggregate Design, Part I — https://www.dddcommunity.org/library/vernon_2011/ (PDF: https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf)

### B. TypeScript / Node and enforcement
- B1 Khalil Stemmler — Organizing App Logic with the Clean Architecture — https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/
- B2 Khalil Stemmler — Implementing DTOs, Mappers & the Repository Pattern — https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/
- B3 Node.js Best Practices — Structure your solution by components — https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/breakintcomponents.md
- B4 Node.js Best Practices — Layer your app — https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/createlayers.md
- B5 Node.js Best Practices — Use only the built-in Error object — https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/errorhandling/useonlythebuiltinerror.md
- B6 Node.js Best Practices — Handle errors centrally — https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/errorhandling/centralizedhandling.md
- B7 Practica.js — https://github.com/practicajs/practica
- B8 dependency-cruiser — rules reference — https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- B9 eslint-plugin-boundaries — https://github.com/javierbrea/eslint-plugin-boundaries
- B10 TSArch — https://github.com/ts-arch/ts-arch

### C. Fastify
- C1 Encapsulation — https://fastify.dev/docs/latest/Reference/Encapsulation/
- C2 Plugins — https://fastify.dev/docs/latest/Reference/Plugins/
- C3 Decorators — https://fastify.dev/docs/latest/Reference/Decorators/
- C4 The hitchhiker's guide to plugins — https://fastify.dev/docs/latest/Guides/Plugins-Guide/
- C5 fastify-plugin — https://github.com/fastify/fastify-plugin
- C6 Errors — https://fastify.dev/docs/latest/Reference/Errors/
- C7 Type Providers — https://fastify.dev/docs/latest/Reference/Type-Providers/
- C8 fastify-type-provider-zod — https://github.com/turkerdev/fastify-type-provider-zod
- C9 @fastify/awilix — https://github.com/fastify/fastify-awilix
- C10 @fastify/autoload — https://github.com/fastify/fastify-autoload
- C11 Matteo Collina — Building a modular monolith with Fastify — https://gitnation.com/contents/building-a-modular-monolith-with-fastify
- C12 Platformatic — Solving Microservice Challenges: Networkless HTTP — https://blog.platformatic.dev/solving-microservice-challenges (search-only)

### D. Drizzle
- D1 Schema declaration — https://orm.drizzle.team/docs/sql-schema-declaration
- D2 Transactions — https://orm.drizzle.team/docs/transactions
- D3 Relational queries — https://orm.drizzle.team/docs/rqb
- D4 drizzle-zod — https://orm.drizzle.team/docs/zod
- D5 Lazar Nikolov (Sentry) — Atomic Repositories in Clean Architecture and TypeScript — https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/
- D6 Jay Freestone — You might not need the repository pattern — https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b

### E. Zod and boundary validation
- E1 Zod — Basics — https://zod.dev/basics
- E2 Alexis King — Parse, don't validate — https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/

### F. Testing
- F1 Martin Fowler — Mocks Aren't Stubs — https://martinfowler.com/articles/mocksArentStubs.html
- F2 Martin Fowler — TestDouble — https://martinfowler.com/bliki/TestDouble.html
- F3 James Shore — Testing Without Mocks — https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks
- F4 Testcontainers for Node — PostgreSQL module — https://node.testcontainers.org/modules/postgresql/

### G. When not to layer
- G1 Dan North — CUPID: for joyful coding — https://dannorth.net/blog/cupid-for-joyful-coding/
- G2 Martin Fowler — Yagni — https://martinfowler.com/bliki/Yagni.html
- G3 The Twelve-Factor App — Config — https://12factor.net/config

### Skill authoring
- Agent Skills specification — https://agentskills.io/specification
- Anthropic — Skill authoring best practices — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

### Rule → source map

| SKILL.md section | Backed by |
|---|---|
| 1 Rings, inward rule | A1–A4, A6, A7, A16 |
| 2 Placement | A7, A16, B1, B3, C11, G1 |
| 3 Fastify | C1–C8, A15, B6 |
| 3 Drizzle | A8, A12, D1–D6, B2 |
| 3 Zod | E1, E2, C7, C8, D4, G3 |
| 3 LLM / external adapters | A5, A11 |
| 4 Dependency injection | A2, A15, A4, B7 |
| 5 Proportionality | B4, B7, D6, G2 |
| Testing | A13, A14, F1–F4 |
| 9 Enforcement | B8 (B9, B10 as alternatives) |

## Changelog

- **1.0.0** (2026-09-22) — first version: rings, placement, Fastify/Drizzle/Zod/LLM
  rules, DI, proportionality, workflow and review checklist; dependency-cruiser rules
  + baseline (25 legacy violations); references for fastify, drizzle, zod, testing,
  examples, migration.

Versioning: bump `metadata.version` in SKILL.md and add a line here. MAJOR = a rule
reverses or the checker gets stricter for existing code, MINOR = new rule/section,
PATCH = wording/links. Rule changes go together with `server/.dependency-cruiser.cjs`.
