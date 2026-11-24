# Run Cost — server

Persist and expose the USD cost of every review run so the client can show it in
three places: the PR list (COST column), the PR Detail agent-runs timeline, and the
run-trace drawer Stats. Client side: [`client/specs/run-cost.md`](../../client/specs/run-cost.md).

## Context
- `reviewer-core` already computes `costUsd` per run (`reviewer-core/src/review/run.ts`).
  It uses OpenRouter's real `usage.cost` when present, otherwise the injected estimator
  (`platform/price-book.ts` → `adapters/llm/pricing.ts`). If any chunk is unpriced,
  the run cost is `null`.
- **Gap:** `modules/reviews/run-executor.ts` reads only `tokensIn/tokensOut/grounding`
  from the outcome and drops `costUsd`. `agent_runs` has no column for it.
- The mock LLM (`adapters/mocks.ts`) returns `costUsd: 0.001`, so e2e is deterministic.

## Acceptance criteria
- **S1.** Every `done` run persists `agent_runs.cost_usd` (USD, `double precision`,
  nullable) from `outcome.costUsd`.
- **S2.** `failed` / `cancelled` runs persist `cost_usd = null`.
- **S3.** `GET /pulls/:id/runs` (`RunSummary`) returns `cost_usd: number | null` per run.
- **S4.** New traces carry `stats.cost_usd` (nullable). Old traces without the field
  still parse.
- **S5.** `GET /repos/:id/pulls` (`PrMeta`) returns `cost_usd` = **total** cost of all
  agent runs on the PR (every agent, every run; runs without cost are skipped).
  `null` when no run on the PR has a cost.
- **S6.** No extra LLM calls. No backfill of historical runs (they stay `null` → `—`).

## Implementation plan
1. **Schema** — `src/db/schema/runs.ts`: add `costUsd: doublePrecision('cost_usd')` to
   `agentRuns` (same pattern as `schema/ci.ts`). Generate the migration with
   `pnpm db:generate`; never hand-edit `migrations/**`.
2. **Contracts** — in **both** vendored copies (`server/src/vendor/shared/contracts/`
   and `client/src/vendor/shared/contracts/`):
   - `trace.ts`: `RunSummary.cost_usd: z.number().nullable()`;
     `RunStats.cost_usd: z.number().nullish()` (nullish → old traces still parse).
   - `platform.ts`: `PrMeta.cost_usd: z.number().nullish()`.
3. **Repository** — `modules/reviews/repository/run.repo.ts`:
   - `completeAgentRun`: accept `costUsd?: number | null`, set `costUsd: values.costUsd ?? null`.
   - `listRunsForPull`: map `cost_usd: run.costUsd`.
   - Mirror the signature in the wrapper `modules/reviews/repository.ts` (`completeAgentRun`).
4. **Executor** — `modules/reviews/run-executor.ts`:
   - Success path: destructure `costUsd` from `outcome`, pass to `completeAgentRun`,
     add `cost_usd: costUsd` to `trace.stats`.
   - Failure/cancel path and `traceFromBuffer`: `cost_usd: null`.
5. **PR list** — `modules/pulls/routes.ts`: one grouped query
   `SELECT pr_id, SUM(cost_usd) FROM agent_runs WHERE pr_id IN (…) GROUP BY pr_id`
   (`sql\`sum(...)\`.mapWith(Number)`); SQL `SUM` skips nulls and returns null when all
   are null. Return it as `cost_usd` in the row mapping.
6. **Tests** — `test/reviews.it.test.ts`: `cost_usd` is consistent across agent_runs,
   trace, `/pulls/:id/runs` and `/repos/:id/pulls`; with "run all agents" the PR-list
   cost equals the sum over all runs.

## Verification
- `pnpm db:generate && pnpm db:migrate` — the migration only adds `cost_usd`.
- `pnpm test`.
- Run a review locally → `GET /pulls/:id/runs` and `GET /repos/:id/pulls` include `cost_usd`.

## Out of scope
Backfill of old runs, cost in the verdict plate.
