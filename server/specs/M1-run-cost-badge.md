# M1 — Run cost badge (server)

UI half: [client/specs/M1-run-cost-badge.md](../../client/specs/M1-run-cost-badge.md).

## Goal
Show the cost and tokens of every review run. The engine already computes a per-run
`costUsd` (`reviewer-core` → `ReviewOutcome.costUsd`: OpenRouter `usage.cost` when present,
otherwise the `PriceBook` estimate = tokens × price). The server currently drops it. This
milestone persists it per run and exposes it on the GET routes the UI reads.

Zero additional model calls: cost comes only from the usage data of the review call itself.

## Scope
**In**
- Persist `cost_usd` on `agent_runs` when a run completes successfully.
- Write `cost_usd` into the run trace stats (`run_traces.trace.stats.cost_usd`).
- Expose `cost_usd` on:
  - `GET /pulls/:id/runs` (`RunSummary[]`): per-run cost.
  - `GET /repos/:repoId/pulls` (`PrMeta[]`): cost of the PR's **latest finished run**
    (`status = 'done'`, newest `ran_at`).
  - `GET /runs/:runId/trace` (`RunTrace.stats.cost_usd`).

**Out**
- Backfilling runs created before this migration (they stay `null`).
- Total spend per PR (sum across runs), budgets and alerts.
- Partial token/cost accounting for failed or cancelled runs.

## API / data changes
- Migration (generated): `agent_runs.cost_usd double precision NULL`.
  We use `double precision` instead of `numeric` so Drizzle returns a `number`. Display needs
  at most 4 decimals, so float precision is enough.
- `completeAgentRun(..., { costUsd })`: the success path passes `outcome.costUsd`, and the
  failed and cancelled paths pass `null`.
- Contracts (`src/vendor/shared/contracts`, mirrored to client):
  - `RunStats.cost_usd: number | null | undefined` (nullish, so traces stored before M1 still parse).
  - `RunSummary.cost_usd: number | null`.
  - `PrMeta.cost_usd: number | null | undefined` (list endpoint only, same as `score`).
- PR list: one extra `IN (...)` query on `agent_runs` filtered to `status='done'` and ordered by
  `ran_at DESC`. The first row per PR wins. This mirrors the existing latest-review score lookup.

### Null semantics
`cost_usd = null` means "no data": the run is running, failed or cancelled, ran before M1, or
used a model with an unknown price. `0` is real data (a free model). The UI shows `—` for null
and `$0.00` for 0.

## Acceptance criteria
- A run that completes successfully stores a non-null `cost_usd` whenever the engine returns one.
- Failed and cancelled runs store `cost_usd = null`.
- `GET /pulls/:id/runs` returns `cost_usd` for every run.
- `GET /repos/:repoId/pulls` returns the `cost_usd` of the latest `done` run, or `null` when the
  PR has no finished run.
- No new outbound calls.
