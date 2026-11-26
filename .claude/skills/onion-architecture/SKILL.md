---
name: onion-architecture
description: Use when adding or changing backend code under server/src or reviewer-core/src - a new module, route, service, repository, adapter or port; when deciding which file a piece of logic, a query or a type belongs in; when wiring a dependency into platform/container.ts or a routes plugin; when `pnpm deps:validate` reports a violation; or when reviewing a backend diff for layering. Not for client/ or e2e/.
---

# Onion Architecture — `server/` and `reviewer-core/`

**Imports point inward.** Code may depend on a ring closer to the centre, never
on one further out. Inner rings declare interfaces (ports); outer rings
implement them. Postgres, Drizzle, Fastify, Octokit and the LLM SDKs are
details at the edge, not the foundation.

`pnpm deps:validate` (run from `server/`) fails the build on a violation. This
skill explains what the rules mean and what to write instead.

Worked code from this repo: [examples.md](examples.md). Sources:
[references.md](references.md). Mechanics of the tools themselves are in
`fastify-best-practices`, `drizzle-orm-patterns` and `zod`.

## Rings and files

| Ring | Files | May import |
|---|---|---|
| 0 Domain | `modules/<m>/domain.ts`, `constants.ts`; `@devdigest/shared` contracts; `platform/errors.ts` | ring 0, `zod`, `@devdigest/reviewer-core` |
| 1 Application | `modules/<m>/service.ts`, `ports.ts`, and any other module file not named below | ring 0, its own `ports.ts`, another module's `index.ts`, pure platform files (`errors`, `resilience`, `local-only`, `model-router`, `trace-builder`, `run-logger`) |
| 2 Infrastructure | `modules/<m>/repository.ts` (or `repository/`), `routes.ts`, `repo-intel/pipeline/`, `adapters/`, `db/`, the rest of `platform/`, `modules/_shared/` | anything inward |
| 3 Composition root | `platform/container.ts`, `app.ts`, `server.ts`, `modules/index.ts`, the top of each `routes.ts` plugin | everything |

A module file with any other name is ring 1, so a new file gets the strict
rules by default. `reviewer-core/` is rings 0–1 as a whole; its one adapter is
`src/llm/openrouter.ts`.

## Where does it go?

| You are writing | File |
|---|---|
| A rule or calculation that needs no I/O | `domain.ts` — take the clock, ids and config as arguments |
| A type shared with the client | the Zod contract in `@devdigest/shared` (both vendored copies) |
| A type only the server uses | `ports.ts` if only a port mentions it; `domain.ts` if a domain rule uses it too (`ports.ts` then imports it — never the reverse) |
| A use case: load, decide, save, notify | a method on the service |
| Something the service needs from outside | an interface in `ports.ts` |
| SQL, a Drizzle call, a row-to-contract mapper | `repository.ts` |
| A call to GitHub, an LLM, git, the filesystem | an adapter in `adapters/`, behind a port |
| Request parsing, status codes, SSE framing | `routes.ts` |
| `new SomeRepository(...)`, `new SomeService({...})` | the top of the `routes.ts` plugin, or `platform/container.ts` if two modules share it |

## Adding a feature: inside out

1. `domain.ts` — the rule as a pure function, with a plain unit test.
2. `ports.ts` — the interface the use case needs, named for the business
   operation (`markCloned`, not `updateRow`), returning contract or domain types.
3. `service.ts` — the use case. Its constructor takes one `deps` object typed
   by ports.
4. `repository.ts` / an adapter — `implements` the port.
5. `routes.ts` — wire at the top of the plugin, then a handler that reads the
   context, calls one service method and sets the status.
6. `pnpm deps:validate && pnpm typecheck`, then the tests.

## Rules by tool

**Fastify**
- A handler does three things: `getContext`, one service call, status code.
- Schemas go in the route options (`schema: { body, params, querystring }`).
  Never `Schema.parse(req.body)` in a handler. For a body that may be absent,
  use `z.preprocess((b) => b ?? {}, Schema)`; `.default({})` still 422s on a
  request with no body.
- `req`, `reply`, `app` and `req.log` stay in `routes.ts`. Pass plain values
  and, if the use case logs, a `Logger` port.
- `routes.ts` imports no `drizzle-orm`, `db/`, `adapters/` or SDK. A query in
  a route means a service method is missing; add it.

**Drizzle**
- `drizzle-orm`, `db/schema` and `db/rows` are imported only from
  `repository.ts`, `db/`, `adapters/` and `platform/jobs.ts`.
- Rows stop at the repository. Each method returns a contract or domain type;
  the mapper is a private function in `repository.ts`. `$inferSelect` never
  appears in a service, `domain.ts` or `ports.ts`.
- A transaction lives inside one repository method named for the use case. `tx`
  is not a parameter of any port. Never hold a transaction across an LLM or
  GitHub call.
- A module writes only its own tables. It reads another module's data through
  that module's port, wired in the container.
- No business decisions in a repository. Scoping by workspace is persistence;
  deciding whether something may happen is the service or `domain.ts`.

**Zod**
- Parse once, at the edge: routes through the type provider, adapters for
  GitHub and LLM payloads, `platform/config.ts` for env. Inside, trust the type.
- Contracts in `@devdigest/shared` are the domain language. Do not hand-write a
  parallel entity type, and do not add mapper layers between them.

**Wiring**
- A service never imports `platform/container.ts`, not even `import type`.
  It declares what it uses:
  `constructor(private deps: { repos: RepoStore; git: RepoCloner; jobs: JobQueue })`.
- Depend on the narrowest shape: `Pick<GitClient, 'clone'>`, not `GitClient`.
- An adapter built from a secret that can change (`container.github()`,
  `container.llm(id)`) is injected as a resolver, `() => Promise<GitHubClient>`,
  not as an instance.
