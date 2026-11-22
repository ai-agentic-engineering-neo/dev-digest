# M1 — Run cost badge (server)

UI side: [`client/specs/M1-cost-badge.md`](../../client/specs/M1-cost-badge.md).

## Goal
Persist the LLM spend of every agent review run and expose it on the existing
GET routes so the studio can show it. **Zero extra model calls**: the cost is
already computed by reviewer-core (`ReviewOutcome.costUsd`): OpenRouter's
`usage.cost` (`usage: { include: true }`), else a `PriceBook` / `pricing.ts`
estimate, summed across chunks. Before M1 the server dropped it.

## Scope / Non-goals
**In scope**
- `agent_runs.cost_usd` (`double precision`, nullable), migration `0010_*`.
- `run-executor` writes `costUsd` on `done`, plus `trace.stats.cost_usd`.
- Failed/cancelled runs keep `cost_usd = null`.
- Expose the cost on the run, trace and PR-list routes below.

**Non-goals**
- Backfilling legacy runs from stored tokens. They stay `null` and render "—".
- Partial cost of runs that failed mid-way.
- Agent Performance / Multi-Agent aggregates (`observability.ts` cost fields).
- Budgets and limits.

## API / contract changes
Changes land in both `@devdigest/shared` copies. All new fields are `.nullish()`, so old
traces and fixtures stay valid.

| Contract | Field | Route |
|---|---|---|
| `RunSummary` (`contracts/trace.ts`) | `cost_usd` | `GET /pulls/:id/runs` |
| `RunStats` (`contracts/trace.ts`) | `cost_usd` | `GET /runs/:id/trace` (absent on legacy traces) |
| `PrMeta` (`contracts/platform.ts`) | `cost_usd` | `GET /repos/:id/pulls`: cost of the PR's **latest `done` run** |

For the PR list, `failed` and `running` runs are skipped, so a trailing 429 does not blank
out the last real spend. Semantics: `null` = unknown, and `0` = a real free run.

## Acceptance criteria
1. A new `done` run stores `cost_usd`. If any chunk is unpriced, the run cost is `null`.
2. The cost appears on all three routes above. A newer failed run does not hide the list cost.
3. The number of LLM calls per run is unchanged.
4. Tests:
   - `test/reviews.it.test.ts` ("M1 cost badge …")
   - `reviewer-core/test/run.test.ts` (usage sum, null propagation)
