# Testing by ring

The point of the dependency rule is that inner rings are testable **without** Fastify, Postgres, or the network. Follow `TESTING.md` for suite mechanics; this file says *what to test where*.

| Ring | Test type | Doubles | File suffix |
|---|---|---|---|
| 1 Domain (`helpers.ts`, `status.ts`, mappers) | Pure unit | none | `*.test.ts` |
| 3 Services / executors / pipelines | Unit | in-memory fakes of ports (repo interface, `LLMProvider`, `GitHubClient`) from `adapters/mocks.ts` or local fakes | `*.test.ts` (hermetic, no Docker) |
| 4 Repositories | Integration against real Postgres (testcontainers, `test/helpers/pg.ts`) | none | **`*.it.test.ts`** (required suffix) |
| 4 Routes | `app.inject()` with `ContainerOverrides` | mock adapters | `*.test.ts` or `*.it.test.ts` if it needs the DB |
| 4 Adapters | Contract tests against the port; SDK mocked at the HTTP boundary | SDK stub | `*.test.ts` |

## Rules

1. **A service unit test must not import `drizzle-orm`, `db/*` or `fastify`.** If it has to, the service is in the wrong ring.
2. **Fake the port, not the ORM.** Write `class InMemoryAgentsRepo implements AgentsRepo`; do not mock Drizzle query builders.
3. **Repositories are tested for real.** Mappers and workspace scoping are the value there; mocking the DB proves nothing.
4. **One contract, two implementations.** A port's mock and its real adapter should pass the same behavioural assertions where practical.
5. **Route tests assert the edge only:** status, envelope, schema validation errors (422 shape), error mapping — not business rules.
6. **Anything importing `test/helpers/pg.ts` must end in `*.it.test.ts`** or the unit/integration split breaks (`server/AGENTS.md`).
7. **Boundary regressions are tests too:** `pnpm arch:check` runs in CI (`server-unit.yml`). A new violation fails the build; never "fix" it by growing the baseline.

## Sources

Palermo — "enables testing with mocks instead of real infrastructure" · Cockburn, [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) (app driven equally by tests and users) · Skill: `fastify-best-practices` (inject) · `TESTING.md`.