- A port is shaped by what the service needs, not by the tool's API. A pure
  function needs no port; import it.
- Another module is used through its `index.ts` (types and constants) or
  through a port wired in the container. No other cross-module import, type-only
  included.
- An adapter may import a module's `ports.ts` to implement it, and nothing else
  from `modules/`.

**Errors**
- The core throws named errors from `platform/errors.ts` (`NotFoundError`,
  `BadRequestError('stable_code', message)`). No numeric status outside that
  file, no `reply.code()` below `routes.ts`.

**Config and clock**
- `process.env` is read in `platform/config.ts` and `adapters/secrets/local.ts`
  only (plus the `db/migrate.ts` and `db/seed.ts` CLI scripts). Everything else
  receives values through its dependencies.
- `domain.ts` never calls `Date.now()`, `new Date()` or `Math.random()`.

**reviewer-core**
- No database, GitHub, filesystem, env or clock. The only side effect is the
  injected `LLMProvider`. It imports nothing from `server/` except
  `@devdigest/shared`, and `openai` only in `src/llm/openrouter.ts`.

**Tests**

| Ring | Test | Doubles |
|---|---|---|
| `domain.ts` | plain unit test | none |
| service | unit test, `new Service({ ...fakes })` | hand-written in-memory ports |
| repository | `*.it.test.ts` with testcontainers | real Postgres |
| routes | `buildApp({ overrides })` + `app.inject` | adapter mocks from `adapters/mocks.ts` |

A domain rule that needs a mock is not in the domain. A service test that
reassigns a private field means the service is missing a port.

## When `pnpm deps:validate` fails

| Rule | Meaning | Fix |
|---|---|---|
| `domain-is-pure` | `domain.ts` reached outside ring 0 | pass the value in as an argument, or move the code to the service; a type it shares with `ports.ts` is declared in `domain.ts` |
| `core-no-infrastructure` | a service imports `db/`, `adapters/`, the container or impure `platform/` | declare a port in `ports.ts` and inject it |
| `core-no-packages` | a service imports an npm package other than `zod` | wrap it in an adapter behind a port |
| `core-no-io-builtins` | `node:fs`, `node:child_process`, … in the core | move it to an adapter or repository |
| `core-uses-ports` | a service imports `repository.ts`, `routes.ts` or `pipeline/` | import the interface from `ports.ts`; wire in `routes.ts` |
| `routes-are-thin` | a route imports `db/`, `drizzle-orm`, an adapter or an SDK | add a service method |
| `repository-is-persistence-only` | a repository imports HTTP code, an adapter or a service | move the decision to the service |
| `no-cross-module-internals` | module A imports module B's internals | export it from B's `index.ts`, or wire a port in the container |
| `adapters-implement-ports` | an adapter imports module code other than `ports.ts` | move the constant into the adapter or pass it in |
| `platform-below-modules` | `platform/` imports a module | wire it in `container.ts` |
| `reviewer-core-*`, `contracts-are-pure` | the pure packages reached outward | inject it through the function's input |
| `no-circular` | an import cycle | usually a symptom of one of the above |

Fix the code. Do not edit `.dependency-cruiser.cjs` to let a violation through,
and do not add to `.dependency-cruiser-known-violations.json`: that file only
shrinks (`pnpm deps:baseline` after removing violations) until it is deleted.

## What the checker cannot see

It reads imports, nothing else. Check these by hand in every backend diff:

```sh
# from server/
grep -rnE "container\.db|\.db\.(select|insert|update|delete|query|execute)" src/modules --include='routes.ts'
grep -rn "process\.env" src --include='*.ts' | grep -vE "platform/config\.ts|adapters/secrets/local\.ts|db/(migrate|seed)\.ts|adapters/git/simple-git\.ts"
grep -rnE "Date\.now\(\)|new Date\(\)|Math\.random\(\)" src/modules --include='domain.ts'
grep -rnE "new AppError\([^)]*, *[0-9]{3}" src/modules
```

Also by reading: a service parameter typed `unknown` or `any` that receives
`req` or `reply`; a repository method that returns a query builder; a handler
that calls two service methods and decides between them.

## Excuses that are not exceptions

| Excuse | Reality |
|---|---|
| "This routes file already has queries, I'm following the pattern" | That file is a recorded violation. Add the service method and move what you touch. |
| "It's one small query" | Size is not the rule; direction is. The service method is three lines. |
| "It's only a type import, nothing at runtime" | The checker counts type-only imports on purpose. A service typed by a row breaks when the column changes. |
| "The service needs five things, passing the container is simpler" | Then its signature should say five things. The container hides them and cannot be faked. |
| "A port with one implementation is over-engineering" | The second implementation is the in-memory fake in the unit test. |
| "It's urgent, I'll move it later" | `deps:validate` fails now, in CI, on the same commit. |
| "I'll add it to the baseline" | The baseline only shrinks. |
| "helpers.ts is pure, it just maps the row" | A row mapper imports the schema. It belongs in `repository.ts`. |
| "Reading `process.env` here is harmless" | It skips validation in `platform/config.ts` and makes the code untestable without mutating globals. |

## Do not over-build

- No entity classes, aggregates or value-object wrappers. The domain is Zod
  contracts, plain types and pure functions.
- No second DTO type next to a contract, and no mapper except row → contract.
- No port for a pure function, and no repository abstraction "in case we leave
  Postgres". The seam exists for tests and to keep SQL out of use cases.
- A trivial module still has a service; it may be a few one-line methods.
- `server/src/modules/repo-intel/pipeline/` is infrastructure by rule. Build on
  the `RepoIntel` facade; do not restructure the pipeline.
