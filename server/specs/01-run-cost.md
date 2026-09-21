# 01 — Run cost (server)

Related specs:
- UI: [`client/specs/01-run-cost.md`](../../client/specs/01-run-cost.md)
- Engine: [`reviewer-core/specs/01-run-cost.md`](../../reviewer-core/specs/01-run-cost.md)

## Goal

Persist the USD cost and token usage of **every** agent run, including failed and
cancelled ones, and expose them to five UI surfaces:
- PR list: total per PR
- PR timeline: per run
- run-trace drawer: per run
- review accordion header: per run
- verdict banner: per run

This brings back what `d45ab0d` removed, and adds a per-PR total plus usage for
failed and cancelled runs.

Today the engine computes cost only on success. `reviewPullRequest` returns
`outcome.costUsd`, summed over chunks and `null` as soon as any chunk is unpriced.
OpenRouter uses the real `usage.cost` from the API, falling back to the PriceBook
(live `/models` prices, then the static table). OpenAI and Anthropic use the static
`adapters/llm/pricing.ts` table. `run-executor` throws that value away. On failure
or cancel it also writes `tokens_in = tokens_out = 0`, even when the model has
already answered, because the usage accumulated inside the engine and the
provider is lost together with the thrown error.

## Data semantics

| Field | Where | Meaning |
|---|---|---|
| `agent_runs.cost_usd` | DB, `double precision NULL` | USD cost of every LLM response the run received, whatever the run status. See the table below. |
| `agent_runs.tokens_in/out` | DB (existing) | Same as today for `done` runs. **Changed:** failed and cancelled runs now store the real usage instead of `0`. |
| `RunSummary.cost_usd` | `GET /pulls/:id/runs` | `agent_runs.cost_usd` as stored. |
| `RunStats.cost_usd` | `run_traces.trace.stats` | The same value copied into the trace document. `nullish` because traces written before this change have no key. |
| `ReviewRecord.cost_usd`, `.tokens_in`, `.tokens_out` | `GET /pulls/:id/reviews` | Usage of the run that produced the review (`reviews.run_id` → `agent_runs`). `nullish`: the value is absent when the review has no `run_id` or the run was deleted. |
| `PrMeta.cost_usd` | `GET /repos/:id/pulls` | `SUM(cost_usd)` over **all** runs of the PR (any status, `local` + `ci`). Unknown costs are skipped. `null` only when no run of the PR has a known cost. |

What `cost_usd` holds for a run:

| Situation | `tokens_in/out` | `cost_usd` |
|---|---|---|
| `done`, priced model | engine totals | engine total |
| `done`, unpriced model | engine totals | `NULL` |
| `failed`/`cancelled` after ≥1 LLM response | sum of the received responses (usage meter) | sum of their costs; `NULL` if any response is unpriced |
| `failed`/`cancelled` before any LLM response (diff load failed, 429 on the first call, cancelled while queued) | `0` | `0`, because nothing was billed |
| Orphaned run reaped on boot (`reapStaleRunningRuns`) | unchanged (`NULL`) | `NULL` |
| Run created before migration `0010` | as stored | `NULL` |

Decisions (agreed 2026-09-21):
- PR list shows the **total of all runs**, not the last run and not the last batch.
- **No backfill.** Old runs stay `NULL` and show "—".
- Failed and cancelled runs **record the usage spent before the error** (see
  the reviewer-core spec for how usage is captured).
- `double precision`, not `numeric`. This matches `eval_runs.cost_usd`,
  `ci_runs.cost_usd` and the column that `0009` dropped.

## Scope

- Migration `0010_*`: `ALTER TABLE agent_runs ADD COLUMN cost_usd double precision`
  (nullable, no default). Generate it with `pnpm db:generate`. Never edit `0009`.
- `db/schema/runs.ts`: `costUsd: doublePrecision('cost_usd')`.
- **Usage capture in the executor** (`run-executor.ts`):
  - Create one `UsageMeter` per run: `{ tokensIn, tokensOut, costUsd, calls }`, with
    `costUsd` becoming `null` once any unpriced response is added. Put it in a small
    pure helper, `modules/reviews/usage-meter.ts`, with a unit test.
  - Pass `onUsage: meter.add` to `reviewPullRequest`. The engine forwards it to
    every `completeStructured` call, and the provider calls it once per HTTP
    response, including schema-invalid retry attempts.
  - Success path: write `outcome.tokensIn/out/costUsd` to `completeAgentRun` and to
    `trace.stats`. The meter must agree with these values; a test asserts it.
  - Failure/cancel catch path: write `meter.tokensIn/out/costUsd` instead of `0`/`0`.
    Pass the same values to `traceFromBuffer` so `trace.stats` matches.
  - Diff-load failure path (no LLM call made): tokens `0`, cost `0`.
- Cancel race: `cancelRunIfRunning` sets only `status`, and the executor's later
  `completeAgentRun` (unconditional `WHERE id = ?`) overwrites the row with the usage. No
  change is needed, but an integration test covers it.
- **Providers** (`adapters/llm/openai.ts`, `adapters/llm/anthropic.ts`, `adapters/mocks.ts`):
  call `req.onUsage?.({ tokensIn, tokensOut, costUsd })` right after every response in
  `completeStructured`, before parsing, with **per-attempt** (delta) values and
  `costUsd = estimateCost(model, in, out)`. Wrap the callback in `try/catch` so it
  never breaks the call (same invariant as the engine). The OpenRouter provider lives in
  reviewer-core and is covered in its spec.
