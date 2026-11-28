# Testing per ring (Vitest)

| Ring | Test type | Needs | File |
|---|---|---|---|
| domain-model | pure unit | nothing — no mocks | `domain-model/*.test.ts` |
| domain-services | pure unit | in-memory fakes only if it calls a port | `domain-services/*.test.ts` |
| application-services | unit with **fakes** of ports | `InMemoryRepoStore`, `FakeUnitOfWork`, mocks from `src/adapters/mocks.ts` | `application-services/*.test.ts` |
| infrastructure (Drizzle) | integration | Postgres via testcontainers (`test/helpers/pg.ts`) | `infrastructure/*.it.test.ts` |
| routes | HTTP via `app.inject` | container with overrides | `test/**` per `TESTING.md` |

Rules:
- Palermo tenet 4: the core must run without infrastructure — if a use-case test needs Docker, a port is missing.
- Prefer fakes (working in-memory implementations of the port) over `vi.mock` of modules; module mocks couple the test to file paths, fakes couple it to the contract.
- Put reusable fakes next to the port (`domain-services/ports.fakes.ts`) or in `src/adapters/mocks.ts` for shared ports.
- Integration tests must be named `*.it.test.ts`. On Colima run them with the `DOCKER_HOST=… TESTCONTAINERS_RYUK_DISABLED=true` prefix from `server/INSIGHTS.md`.
- Read `../TESTING.md` before adding a suite or changing CI.
