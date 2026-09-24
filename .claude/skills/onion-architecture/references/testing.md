# Testing by ring

| Ring | Test type | Doubles | File |
|---|---|---|---|
| domain / `helpers.ts` / reviewer-core | pure unit | none — pass plain data | `test/<area>.test.ts`, `reviewer-core/test` |
| application | unit | in-memory fakes of ports (classicist, not call-count mocks) | `test/<module>-service.test.ts` |
| infrastructure (repository) | integration, real Postgres + pgvector | none | `test/<module>.it.test.ts` (Testcontainers) |
| infrastructure (SDK adapter) | contract/unit with recorded payloads or a fake HTTP server | fake server | `test/adapters.test.ts` |
| http | `app.inject()` | fake ports via `ContainerOverrides` / `src/adapters/mocks.ts` | `test/routes-*.test.ts` |

Rules:
- Prefer the impureim sandwich: use case gathers data via ports → pure domain
  function decides → use case writes. Then most logic is tested with no doubles.
- A test importing `test/helpers/pg.ts` must be named `*.it.test.ts`.
- First Testcontainers run pulls `pgvector/pgvector:pg16` and can hit the 120s hook
  timeout — `docker pull` it once first.
- Don't fake Drizzle itself; for repository behaviour use the real DB.

Commands (from `server/`):
- unit: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- integration: `pnpm exec vitest run .it.test`
