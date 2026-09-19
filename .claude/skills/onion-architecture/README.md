# onion-architecture

**Version:** 1.0.0 (2026-09-19) · Files: `SKILL.md` (rings, placement, transactions, red flags), `tools.md` (Fastify / Drizzle / Zod / SDK / dependency-cruiser / tests rules) · Enforcement: `server/.dependency-cruiser.cjs` + `pnpm arch`

## Motivation

The server was already *mostly* layered (`routes.ts → service.ts → repository.ts`, ports in `vendor/shared/adapters.ts`, adapters in `src/adapters/`, composition root in `platform/container.ts`). But the rule was never written down or checked, so it drifted: four `routes.ts` files query Drizzle directly, a helper value-imports the schema, and one module reaches into another module's `constants.ts`.

This skill writes the rule down as **Onion Architecture mapped onto the file names we already use**. It adds no new folders. dependency-cruiser checks it on every `pnpm arch`, and the existing drift is frozen in a baseline that may only shrink.

### Scope split with sibling skills

| Topic | Owner |
|---|---|
| Which ring code belongs to, allowed import direction, cross-module access, ports/adapters, transaction boundaries, Zod-at-the-edges, enforcement | **onion-architecture** |
| Fastify API: plugins, hooks, schemas, perf | `fastify-best-practices` |
| Drizzle query / relation / migration syntax | `drizzle-orm-patterns` |
| Postgres table design, indexes, types | `postgresql-table-design` |
| Zod API details | `zod` |
| Frontend code placement | `frontend-ui-architecture` |

## Enforcement

```bash
cd server
pnpm arch            # fails only on NEW violations (baseline ignored)
pnpm arch:baseline   # regenerate the baseline, ONLY after removing violations
```

| Rule | Forbids |
|---|---|
| `no-db-outside-infra` | `drizzle-orm` / `db/schema` / `db/client` value imports in modules outside `repository*` (type-only `db/rows.ts` allowed) |
| `routes-thin` | `routes.ts` → drizzle, `src/db/*`, `src/adapters/*` |
| `domain-pure` | `model/helpers/constants.ts`, `vendor/shared/*` → fastify, drizzle, adapters, container, db |
| `sdk-only-in-adapters` | `openai`, `@anthropic-ai/sdk`, `octokit`, `simple-git`, `@vscode/ripgrep`, `@ast-grep/napi`, `js-tiktoken`, `dependency-cruiser` outside `src/adapters/` (except `reviewer-core/src/llm/`) |
| `no-cross-module-internals` | `modules/A/*` → `modules/B/*` other than `B/index.ts` |
| `no-import-app-entry` | importing `app.ts` / `server.ts` |
| `reviewer-core-pure` | reviewer-core → fastify, drizzle, postgres, `server/src` (except `@devdigest/shared` contracts) |
| `no-circular` | cycles (warn) |

**Baseline at creation: 28 known violations.** They're drizzle in `pulls/`, `polling/`, `workspace/` and `settings/routes.ts`, plus `settings/feature-models.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts`, `repos/service.ts → repo-intel/constants.ts`, and 5 cycles around `repo-intel`/`container` and `agents/helpers↔repository`. Each rule was proven to fire by adding a temporary violating import and then reverting it.

Config decisions:
- `db/rows.ts` is allowed as `import type` everywhere. It exists so that non-repository code can name row types without the schema.
- `graphology` was dropped from the SDK list. It's a pure in-memory library with no external system, so it isn't an adapter concern.
- `node_modules` targets match on the resolved pnpm path (`node_modules/.pnpm/<pkg>@…/node_modules/<pkg>`). An early `exclude` on `node_modules`/`dist` silently deleted SDK edges from the graph, which hid violations.

## How it was built (TDD for skills)

1. **Research:** read the codebase (modules, container, ports, adapters, reviewer-core), searched the web, and had a Sonnet agent verify every source link below.
2. **RED:** three Sonnet agents without the skill got three scenarios:
   - S1: a new `findings-export` module (DB + Octokit + Zod + atomic writes).
   - S2: a refactor of the 15 KB `pulls/routes.ts`.
   - S3: six placement questions: a cross-repo tx, a cross-module constant, a shared domain rule, a tokenizer for reviewer-core, a Slack SDK, and Octokit in a route.

   Baseline was decent: it copied the `repos/` pattern and knew about `container.github()`. The recurring gaps:
   - Imports of another module's internals (`../reviews/repository/review.repo.js`, `../pulls/status.ts`), and `new AgentsRepository(tx)` built inside another module.
   - Tenancy checked in the service (`row.workspaceId !== workspaceId`) and filtering done in JS after the query, instead of in SQL `where`.
   - New module "registered in bootstrap" rather than in `modules/index.ts`.
   - A new SDK added without a mock in `adapters/mocks.ts` and without translating errors.
   - No rule for transactions, since the codebase has zero `db.transaction` call sites.