- `repository/run.repo.ts` + `repository.ts`: `costUsd` in the `completeAgentRun` values
  and `cost_usd` in `listRunsForPull`. Add `usageForRuns(runIds)`, one `IN` query
  returning a `Map<runId, { tokensIn, tokensOut, costUsd }>`.
- `service.ts` `reviewsForPull` + `helpers.ts` `reviewToDto`/`ReviewDto`: attach
  `cost_usd`, `tokens_in`, `tokens_out` from `usageForRuns` (one query, not one per review).
- `modules/pulls/routes.ts` (`GET /repos/:id/pulls`): one grouped query,
  `SELECT pr_id, SUM(cost_usd) FROM agent_runs WHERE workspace_id = ? AND pr_id IN (…) GROUP BY pr_id`.
  Run it next to the existing latest-review-score query and map the result to `cost_usd`.
- Contracts, updated in **both** `server/src/vendor/shared` and `client/src/vendor/shared`:
  - `adapters.ts`: `export interface LlmUsage { tokensIn: number; tokensOut: number; costUsd: number | null }`
    and `StructuredRequest.onUsage?: (u: LlmUsage) => void`
  - `trace.ts`: `RunStats.cost_usd: z.number().nullish()`, `RunSummary.cost_usd: z.number().nullable()`
  - `review-api.ts`: `ReviewRecord.cost_usd / tokens_in / tokens_out: nullish()`
  - `platform.ts`: `PrMeta.cost_usd: z.number().nullish()`

## Out of scope

- Requests that **time out on our side** (`withTimeout`) or break mid-stream. No
  response arrives, so there is no usage to record, although the provider may still
  bill. This limit is documented and not solved.
- Usage of runs orphaned by a server restart. The process died with the meter.
- The non-structured `complete()` path. Reviews don't use it, and eval/CI already
  have their own cost columns.
- Changing the prices themselves (`pricing.ts`, `PriceBook`).
- Agent Performance and CI Runs screens, budgets, alerts, per-period aggregates.

## Acceptance criteria

1. After `pnpm db:migrate`, `agent_runs` has a nullable `cost_usd` column. Existing rows are `NULL`.
2. A successful run on a priced model stores `agent_runs.cost_usd` equal to
   `outcome.costUsd`, and `run_traces.trace.stats.cost_usd` holds the same value.
3. A run on a model missing from both the PriceBook and the static table stores `NULL`
   cost but real tokens. The run itself still completes normally.
4. A run that fails after the model answered, for example schema validation failing
   on every retry or the second map-reduce chunk throwing, stores the **sum of all
   received responses** in `tokens_in/out` and `cost_usd`, not `0`. The trace
   `stats` hold the same numbers.
5. A run cancelled after ≥1 LLM response stores that usage. This holds even though
   `POST /runs/:id/cancel` already flipped the status, because the executor's final
   write wins.
6. A run that fails before any LLM response stores tokens `0` and cost `0`.
7. `GET /pulls/:id/runs` returns `cost_usd` for every run.
8. `GET /pulls/:id/reviews` returns `cost_usd`, `tokens_in`, `tokens_out` on each review
   with a `run_id`, using one extra query per request.
9. `GET /repos/:id/pulls` returns `cost_usd` per PR, equal to the sum of the PR's known
   run costs, **including failed and cancelled runs**. It is `null` for a PR with no runs
   or only unknown costs. It is workspace-scoped.
10. Deleting a run from the timeline lowers the PR total on the next list fetch.
    The sum is computed on read.
11. Reading a trace written before this change still works, and `stats.cost_usd` is absent/`null`.
12. `pnpm typecheck` passes, and so do the unit and integration suites. reviewer-core
    `npm run typecheck` + `npm test` pass as well.

## Implementation plan

1. **Contracts**: `LlmUsage` + `onUsage`, then the four DTO fields, in both vendor copies.
   Update the `RunTrace` fixture in `test/contracts.test.ts` and add a case with
   `cost_usd` absent (an old trace).
2. **Engine + OpenRouter**: see the reviewer-core spec. Land it before step 5,
   because the server compiles reviewer-core from source.
3. **Schema + migration**: `db/schema/runs.ts`, then `pnpm db:generate`. Review the
   generated SQL and make sure it contains only the `ADD COLUMN` statement.
4. **Providers**: `onUsage` per attempt in `openai.ts`, `anthropic.ts` and `mocks.ts`.
   The mock gets an option to fail N times after emitting usage, so failure paths can be tested.
5. **Executor**: `usage-meter.ts` + unit test, then wire it in `run-executor.ts`
   (success, catch, diff-load-failure, `traceFromBuffer`).
6. **Persistence + reads**: `completeAgentRun` signature, `listRunsForPull`,
   `usageForRuns` + `reviewToDto`, then the grouped `SUM` in `pulls/routes.ts`
   (`sql<number | null>\`sum(...)\`.mapWith(Number)` so the driver never hands back a string).
7. **Tests** (`*.it.test.ts`, Docker):
   - `reviews.it.test.ts`: a done run stores `cost_usd` on the run row, in `RunSummary`, in the
     trace and on `ReviewRecord`. A run whose mock LLM emits usage and then throws is
     `failed` with non-zero tokens and cost. A run cancelled mid-way keeps its usage.
   - the pulls list test: a PR with two priced runs (one failed) and one `NULL` run returns
     their sum, and a PR without runs returns `null`.
8. `pnpm typecheck` + `pnpm exec vitest run` (unit + `.it.test`).

## Open questions

- None blocking. If per-PR totals ever need a "partial" flag (some runs unpriced),
  add `cost_unknown_runs` to `PrMeta`. That is not planned now.
