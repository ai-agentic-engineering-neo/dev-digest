# Testing per ring (Vitest + testcontainers + `app.inject`)

The payoff of Onion: the core is tested without infrastructure; infrastructure is tested against the
real thing; the edges are tested end-to-end through Fastify.

| Ring | Test type | File | Tools |
|---|---|---|---|
| Domain | pure unit | `test/<area>-<topic>.test.ts` | Vitest only; no mocks needed (see `test/pulls-status.test.ts`) |
| Application (service) | unit with fakes | `test/<area>-service.test.ts` | in-memory port fakes, `Mock<Port>` from `adapters/mocks.ts`; pass a `Pick<Container,…>` object |
| Infrastructure (repository) | integration | `test/<area>-<topic>.it.test.ts` | `test/helpers/pg.ts` (testcontainers pgvector, migrations); gate on `dockerAvailable()` |
| Adapter | contract / unit | `test/adapters.test.ts`, `test/astgrep.test.ts` | real lib on fixtures; no network |
| Presentation (routes) | HTTP via inject | `test/routes-smoke.test.ts` (no DB) or `*.it.test.ts` (DB) | `buildApp({ config, overrides })` + `app.inject(...)` |

## Rules

- Any test that touches Postgres **must** be `*.it.test.ts` (CI split).
- Swap dependencies through `ContainerOverrides`, never by `vi.mock`-ing module paths — if you can't
  override something, it isn't behind a port yet (fix that first).
- A service test that needs Docker is a smell: the service reaches infrastructure directly.
- Unit run on Windows: `node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'`.

```ts
// service test with narrow deps — no Container, no DB
const svc = new AgentsService({
  agentsRepo: new InMemoryAgentsStore([agentFixture]),
  llm: async () => new MockLLMProvider(),
} as Pick<Container, 'agentsRepo' | 'llm'>);
```

## References
- [Fastify — Testing guide](https://fastify.dev/docs/latest/Guides/Testing)
- Repo: `TESTING.md`, `server/test/helpers/`
