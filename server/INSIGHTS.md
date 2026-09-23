# server — insights

Things that are true about `server/` but not visible in the code. Append-only:
when an entry goes stale, add a dated note under it instead of deleting it.
Cross-package findings go in the [root file](../INSIGHTS.md).
repo-intel findings go in [`src/modules/repo-intel/INSIGHTS.md`](src/modules/repo-intel/INSIGHTS.md).
Agents write here only through the `engineering-insights` skill, whose script
inserts lines and never changes existing ones.

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## What works

## What doesn't work

## Codebase patterns

- **2026-09-23** — A run's USD cost comes from the engine, not the server:
  `reviewPullRequest` returns `costUsd` (OpenRouter's billed `usage.cost`, asked
  for via `usage: { include: true }`; `PriceBook` only as fallback) and it is
  stored in `agent_runs.cost_usd` → read that column; never recompute tokens ×
  price in the server — a real run billed $0.000173 where `pricing.ts` would
  say $0.000247. Evidence: `../reviewer-core/src/llm/openrouter.ts:83,107`,
  `src/modules/reviews/run-executor.ts:213`.

## Tool & library notes

## Recurring errors & fixes

- **2026-09-23** — DB suites fail before any test with `failed to resolve
  reference "docker.io/testcontainers/ryuk:0.11.0"` when Docker can't reach
  Docker Hub → `TESTCONTAINERS_RYUK_DISABLED=true pnpm test`; the
  `pgvector/pgvector:pg16` image is cached and `afterAll` still stops the
  containers (133/133 passed). Evidence: `test/helpers/pg.ts:36`.
  - **2026-09-23** — The same cause can show no ryuk error at all: `beforeAll`
    just hangs and the suite fails with `Hook timed out in 120000ms`, all tests
    skipped. The same env var fixes it (135/135). Evidence: `test/reviews.it.test.ts`.
  - **2026-09-23** — Line evidence for the hang: the 120 s limit is `vitest.config.ts:17` (`hookTimeout: 120_000`), and the hook that hangs is `test/reviews.it.test.ts:104` (`pg = await startPg()`).

## Doc drift

- **2026-09-23** — README says handlers "no longer hand-roll
  `Schema.parse(req.body)`", but `POST /pulls/:id/review` still does;
  `src/app.ts` keeps a duck-typed ZodError fallback so it still returns 422. Evidence:
  `README.md:51-53`, `src/modules/reviews/routes.ts:32`.
- **2026-09-23** — README mentions "the two built-in agents"; the seed creates
  three (General, Security, Performance). Evidence: `README.md:109`,
  `src/db/seed.ts:22`.

## Session notes

- **2026-09-23** — Run Cost Badge (lab task 3): +2 (Codebase patterns, Recurring errors & fixes)
- **2026-09-23** — Findings-by-severity implementation: +1 (Recurring errors & fixes, nuance)
- **2026-09-23** — HW1 fixes, block C (PR-list COST = sum of done runs): +1 (Open questions)
- **2026-09-23** — HW1 fixes, block E (path:line in every entry): +1 (Recurring errors & fixes — line evidence)

## Open questions

- **2026-09-23** — Can `pnpm build && pnpm start` run at all? `tsc` does not
  rewrite the `@devdigest/*` path aliases and does not copy `src/prompts/*.md`
  to `dist`; CI and `scripts/e2e.sh` run the API with `tsx` instead. Not
  verified. Evidence: `tsconfig.json:21-26`, `src/platform/prompts.ts:12-14`.
- **2026-09-23** — `reviews.it.test.ts` "persists the run cost and exposes it on runs, trace, reviews and the PR list" failed once in 9 full `pnpm test` runs and never in 8 isolated runs (error text not captured). A likely cause is a race: `completeAgentRun(status: 'done')` is written before `saveRunTrace`, and `waitForPrRuns` returns as soon as a run is `done`, so the test's `GET /runs/:id/trace` can come too early; the UI's trace drawer has the same window. Save the trace before marking the run done, or make the test wait for the trace? Evidence: `src/modules/reviews/run-executor.ts:243,288`, `test/helpers/runs.ts:12-34`.
