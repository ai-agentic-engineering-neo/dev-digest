---
name: testing
description: Testing by layer — pure core, mocked ports, adapters against the real thing
metadata:
  tags: testing, vitest, mocks, integration, layers
---

# Testing by layer

The architecture pays for itself in tests. Each ring has one way to test it, and a test
that reaches for a heavier tool than its ring allows is reporting a leak.

| Layer | How it is tested | File name |
|---|---|---|
| Domain model / domain services | pure inputs → assertions, no doubles | `<area>.test.ts` |
| Application services (use cases) | real service + mock ports | `<area>.test.ts` |
| Driven adapters (Drizzle, GitHub, git) | against the real dependency | `<area>.it.test.ts` |
| Driving adapters (routes) | `app.inject()` with mocked services/ports | `<area>.test.ts` |

## The suffix routes the CI lane

Any test that imports `test/helpers/pg.ts` **must** end in `*.it.test.ts`; hermetic
tests must not. The suffix is what puts a test in the right lane, so a DB-backed test
with the wrong name fails in the hermetic run.

Integration tests self-skip when Docker is absent — a green run does not prove they
executed. Say which lane actually ran when reporting results.

## Use-case tests use mocks, not a database

```ts
// GOOD — one use case, substituted collaborators, no Docker
const reviews = new InMemoryReviewRepository();
const llm = stubLLM({ findings: [finding('src/a.ts', 12)] });
const service = new ReviewService(reviews, agents, llm, bus);

await service.runReview(workspaceId, prId, agentId);

expect(reviews.runs).toHaveLength(1);
```

If writing that test requires standing up Postgres, the rule under test is in the wrong
ring — move it inward and the test follows.

## Mocks belong to the ports

`src/adapters/mocks.ts` holds the mock implementations, and `ContainerOverrides` injects
them. Prefer constructing the service directly with mock ports for a unit test; use the
container override path when the test exercises wiring or a route.

Do not mock what you own three layers down (do not stub Drizzle) and do not mock the
system under test. Mock the port, exercise the real rule.

## Standing project rule

Tests are written but **not run** unless the user explicitly asks. Write the test, then
state the exact command and what it would prove.