3. **GREEN:** the same scenarios with the skill closed every RED gap. The agents used `container.reviewRepo` and `container.agentsRepo.method(…, tx)`, `import … from '../repo-intel/index.js'`, and SQL predicates with workspace scope. They registered the module in `modules/index.ts`, did GitHub I/O outside the tx, and had reviewer-core define its own `Tokenizer` port.
4. **REFACTOR:** each GREEN "skill friction" report was closed in the text:
   - A business rule that is naturally a `WHERE` goes in a repo method named after the rule. The constant goes in the owner's `constants.ts`.
   - Table ownership: only the owning module **writes** a table. Read-only joins for your own read model are fine.
   - Loops of external effects: idempotency beats batch atomicity. Persist per item and skip done items.
   - Job payloads always round-trip the `jobs` table, so new handlers `parse` with Zod. Existing casts are debt.
   - Red-flag examples are real baseline debt. `modules/repos/` is the reference, and the value import of the schema in `repos/helpers.ts` is not.
   - Modules without `service.ts`/`repository.ts` (`polling`, `workspace`, `settings`) get them for the piece you touch.
   - Services log through a structural `Logger`, never through `fastify`.
   - Ports go in the server copy of `vendor/shared/adapters.ts` only. Check for existing contract enums, and `diff` the vendor copies before editing.
   - A module's `index.ts` is its public API and doesn't re-export `repository`/`routes`.
   - The note that there are zero existing `db.transaction` call sites.

## Sources

All links were verified live on 2026-09-19. The two Medium links returned 403 to the fetcher, so live equivalents replace them.

### Onion / Clean / Hexagonal

- Jeffrey Palermo, [The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) and [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/). The original: all coupling points toward the center, the database is external, and repository interfaces live in the core.
- Herberto Graça, [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/): outer depends on inner, and the domain is independent of infrastructure.
- Oliver Drotbohm, [Sliced Onion Architecture](http://odrotbohm.github.io/2023/07/sliced-onion-architecture/): one onion per module (vertical slice). Modules talk through their public API or events, never through each other's infrastructure. This is the basis for `no-cross-module-internals`.
- Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html): the Dependency Rule.
- Alistair Cockburn, [Hexagonal (Ports & Adapters) Architecture](https://alistair.cockburn.us/hexagonal-architecture/): ports are defined by the application, and adapters plug in.
- [Hexagonal architecture (Wikipedia)](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)): Onion, Hexagonal and Clean are variants of the same idea.
- Khalil Stemmler, [Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/): policy vs detail in Node/TS, with ports as interfaces and adapters as classes.
- André Bazaglia, [Clean architecture with TypeScript: DDD, Onion](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/): a concrete TS layer split.
- Mark Seemann, [Dependency Injection (InfoQ interview)](https://www.infoq.com/articles/DI-Mark-Seemann/): the Composition Root, where the only place that knows the concrete classes is `platform/container.ts`.

### Tools

- Fastify: [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/), [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/), [The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/). Encapsulation plus decorators act as lightweight DI, and a module is a plugin.
- [fastify-clean-template](https://github.com/Luxlorys/fastify-clean-template): clean-architecture rules delivered through Fastify idioms and enforced with dependency-cruiser.
- Drizzle: [Transactions](https://orm.drizzle.team/docs/transactions). `db.transaction(async (tx) => …)`, `tx` has the same API as `db`, and nested calls become savepoints.
- Lazar Nikolov (Sentry), [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/): the caller owns the tx, and repos take an optional `tx`. This is the basis for `DbExecutor`.
- Microsoft, [Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design): repository per aggregate, and unit of work.
- Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/): Zod at the edges, precise types inside.
- dependency-cruiser: [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) (forbidden rules, `$1` group back-references, `dependencyTypesNot`) and [CLI (baseline, `--ignore-known`)](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md).
- Jakub Andrzejewski, [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b): module-boundary rules in CI.
- lastminute.com, [How We Enforce Architecture Boundaries at Scale](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/): incremental, per-module rollout of dependency-cruiser rules.
- Ruben Oostinga (Xebia), [Taking Frontend Architecture Serious with dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/): dependency-cruiser as an architecture fitness function against gradual decay.
