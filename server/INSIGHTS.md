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

- **2026-09-23** — The DB suite is not hermetic: "run all enabled agents reviews with each enabled agent" also starts the seeded agents, which use `openrouter`, while `appWith` overrides only the `openai` LLM, so the real `OpenRouterProvider` runs with the `OPENROUTER_API_KEY` that `dotenv` loads from `server/.env`. A preload that blocks `openrouter.ai` intercepted a real HTTPS request from that one test → every `pnpm test` makes small billed calls; override `llm.openrouter` (or `secrets`) in `appWith`. Evidence: `test/reviews.it.test.ts:495-504`, `test/reviews.it.test.ts:113-125`, `src/db/seed.ts:12`.
- **2026-09-23** — Running the unit tests can fail a review running in the dev stack: `routes-smoke.test.ts` calls `buildApp({ config })` without a `db`, so it connects to `DATABASE_URL` from `server/.env` (the dev DB), and every `buildApp` runs the boot reaper that marks all `running` runs `failed` (read from the code) → don't run `pnpm test` while a dev review is in flight, or pass a throwaway `db`. Evidence: `test/routes-smoke.test.ts:15`, `src/app.ts:80-85`.

## Codebase patterns

- **2026-09-23** — A run's USD cost comes from the engine, not the server:
  `reviewPullRequest` returns `costUsd` (OpenRouter's billed `usage.cost`, asked
  for via `usage: { include: true }`; `PriceBook` only as fallback) and it is
  stored in `agent_runs.cost_usd` → read that column; never recompute tokens ×
  price in the server — a real run billed $0.000173 where `pricing.ts` would
  say $0.000247. Evidence: `../reviewer-core/src/llm/openrouter.ts:83,107`,
  `src/modules/reviews/run-executor.ts:213`.

## Tool & library notes

- **2026-09-23** — `grep` treats `src/adapters/depgraph/index.ts` as binary (`file` reports it as `data`), so `grep -r` and `grep -I` silently skip it → search it with `grep -a` or the Grep tool. Evidence: `src/adapters/depgraph/index.ts:27`.
  - **2026-09-23** — Line evidence: the byte that makes it binary is a literal NUL inside the edge key at `src/adapters/depgraph/index.ts:93` (``const key = `${from}\0${to}` `` with a raw `\0`); `:27` is just `export interface DepGraph {`. Evidence: `src/adapters/depgraph/index.ts:93`.

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
- **2026-09-23** — The `POST /pulls/:id/review` contract comment says the persisted reviews "are also returned once the (synchronous) run completes", but runs are fire-and-forget and the response's `reviews` is always `[]` → read results from `GET /pulls/:id/reviews` after the runs finish (tests: `waitForPrRuns`). Evidence: `src/vendor/shared/contracts/review-api.ts:44-48`, `src/modules/reviews/service.ts:137`.
- **2026-09-23** — `completeAgentRun`'s comment says failed/cancelled runs store `0` blockers; the code writes `values.blockers ?? null`, so they are `NULL` → treat `blockers == null` as "no gate result", not zero. Evidence: `src/modules/reviews/repository/run.repo.ts:156,173`.
- **2026-09-23** — README's env table gives `DEVDIGEST_CLONE_DIR` default `./clones`; the code default is `~/.devdigest/workspace` (`./clones` only comes from `.env.example`). And README says the Zod contracts drive response serialization, but no route declares a `response` schema, so that error-handler branch never runs. Evidence: `README.md:18-20,99`, `src/platform/config.ts:66-67`, `src/app.ts:130-134`.

## Session notes

- **2026-09-23** — Run Cost Badge (lab task 3): +2 (Codebase patterns, Recurring errors & fixes)
- **2026-09-23** — Findings-by-severity implementation: +1 (Recurring errors & fixes, nuance)
- **2026-09-23** — HW1 fixes, block C (PR-list COST = sum of done runs): +1 (Open questions)
- **2026-09-23** — HW1 fixes, block E (path:line in every entry): +1 (Recurring errors & fixes — line evidence)
- **2026-09-23** — HW1 fixes, block F (docs/architecture.md, specs/review-flow.md): +6 (What doesn't work ×2, Doc drift ×2, Tool & library notes, Open questions nuance)
- **2026-09-23** — PR description + insights audit: +1 (Tool & library notes — line evidence)

## Open questions

- **2026-09-23** — Can `pnpm build && pnpm start` run at all? `tsc` does not
  rewrite the `@devdigest/*` path aliases and does not copy `src/prompts/*.md`
  to `dist`; CI and `scripts/e2e.sh` run the API with `tsx` instead. Not
  verified. Evidence: `tsconfig.json:21-26`, `src/platform/prompts.ts:12-14`.
- **2026-09-23** — `reviews.it.test.ts` "persists the run cost and exposes it on runs, trace, reviews and the PR list" failed once in 9 full `pnpm test` runs and never in 8 isolated runs (error text not captured). A likely cause is a race: `completeAgentRun(status: 'done')` is written before `saveRunTrace`, and `waitForPrRuns` returns as soon as a run is `done`, so the test's `GET /runs/:id/trace` can come too early; the UI's trace drawer has the same window. Save the trace before marking the run done, or make the test wait for the trace? Evidence: `src/modules/reviews/run-executor.ts:243,288`, `test/helpers/runs.ts:12-34`.
- **2026-09-23** — Cancelling a run while its LLM call is in flight is probably lost (read from the code, not reproduced): `POST /runs/:id/cancel` sets the bus flag and marks the row `cancelled`, but the flag is only checked before each LLM call, and after the call returns `completeAgentRun` writes `done` with no status guard and the review is saved. Guard the final update with `status = 'running'`, or check the flag after the engine returns? Evidence: `src/modules/reviews/service.ts:87-88`, `src/modules/reviews/run-executor.ts:209-210`, `src/modules/reviews/repository/run.repo.ts:176`.
  - **2026-09-23** — Worse than a race: `cancelRun` calls `runBus.complete(runId)` in the same request, and `complete()` deletes the cancel flag, so by the next check the flag is usually gone and a live run is effectively never cancelled; it then overwrites `cancelled` with `done`/`failed` (read from the code). Evidence: `src/modules/reviews/service.ts:85-90`, `src/platform/sse.ts:76-79`.
