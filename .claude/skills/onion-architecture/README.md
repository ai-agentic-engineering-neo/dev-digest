# onion-architecture

**Version 1.0.2** · Onion Architecture for `server/`.

| File | Audience | Contents |
|---|---|---|
| [SKILL.md](SKILL.md) | agent | The rules |
| [examples.md](examples.md) | agent | Before/after from `server/src` + the enforcement config |
| README.md | human | Scope, decisions, violation catalogue, sources, changelog |

## Scope

**In:** `server/src` — routes, services, repositories, adapters, ports, container.

**Out:** `reviewer-core/` (decision 2 below), `client/`
([frontend-ui-architecture](../frontend-ui-architecture/SKILL.md)),
Fastify mechanics ([fastify-best-practices](../fastify-best-practices/SKILL.md)),
Drizzle syntax ([drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md)),
schema authoring ([zod](../zod/SKILL.md)).

This skill answers *which ring does this belong in, and which way may it point*.
It does not teach the tools.

## The starting position

`server/src` (107 TS files) **already implements Ports & Adapters** and does it
well: seven port interfaces, an adapter per port, a composition root in
`platform/container.ts`, layered `routes → service → repository` modules, and a
test seam via `ContainerOverrides` / `adapters/mocks.ts`.

Onion adds one thing on top of that hexagon: **an inner domain that depends on
nothing**, with application services orchestrating it. That ring is what is
missing, and every violation below is a symptom of its absence.

So this skill is not a rewrite. It is a name for what exists, plus the missing
centre, plus enforcement.

## Design decisions

**1. Domain is types + pure functions + ports — no entity classes.**
Palermo's domain model is object-oriented; this server is functional TypeScript
with zod contracts. Rich entities here would be cargo cult. The "anemic domain"
label is accepted knowingly: the value of Onion in this codebase is the
dependency rule, not DDD tactics. SKILL.md §2 states this explicitly so nobody
"corrects" it later.

**2. `reviewer-core` stays a sibling library, not the domain core.**
It is the closest thing to a pure core already (`zod`, `openai`,
`@devdigest/shared`), but promoting it would mean extracting its `openai`
dependency behind `LLMProvider`. Not worth the churn now. Honest consequence:
domain-ish code lives in two places, and `reviewer-core` is **not** held to these
rings. SKILL.md names that boundary rather than pretending it away.

**3. Ports move to `server/src/domain/ports/`.**
Settled by measurement, not preference — see V5 below.

**4. Enforcement is a ratchet, not a warning.**
Superseded the original warn-first plan. All six rules are `severity: 'error'`,
and the 20 pre-existing violations are baselined in
`.dependency-cruiser-known-violations.json` via `--ignore-known`. CI is green
today *and* any **new** violation fails immediately — verified by injecting one
(`exit 1`) and removing it (`exit 0`). Warn-first would have left new violations
silent until the whole class was cleared; this gates from day one. Fix a
violation → `pnpm arch:baseline` → the file only ever shrinks.

**5. Repositories stay, but must earn it.**
Drizzle is a typed query builder, not an entity mapper, so a repository over it
can degenerate into a leaky wrapper. Kept for two concrete reasons —
testcontainers tests need the seam, and it keeps SQL out of business logic — and
explicitly *not* kept for hypothetical database portability.

## Violation catalogue

Measured by `pnpm arch:all` on 2026-08-02: **20 violations, 137 modules,
380 dependencies**. All 20 are baselined, so `pnpm arch` passes; this is the
backlog, not the gate. Recorded so the skill is honest about the code it ships
with. Fix opportunistically; do not sweep.

| # | Rule | Count | Where |
|---|---|---|---|
| V1 | `no-container-in-services` | 4 | `reviews`, `agents`, `repos`, `repo-intel` `service.ts` |
| V2 | `routes-are-adapters` | 4 | `polling`, `pulls`, `settings`, `workspace` |
| V3/V4 | `db-only-in-repositories` | 6 | `repos/helpers.ts`, `reviews/{diff-loader,run-executor,service}.ts`, `settings/feature-models.ts` — including two `db/rows.ts` type imports |
| V5 | Ports in a client-shared vendored copy the client never uses | 7 | `vendor/shared/adapters.ts` — not a dep-cruiser rule |
| **V7** | `no-circular` | **5** | 4 through `platform/container.ts`, 1 in `agents/` |
| V8 | `no-cross-module` | 1 | `repos/service.ts` → `repo-intel/constants.ts` |
| V6 | ~~No enforcement~~ | 0 | resolved — `server/.dependency-cruiser.cjs` |

`domain-depends-on-nothing` reports zero because `src/domain/` does not exist
yet. That is a true zero, not a passing rule.

**V1 is the headline.** `constructor(private container: Container)` is Service
Locator: dependencies invisible, failures moved from compile time to run time,
and the service coupled to the composition root — an outward dependency, exactly
what the architecture forbids. The container's own docstring claims the
opposite ("Services depend on these interfaces, not the concrete classes").

