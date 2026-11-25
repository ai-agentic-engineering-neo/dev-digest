# Testing

Onion gives you a natural split: the inside is unit-tested in memory; the outside is integration-tested against real infrastructure.

## Unit tests (default, hermetic)

**Target:** services, `reviewer-core`, pure helpers.

**How:** build the app (or construct the service directly) with `ContainerOverrides` passing mocks from `server/src/adapters/mocks.ts`.

```ts
import { buildApp } from '../../app.js';
import { MockLLMProvider, MockGitHubClient } from '../../adapters/mocks.js';

const app = await buildApp({
  overrides: {
    llm: { openai: new MockLLMProvider() },
    github: new MockGitHubClient(),
  },
});
```

No Docker. No keys. No network. Runs in milliseconds.

This is the Microsoft Learn Figure 5-10 pattern — unit tests exercise the inner rings with fakes substituted at the composition root.

**Command:** `pnpm exec vitest run --exclude '**/*.it.test.ts'`

## Integration tests (`*.it.test.ts`)

**Target:** repositories, routes end-to-end, adapter correctness.

**How:** real Postgres via testcontainers. Harness lives at `server/test/helpers/pg.ts` — it spins up Postgres in Docker, runs migrations, seeds.

```ts
// server/src/modules/reviews/service.it.test.ts
import { setupTestDb } from '../../../test/helpers/pg.js';
// ...
```

**Naming invariant:** any test file that imports `test/helpers/pg.ts` **must** use the `.it.test.ts` suffix. The default test command excludes this suffix; CI runs them separately so a missing Docker daemon doesn't break hermetic runs.

This is the Microsoft Learn Figure 5-11 pattern — tests that verify infrastructure correctness, not business rules.

**Command:** `pnpm exec vitest run .it.test`

## Contract alignment

Zod schemas in `@devdigest/shared` drive both request validation (Fastify route) and response serialization. The port between presentation and application is a single source of truth — do not duplicate these schemas client-side. The `fastify-type-provider-zod` integration ensures invalid input is rejected with 422 before the handler runs.

## Domain invariants

Some rules are enforced inward and no outer adapter may bypass them. In `reviewer-core`:

- `groundFindings()` drops findings that do not cite a real diff line — the grounding gate is mandatory.
- The review score is recomputed from surviving findings; the model's self-reported score is ignored.

Moving either of these outward (e.g. into `run-executor.ts` or a route) breaks the dependency rule — they are domain logic, not infrastructure.

## When a test needs an outer-ring dependency

If your "unit test" needs Docker, keys, or network, one of two things is true:

1. The code under test lives in the wrong ring — move it outward (an adapter) or inward (pure logic).
2. The test is actually an integration test — rename it `*.it.test.ts`.

Never add global env vars, real API calls, or `beforeAll` network fetches to a hermetic test file.
