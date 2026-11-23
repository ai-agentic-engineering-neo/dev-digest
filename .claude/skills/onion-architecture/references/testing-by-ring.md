# Testing by ring

Contents: [The mapping](#the-mapping) · [Domain](#domain-ring--pure-unit-tests) · [Application](#application-ring--fakes-through-containeroverrides) · [Infrastructure](#infrastructure-ring--real-postgres) · [Presentation](#presentation-ring--appinject) · [Repo mechanics](#repo-mechanics) · [Smells](#smells)

The point of the rings is cheap, fast tests at the center and a few slow, realistic tests at the edge. `TESTING.md` at the repo root has the overall strategy; this is the per-ring view. [O1][K1]

## The mapping

| Ring | Test type | Needs | Name / location |
|---|---|---|---|
| Domain (pure helpers, rules) | Plain unit | nothing | `*.test.ts` (e.g. `pulls/cost.test.ts`, `pulls/findings.test.ts`, `test/reviews-helpers.test.ts`, `test/pulls-status.test.ts`) |
| Application (services, executors) | Unit with fakes | `ContainerOverrides` / mocks from `adapters/mocks.ts` | `*.test.ts` |
| Infrastructure — repositories | Integration | real Postgres (Testcontainers, pgvector image) | **`*.it.test.ts`** (required name) |
| Infrastructure — adapters | Unit against faked transport | faked HTTP/process; **no live network** | `*.test.ts` (e.g. `test/adapters.test.ts`, `test/git-adapter-safety.test.ts`) |
| Presentation (routes) | `app.inject` | `buildApp({ config, overrides })` | `test/routes-smoke.test.ts` (no DB), `*.it.test.ts` for DB-backed routes |

Rule from `CLAUDE.md`: **DB-backed tests MUST be named `*.it.test.ts`; everything else is hermetic.** Hermetic means no Docker, no network, no keys.

## Domain ring — pure unit tests

If a rule is pure (`deriveReviewStatus`, `rollupSeverities`, `isConfigChange`, `toAgentDto`), test it with plain objects: no container, no mocks, no async. These should be the most numerous tests. If you can't test a rule this way, it has leaked a dependency inward — move the dependency out and pass the data in. [O1][K1]

## Application ring — fakes through `ContainerOverrides`

Build the service with a container whose ports are mocks and assert behavior: calls made to the port, errors translated, order of operations.

```ts
const github = new MockGitHubClient({ login: 'octocat' });
const container = new Container(config, db, { github, llm: { openai: new MockLLMProvider(…) } });
const service = new ReviewService(container);
```
- Mocks live in `adapters/mocks.ts` (`MockLLMProvider`, `MockEmbedder`, `MockGitHubClient`, `MockGitClient`, `MockCodeIndex`, `MockAuthProvider`, `MockSecretsProvider`). Extend them rather than writing ad-hoc stubs per test.
- Services that still pull `Db` through the container need a real database; if a service has substantial logic you want in a no-Docker test, extract the logic into pure helpers (domain tests) or add a repository interface with a fake (`drizzle-infrastructure.md`, "When a repository interface is worth it").
- No keys, no network: the product boots with none and so do tests.

## Infrastructure ring — real Postgres

Repository behavior (SQL, upserts, ordering, constraints, `pgvector`) is verified against a real database, not a mock — mocking Drizzle only tests the mock. Use `test/helpers/pg.ts`: `startPg()` starts `pgvector/pgvector:pg16` via Testcontainers, runs migrations and returns a Drizzle client; `dockerAvailable()` gates the suite so it skips cleanly without Docker. [TC1]
- Name the file `*.it.test.ts`; run with `pnpm exec vitest run .it.test` (needs Docker).
- Tip from `INSIGHTS.md` (2026-11-19): under Rancher Desktop, `dockerAvailable()` can return true yet Testcontainers fail with `Could not find a working container runtime strategy`; run with `DOCKER_HOST=unix://$HOME/.rd/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.
- One fixture per file/suite, not per test (container start is slow).
- Test workspace scoping explicitly: a row from another workspace must not be returned.

Adapters get **faked transport** tests (recorded responses, a temp git repo, a stubbed client) — see `test/git-adapter-safety.test.ts`. Live-service tests are not part of the suite. [V1]

## Presentation ring — `app.inject`

Use `buildApp({ config, overrides })` and `app.inject({ method, url, payload })`. Cover: schema validation (422 envelope), status mapping (`NotFoundError` → 404), response shape, and that the route calls the service (not the other way round). `test/routes-smoke.test.ts` runs without Docker because `/health` and validation paths never touch the database. Don't re-test business rules here; those belong in domain/application tests.

## Repo mechanics

- Server unit: `pnpm exec vitest run --exclude '**/*.it.test.ts'`.
- Server integration (needs Docker): `pnpm exec vitest run .it.test`.
- `pnpm test`/`pnpm typecheck` may fail on `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` in the agent shell; see `server/INSIGHTS.md` for the direct-binary workaround.

## Smells

- A "unit" test that boots Fastify or Postgres to check one rule → the rule isn't pure.
- Mocking Drizzle chains (`db.select().from().where()…`) — test the repository against Postgres, or test the rule without a repository.
- A service test that needs 6 overrides → the service depends on too much; narrow its dependencies.
- An adapter test that hits the real API.
- A route test asserting domain math.