**V7 was found by the tool, not by inspection** — and it changes the migration
economics. Four of the five cycles run *through* `platform/container.ts`:

```
repo-intel/service.ts → platform/container.ts → repo-intel/service.ts
```

The container imports the services it constructs, and the services import the
container to reach their dependencies. That is not a separate defect — it is V1
seen from the other side. **Fixing V1 dissolves 4 of the 5 cycles**, which makes
it the single highest-leverage change in the backend. The fifth is independent:
`agents/helpers.ts` ↔ `agents/repository.ts`, where row types live in the
repository and helpers need them.

This cycle class is invisible without `tsPreCompilationDeps: true` — several of
the edges are `import type`.

**V5 is settled.** Every one of the seven interfaces was checked against
`client/src`: zero consumers. Each hit is the definition itself in the client's
own vendored copy, plus one prose mention in a comment. The client's
`vendor/shared/index.ts` still does `export * from './adapters.js'`, so 245 lines
of server infrastructure contracts ride into the client's module graph for
nothing — incidentally a textbook case of the `export *` problem the
[frontend skill](../frontend-ui-architecture/SKILL.md) bans. This refines the
`vendor/shared` drift warning in the root `CLAUDE.md`: for `adapters.ts` it is
not drift, it is dead code.

**V6 is resolved.** `server/.dependency-cruiser.cjs` exists, all rules are
`error` with the current 20 baselined, and `pnpm arch` runs as a step in
`server-unit.yml`'s `typecheck` job. `dependency-cruiser@17` was already a
dependency — used as a *product feature* for repo-intel's import graphs, never as
a linter — so this cost zero new packages.

## Migration order

Cheapest first; each step independently shippable.

1. ~~Add `.dependency-cruiser.cjs` + baseline + CI step~~ — **done**
2. V2 — routes reaching into `db/` (4 files, mechanical)
3. **V1 — container out of service constructors** (4 files) — also clears 4 of
   the 5 cycles in V7; do this before anything else
4. V5 — move ports; delete the client's dead copy
5. V3 / V4 — extract pure rules out of infrastructure files
6. V7's remaining cycle — `agents/helpers.ts` ↔ `agents/repository.ts`
7. After each fix: `pnpm arch:baseline` to shrink the baseline

All rules are already `error`. The baseline — not the severity — is what keeps
CI green, so nothing needs "flipping" later: new violations fail from day one,
and the grandfathered 20 shrink as the list above is worked through.

| Command | Does |
|---|---|
| `pnpm arch` | CI gate — fails only on a violation not in the baseline |
| `pnpm arch:all` | show everything, baseline included — the real backlog |
| `pnpm arch:baseline` | regenerate the baseline after fixing something |
| `pnpm arch:graph` | SVG dependency graph (needs graphviz `dot`) |

## Frontmatter

| Key | Purpose |
|---|---|
| `name` | skill id, matches the folder |
| `description` | *what* the skill covers |
| `when_to_use` | *when* to fire, including negative triggers |
| `version` | bump with the changelog |

`when_to_use` is live trigger text: Claude Code concatenates it onto
`description` with `" - "` in the skill listing the model sees. The negative half
matters here because three neighbouring skills touch the same files — Fastify
mechanics, Drizzle syntax and zod authoring each have their own skill.

## Sources

### Onion Architecture — canonical

- **[Jeffrey Palermo — The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)** — the 2008 origin. Traditional layering couples every layer to infrastructure and the UI transitively to data access; the fix is that "all code can depend on layers more central, but code cannot depend on layers further out from the core." Also the line SKILL.md §1 is built on: "The database is not the center. It is external."
- **[part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/)** · **[part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/)** · **[part 4, after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/)** — layer detail and the retrospective.
- **[Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)** — the clearest account of Onion as Ports & Adapters plus DDD's internal layers (domain model → domain services → application services). Source of the "outer layers may skip inner layers, avoiding proxy methods" rule in §2.
- **[Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)** — the synthesis; best single map of how these overlap.
- **[Alistair Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)** — the 2005 original Onion builds on, and what `server/src` already implements.
- **[Eric Damtoft — Onion vs Clean vs Hexagonal](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91)** — "same idea, different vocabulary" framing.
- **[NDepend — Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/)** — treats enforcement as first-class rather than as a diagram; the argument behind §12.

### TypeScript / Node.js application

