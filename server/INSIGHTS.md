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

## Open questions

- **2026-09-23** — Can `pnpm build && pnpm start` run at all? `tsc` does not
  rewrite the `@devdigest/*` path aliases and does not copy `src/prompts/*.md`
  to `dist`; CI and `scripts/e2e.sh` run the API with `tsx` instead. Not
  verified. Evidence: `tsconfig.json:21-26`, `src/platform/prompts.ts:12-14`.
