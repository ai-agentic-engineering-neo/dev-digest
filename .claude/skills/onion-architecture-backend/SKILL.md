---
name: onion-architecture-backend
description: "Enforces onion architecture in server/ (@devdigest/api): which ring a file belongs to, what it may import, how to scaffold a module as routes → service → ports → repository with Fastify, Drizzle and Zod, and how to run and fix the dependency-cruiser boundary check. Use before any change under server/src: adding an endpoint or module, a repository, an adapter, a service, a refactor, or when asked where code goes. Trigger phrases: new module, new route, add endpoint, repository, adapter, service, ports, onion, layers, architecture check, boundary, where does this go, /onion-architecture-backend."
argument-hint: "[audit | new-module <name> | <question>]"
paths:
  - "server/**"
allowed-tools:
  - "Bash(.claude/skills/onion-architecture-backend/scripts/check-arch.sh *)"
  - "Bash(./.claude/skills/onion-architecture-backend/scripts/check-arch.sh *)"
  - "Read"
  - "Grep"
metadata:
  tags: architecture, onion, hexagonal, ports-and-adapters, fastify, drizzle, zod, dependency-cruiser
---

# Onion architecture for the backend

**Lifecycle:** Product

`server/` is an onion: dependencies point inward, inner rings define the
interfaces that outer rings implement, and the core compiles without any
driver, framework or database (Palermo's four tenets, `references/principles.md`).
This skill tells you which ring a file is in, what it may import, how to build a
module, and how to keep the boundary check green. The check itself is
`server/.dependency-cruiser.cjs`; `references/enforcement.md` explains it.

## Ring map

Paths are relative to `server/src/`.

| Ring | Where | May import | Never imports |
|---|---|---|---|
| 0 Contracts | `vendor/shared/contracts/**`, `platform/errors.ts` | zod | anything else in `src/` |
| 1 Ports | `vendor/shared/adapters.ts`, `modules/<m>/ports.ts`, `modules/repo-intel/types.ts` | ring 0, same-module `constants.ts` | drizzle, `db/`, fastify, `Container`, adapters, services |
| 2 Application | `modules/<m>/service.ts`, `helpers.ts`, `constants.ts`, executors, loaders (everything in a module that is not routes or repository) | rings 0–1, `platform/errors`, `platform/run-logger`, `platform/resilience` | drizzle, `db/schema`, `db/rows`, fastify, `platform/container`, other modules |
| 3a Driven adapters | `modules/<m>/repository.ts` (or `repository/`), `db/**`, `adapters/**`, `platform/{jobs,sse,price-book}` | rings 0–1, drivers (drizzle-orm, octokit, simple-git, SDKs), `platform/errors`, `platform/resilience` | `modules/**` (adapters), services, routes, `Container` |
| 3b Driving adapters | `modules/<m>/routes.ts`, `modules/_shared/**`, `modules/index.ts` | ring 2 service of the same module, ring 1, fastify, zod, `app.container` | drizzle, `db/`, repositories |
| Root | `platform/container.ts`, `app.ts`, `server.ts` | everything | — |

`@devdigest/reviewer-core` is an external ring-0/1 engine: only `platform/**`,
`modules/reviews/**` and `vendor/shared/contracts/**` import it.

## The rules

Each rule is a named `forbidden` entry in `.dependency-cruiser.cjs`; the name
in brackets is what a failing check prints.

1. **Routes never touch persistence** [`routes-no-persistence`]. `routes.ts` validates with a Zod route schema, resolves `getContext`, calls the service, returns the DTO. No `drizzle-orm`, no `db/`, no repository import.
2. **Drizzle lives in the driven ring only** [`drizzle-only-in-driven-ring`]: repositories, `db/`, `adapters/`, `platform/jobs.ts`, `app.ts` (health check).
3. **Services depend on ports, receive explicit deps** [`application-no-container`, `ports-are-pure`]. A module declares `ports.ts` (`XRepositoryPort` plus `XDeps`); `repository.ts` implements the port; `Container` owns the concrete instance; `routes.ts` does `new XService({ repo: app.container.xRepo })`. A service never imports `Container`: that is Service Locator and hides what it really needs (Seemann).
4. **Row types stay in the driven ring** [`application-no-row-types`]. `$inferSelect` and `db/rows.ts` are persistence types. The repository maps rows to DTOs before they cross the port. Simple structures cross boundaries, never rows or entities (Martin).
5. **Adapters never import modules** [`adapters-no-modules`]. Constants an adapter needs live in the port file or in the adapter.
6. **No module imports another module** [`no-cross-module`]. Share through `@devdigest/shared`, or expose the dependency on `Container` and inject it.
7. **`@devdigest/shared` is a leaf** [`shared-is-a-leaf`]. It is copied verbatim to the client.
8. **Framework stops at routes** [`application-no-fastify`]. Services, ports and repositories never import fastify. Request-bound values (`workspaceId`, `userId`) are resolved in `routes.ts` and passed as plain arguments.
9. **Validate once, at the edge.** Route schemas (`params`, `body`, `querystring`, `response`) through `withTypeProvider<ZodTypeProvider>()`. Never `Schema.parse(req.body)` in a handler. Adapters parse third-party JSON on receipt (`references/zod.md`).
10. **Services decide, repositories run the transaction.** A multi-table write is one port method whose implementation wraps `db.transaction` (`references/drizzle.md`).
11. **Errors**: rings 0–2 throw `AppError` subclasses; adapters wrap driver errors in `ExternalServiceError`; only `app.ts` maps to HTTP.
12. **Every repository method takes `workspaceId`** (existing server rule).
13. **No runtime cycles** [`no-circular`]. Type-only cycles through `Container` are ignored by this rule and caught by rule 3.

Not checkable by import analysis, enforced by ESLint instead: `process.env`
is read only in `platform/config.ts` and `adapters/secrets/`
(`no-restricted-syntax`, error).

## Workflow

### Guide mode (default, while editing `server/src`)

1. For each file you will touch, name its ring from the table and say what it may import. If a file mixes rings (a route with a Drizzle query, a service holding `container.db`), say so before editing.
2. New behaviour goes in the innermost ring that can hold it: pure logic in `helpers.ts`, orchestration in `service.ts`, SQL in `repository.ts`, HTTP shape in `routes.ts`.
3. A new external dependency (SDK, CLI, file system) is a driven adapter: interface in `vendor/shared/adapters.ts` (or the module's `ports.ts`) → implementation in `adapters/<vendor>/` → getter on `Container` → mock in `adapters/mocks.ts` → `ContainerOverrides` key.
4. Before finishing, run `scripts/check-arch.sh`. A new violation is a bug in the change, not a candidate for the baseline. Fix it with a recipe from `examples/bad-vs-good.md`.
5. If the change removes a legacy violation, run `scripts/check-arch.sh --baseline` so the baseline shrinks, and mention the new count in the commit body.

### Audit mode (`/onion-architecture-backend audit`)

Run `scripts/check-arch.sh --all`. Report the violations grouped by rule, name
the smallest fix for each group, and order them by effort (see the migration
order in `references/enforcement.md`). Do not edit code in audit mode.

### New module checklist (`/onion-architecture-backend new-module <name>`)

Copy `examples/good-module/` (a complete `skills` module) and adapt it. A
module is done when all of these exist:

- [ ] `ports.ts`: DTO types, input types, `<Name>RepositoryPort`, `<Name>Deps`. Plain types only.
- [ ] `repository.ts`: `implements <Name>RepositoryPort`, takes `Db`, every method takes `workspaceId`, maps rows to DTOs, owns `db.transaction`.
- [ ] `service.ts`: `constructor(private readonly deps: <Name>Deps)`, business rules, throws `AppError` subclasses.
- [ ] `helpers.ts` / `constants.ts`: pure functions and values, no I/O.
- [ ] `routes.ts`: default-exported Fastify plugin, Zod route schemas, `getContext` first in every handler, builds the service from `app.container`.
- [ ] `platform/container.ts`: lazy `get <name>Repo()` returning the port type, plus an optional `ContainerOverrides` key.
- [ ] `modules/index.ts`: registered in the static `modules` record.
- [ ] Tests: service unit test with an in-memory fake of the port (no Docker); repository `.it.test.ts`; route smoke through `app.inject()`.
- [ ] DTO the client needs → Zod schema in `vendor/shared/contracts/`, then copy to `client/src/vendor/shared/`.
- [ ] `scripts/check-arch.sh` is green with no new baseline entries.

## Baseline policy

`server/.dependency-cruiser-known-violations.json` lists the legacy
violations that existed when the check was introduced (31 on 2026-09-25).
CI runs `pnpm lint:arch`, which ignores them and fails on anything new.

- Never add to the baseline. If a change needs a new exemption, the design is wrong; ask.
- Regenerate it only after removing violations (`--baseline`), and only in the same commit as the fix.
- The ESLint mirrors in `server/eslint.config.mjs` are warnings for editor feedback; the cruiser is the gate.

## References

- `references/principles.md`: Palermo's tenets, the Dependency Rule, ports and adapters, DDD repositories and application services, with quotes and links.
- `references/fastify.md`: plugins as driving adapters, encapsulation, decorators, `buildApp` vs `listen`, `inject()` tests.
- `references/drizzle.md`: Drizzle inside the driven ring, row-to-DTO mapping, transactions, typed mocks, migrations.
- `references/zod.md`: contracts vs route schemas vs adapter parsing.
- `references/di-and-testing.md`: composition root, explicit deps, fakes per ring, what each test tier covers.
- `references/enforcement.md`: how the cruiser config and baseline work, adding a rule, the migration order for the 31 legacy violations.
- `references/sources.md`: bibliography, every URL verified 2026-09-25.
- `examples/good-module/`: a complete module (`skills`) that passes every rule; `examples/bad-vs-good.md`: the real violations in this repo and their fixes.