- **[Khalil Stemmler — Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)** — the most substantial TS-specific treatment of layers and use cases.
- **[Remo Jansen — Implementing SOLID and the onion architecture in Node.js with TypeScript](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-10ad)** — concrete TS layering. Note it assumes decorator-based DI (InversifyJS), which this codebase deliberately does not use.
- **[Alex Rusin — Clean Architecture in Node.js: the Repository Pattern with TypeScript](https://blog.alexrusin.com/clean-architecture-in-node-js-implementing-the-repository-pattern-with-typescript-and-prisma/)** — repository interface in the core, implementation outside.
- **[Melzar — onion-architecture-boilerplate](https://github.com/Melzar/onion-architecture-boilerplate)** — a full Node/TS reference tree for comparing folder shapes.

### Counter-arguments — deliberately included

A skill that only advocates is worth less than one that says where the pattern
costs more than it returns.

- **[Jay Freestone — You might not need the repository pattern](https://www.jayfreestone.com/writing/you-might-not-need-the-repository-pattern/)** — modern ORMs are typed query builders, not entity mappers; a repository over them degenerates into a leaky wrapper without real commitment. Feeds decision 5 and SKILL.md §6's caveat.
- **[Mark Seemann — Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/)** and **[Service Locator violates SOLID](https://blog.ploeh.dk/2014/05/15/service-locator-violates-solid/)** — the authority for V1: hidden dependencies, run-time instead of compile-time failure, ISP violation.
- **[Jimmy Bogard — Service Locator is not an Anti-Pattern](https://www.jimmybogard.com/service-locator-is-not-an-anti-pattern/)** — the dissent, and why the composition root legitimately resolves.
- **[Microsoft — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)** — repository-per-aggregate, and why not repository-per-table.

### Stack-specific practice

- **[Fastify — Plugins guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)** and **[Plugins reference](https://fastify.dev/docs/v5.1.x/Reference/Plugins/)** — encapsulation: `register` creates a new scope and decorations flow to descendants only. The mechanism behind routes-as-adapters and self-registering modules.
- **[@fastify/awilix](https://github.com/fastify/fastify-awilix)** — the ecosystem-standard DI for Fastify. Listed as the yardstick for what constructor injection should look like, **not** as a recommendation to adopt it over `platform/container.ts`.
- **[Drizzle — Transactions](https://orm.drizzle.team/docs/transactions)** — `db.transaction(tx => …)`, the API §8 is built on.
- **[Drizzle issue #2543 — Unit of Work](https://github.com/drizzle-team/drizzle-orm/issues/2543)** — there is no explicit UoW; confirms the transaction scope must be threaded by the application service.
- **[Paul Serban — Drizzle ORM Best Practices](https://www.paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)** — "repository interfaces depend only on domain types"; translate DB errors into domain errors at the boundary.
- **[Zod — Basics](https://zod.dev/basics)** and **[Defining schemas](https://zod.dev/api)** — parse-don't-validate, the basis for §7.
- **[fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)** — the mechanism the existing schema-first route convention already uses.

### Enforcement tooling

- **[dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)** — `forbidden` rule shape, regex path matching, and the group-matching (`$1`) pattern used by `no-cross-module`.
- **[Ken Miyashita — Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)** — a worked dependency-cruiser config for exactly this layering.
- **[Xebia — Taking Frontend Architecture Serious With Dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)** — the rollout strategy adopted in decision 4: start permissive, tighten per rule.
- **[Atomic Object — Dependency Cruiser: Restrict Imports](https://spin.atomicobject.com/dependency-cruiser-imports/)** — short practical intro.
- **[eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)** — the ESLint-side alternative, also cited by the frontend skill so both name the same toolbox.

## Changelog

### 1.0.2 — 2026-08-02

Enforcement wired into CI as a step in `server-unit.yml`'s `typecheck` job
(placed there because it needs the reviewer-core deps that job already
installs). Replaced warn-first with a baseline ratchet: all rules at `error`,
20 violations grandfathered via `--ignore-known`, so a new violation fails the
build immediately. Added `arch:all` and `arch:baseline` scripts.

Also corrected: the "server/package.json is skip-worktree" comment in
`server-unit.yml` is stale — `git ls-files -v` shows no flagged files in the
repo, so `pnpm arch` can be called by name rather than inlined.

### 1.0.1 — 2026-08-02

Enforcement installed: `server/.dependency-cruiser.cjs` + `pnpm arch` /
`pnpm arch:graph`. Running it surfaced a violation class inspection had missed —
5 circular dependencies (V7), 4 of them through `platform/container.ts` — and one
cross-module import (V8). Violation catalogue replaced with measured counts.
`no-circular` starts at `warn` like every other rule so the gate is green on
adoption. `db-only-in-repositories` widened from `^src/db/(schema|client)` to
`^src/db/` so row-type imports (V4) are caught.

### 1.0.0 — 2026-08-02

Initial release. Four rings on top of the existing hexagon; 14 sections;
before/after drawn from `server/src`. Five design decisions and six
grep-measured violations.

## Still to do

`pnpm arch` is not yet wired into CI — it runs locally and passes, but nothing
enforces it on a pull request. Until a CI step calls it, the rules are checked
only by whoever remembers to run them.

## Maintenance

Bump `version` in [SKILL.md](SKILL.md) and add a changelog entry when rules
change. Update the violation catalogue when a class reaches zero, and flip the
matching rule to `error` in the same commit.
