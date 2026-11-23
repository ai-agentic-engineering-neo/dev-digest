# onion-architecture

**Version: 1.0.0** · Scope: applying the **Onion Architecture** to the DevDigest backend (`server/`): which ring code belongs in, which way imports may point, and how each ring is tested, expressed in terms of the tools we use (Fastify, zod, Drizzle/Postgres, Octokit/simple-git/LLM SDK adapters, vitest/testcontainers). It does **not** teach each tool's API — see [`fastify-best-practices`](../fastify-best-practices/SKILL.md), [`drizzle-orm-patterns`](../drizzle-orm-patterns/SKILL.md), [`postgresql-table-design`](../postgresql-table-design/SKILL.md), [`zod`](../zod/SKILL.md), [`security`](../security/SKILL.md). Client-side sibling: [`frontend-ui-architecture`](../frontend-ui-architecture/SKILL.md).

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Entry point: ring diagram, placement flow, 12 rules, review checklist |
| `references/onion-fundamentals.md` | Rings, dependency rule, ports/adapters, Onion vs Hexagonal/Clean/DDD, when it is overkill |
| `references/fastify-presentation.md` | Routes as the outer ring: plugins, zod at the edge, error handler, context, SSE |
| `references/zod-boundaries.md` | Parse at the edge, contracts in `vendor/shared`, transport vs domain types |
| `references/drizzle-infrastructure.md` | Repositories, row mapping, transactions, workspace scoping |
| `references/adapters-and-ports.md` | External systems behind ports, mocks, `ContainerOverrides`, jobs |
| `references/testing-by-ring.md` | Which test belongs to which ring |
| `references/enforcement.md` | Import rules as lint (a proposal, not applied), review checklist |
| `references/devdigest-profile.md` | This repo's ring map, exemplars, known violations |
| `examples.md` | Before/after code on real server files |
| `evals/` | Three test cases (`prompt.md`, `case.yaml`, `graders/`) |

## Versioning

Semantic versioning, recorded in `SKILL.md` frontmatter (`metadata.version`) and here.
- **MAJOR** — a core rule is reversed or removed.
- **MINOR** — a rule or reference file is added.
- **PATCH** — wording, examples, fixed links, refreshed violation list.

### Changelog
- **1.0.0 — 2026-11-23** — Initial release. 12 rules, 8 references, 3 evals, 32 sources (26 fetch-verified, 6 flagged ⚠️ or partly verified).

## Decisions baked into 1.0.0
- **Rings inside each module.** `modules/<name>/` stays a vertical slice (matches `server/CLAUDE.md`), instead of global `domain/ application/ infrastructure/` trees.
- **Pragmatic repository ports.** Services must not import Drizzle, `db/schema` or Fastify; a module-local repository interface is required only when a unit test needs a fake or two implementations exist.
- **Skill only.** No change to `server/` code, config or scripts. The dependency-cruiser config in `references/enforcement.md` is a proposal.

## Sources

Tiers: **T1** official docs · **T2** original authors and recognized practitioners · **T3** community/tooling.
Check column: ✅ fetched and read 2026-11-23 · ⚠️ not fetch-verified (reason given). Gists are paraphrased, not quoted. "partial" = page was truncated when fetched.

### Onion, Hexagonal and Clean — the originals and good explainers (T2)
| ID | Source | URL | Used for | Check |
|---|---|---|---|---|
| O1 | Jeffrey Palermo — The Onion Architecture, part 1 (2008) | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/ | Coupling toward the center; repository interfaces in the core, implementations at the edge | ✅ |
| O1b | Jeffrey Palermo — The Onion Architecture, part 2 | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/ | Controller depends only on core interfaces; IoC container injects implementations | ✅ |
| O1c | Jeffrey Palermo — Onion Architecture series index (parts 1–4) | https://jeffreypalermo.com/tag/onion-architecture | The four tenets restated in part 4 (2013) | ✅ |
| O2 | Herberto Graça — Onion Architecture | https://herbertograca.com/2017/09/21/onion-architecture/ | Onion = Ports & Adapters + inner DDD layers; outer may call any inner | ✅ |
| H2 | Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS: how I put it all together | https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/ | Ports belong to the core and serve its needs; driving vs driven adapters; app services use repositories | ✅ partial |
| O3 | Allegro Tech — Onion Architecture (2023) | https://blog.allegro.tech/2023/02/onion-architecture.html | Application layer owns the transaction boundary via an interface implemented in infrastructure | ✅ |
| O4 | NDepend — Onion Architecture: Going Beyond Layers (2026) | https://blog.ndepend.com/onion-architecture-layers/ | Keep ORM types and framework exceptions out of the domain; translate errors in the repository | ✅ |
| H1 | Alistair Cockburn — Hexagonal architecture (original 2005 article) | https://alistair.cockburn.us/hexagonal-architecture/ | Ports and adapters; primary vs secondary adapters; inside/outside | ✅ |
| W1 | Wikipedia — Hexagonal architecture (software) | https://en.wikipedia.org/wiki/Hexagonal_architecture_(software) | Neutral summary; Onion and Clean described as variants | ✅ |
| C1 | Robert C. Martin — The Clean Architecture (2012) | https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html | The Dependency Rule; data crossing boundaries as simple structures, not DB rows | ✅ |

### TypeScript / Node practice (T2–T3)
| ID | Source | URL | Used for | Check |
|---|---|---|---|---|
| K1 | Khalil Stemmler — Clean Node.js Architecture | https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/ | Policy vs detail; interfaces = ports, implementations = adapters; testable zero-dependency domain | ✅ |
| K2 | Khalil Stemmler — mapper-pattern article tag | https://khalilstemmler.com/articles/tags/mapper-pattern | Repository/DTO/mapper boundary (tag page only) | ⚠️ from a search result; the specific article was not found by fetch |
| G1 | Sairyss — Domain-Driven Hexagon | https://github.com/Sairyss/domain-driven-hexagon | Inward deps, ports via DI, validation at edges; boilerplate may be overkill for data-centric apps | ✅ partial |
| R1 | Remo Jansen — Implementing SOLID and the onion architecture in Node.js with TypeScript | https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad | Repository interface in the domain layer; implementation in infrastructure; DI binding | ✅ partial |
| R2 | Remo Jansen — Enforce Clean Architecture with fresh-onion | https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi | Lint-style import rules per layer (config of allowed imports) | ✅ (npm package itself not verified) |
| B2 | goldbergyoni/nodebestpractices — structure by components, 3-tier layering | https://github.com/goldbergyoni/nodebestpractices | Per-component entry-points / domain / data-access; keep web objects out of domain code | ✅ partial |
| Z2 | Alexis King — Parse, don't validate | https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ | Parse at the boundary into a precise type; avoid shotgun parsing and redundant checks | ✅ |
| S1 | Sentry — Atomic repositories in Clean Architecture and TypeScript | https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript | Open the transaction at the outer edge, pass `tx` down; app layer sees a transaction interface | ✅ (community practice, not Drizzle docs) |
| S2 | João Silva — Transactions with DDD and the repository pattern in TypeScript, part 2 | https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901 | Unit of Work wrapping repositories | ⚠️ HTTP 403 to automated fetch; URL from a search result |

### Tool documentation (T1)
| ID | Source | URL | Used for | Check |
|---|---|---|---|---|
| F2 | Fastify — Encapsulation | https://fastify.dev/docs/latest/Reference/Encapsulation/ | Each `register` creates a context; `fastify-plugin` breaks encapsulation for the wrapped plugin | ✅ |
| F3 | Fastify — Plugins guide | https://fastify.dev/docs/latest/Guides/Plugins-Guide/ | Everything is a plugin; `register` creates a context; `decorate` is synchronous | ✅ |
| F4 | Fastify — Decorators | https://fastify.dev/docs/latest/Reference/Decorators/ | `decorate`/`decorateRequest`; reference-type caveat; `getDecorator` | ✅ |
| Z1 | zod | https://zod.dev/ | `parse` returns a typed result for untrusted data | ✅ |
| Z3 | fastify-type-provider-zod | https://github.com/turkerdev/fastify-type-provider-zod | `validatorCompiler`/`serializerCompiler`; zod schemas in route `schema` | ✅ |
| D2 | Drizzle — Transactions | https://orm.drizzle.team/docs/transactions | `db.transaction(async tx => …)`, `tx.rollback()`, nested savepoints | ✅ |
| D3 | Drizzle — v0.28.3 release notes (`$inferSelect` / `$inferInsert`) | https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0283 | Row/insert types inferred from tables | ⚠️ from a search result, not fetched |
| D4 | Drizzle — Goodies | https://orm.drizzle.team/docs/goodies | Utilities page; type-inference helpers are listed in search snippets but the fetched summary did not surface them — re-check before citing | ✅ fetched; claim ⚠️ |
| TC1 | Testcontainers for Node.js — PostgreSQL module | https://node.testcontainers.org/modules/postgresql/ | Real Postgres in tests | ⚠️ from a search result, not fetched (the docker.com guide URL returned 404) |
| V1 | Vitest | https://vitest.dev/ | Test runner (backend-capable) | ✅ |

### Enforcement tooling (T3)
| ID | Source | URL | Used for | Check |
|---|---|---|---|---|
| E1 | dependency-cruiser | https://github.com/sverweij/dependency-cruiser | `forbidden` rules by `from`/`to` path regex; already a server dependency | ✅ |
| E1b | dependency-cruiser — rules reference | https://raw.githubusercontent.com/sverweij/dependency-cruiser/HEAD/doc/rules-reference.md | Rule syntax | ⚠️ the github.com URL returned 503; this raw URL came from a search result |
| E3 | eslint-plugin-boundaries | https://github.com/javierbrea/eslint-plugin-boundaries | Element types + allowed dependencies | ✅ |
| E4 | @fastify/awilix | https://github.com/fastify/fastify-awilix | DI container option (the repo uses a hand-rolled container; alternative only) | ✅ |

### Related, not duplicated
`fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `typescript-expert`, `security`, and `frontend-ui-architecture`.

### Maintaining the list
Add a row with a new ID, fetch the URL, say what we took from it, and bump the version (MINOR if a rule changes because of it). Never cite from memory or from a search snippet alone: fetch it or mark it ⚠️.
