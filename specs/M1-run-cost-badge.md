# M1 · Run cost badge
Status: in-progress
Modules: server, client

## Goal
Show what each agent review run costs, and its tokens, in three places:
1. **PR list**: a `COST` column with a compact value (`$0.014`).
2. **PR detail → Agent runs timeline**: under the run time, a line like `9,119 tok · $0.014`.
3. **Agent run drawer → Stats**: a `COST` tile next to Duration / Tokens / Findings.

## Non-goals
- No extra LLM calls. Cost comes from the usage the review already returns.
- No backfill for old runs. They show `—`.
- No cost on the VerdictBanner. The Overview PR brief card is M5 and should reuse `RunCostBadge` when it ships.
- No change to the model-pricing catalog or to eval/CI cost plumbing.

## Design

### Source of truth
reviewer-core `reviewPullRequest()` already returns `ReviewOutcome.costUsd`. It is OpenRouter `usage.cost`, falling back to tokens × price-book. It is `null` if any chunk's cost is unknown. The server persists it and does not recompute it.

### Semantics
- `cost_usd` is nullable USD. `null` means unknown and renders as `—`, never `$0.00`.
- A `done` run stores `outcome.costUsd`. `failed` and `cancelled` runs store `null`, the same way tokens are 0 today.
- The **PR list** cost is the sum of non-null `cost_usd` over the **latest `done` run of each agent** on the PR. It is `null` when no such run has a known cost.

### Server
- DB: `agent_runs.cost_usd double precision NULL`. This is a new migration, `0010_*`. Migration 0009 dropped the old column; that migration is immutable.
- Contracts (server and client copies):
  - `RunStats.cost_usd` and `RunSummary.cost_usd`: `number | null`
  - `PrMeta.cost_usd`: `number | null`
  - `RunStats.cost_usd` is `.nullish()`, because `run_traces.stats` jsonb written before M1 lacks the key. The read path normalises it to `null`.
- `run-executor.ts` persists `costUsd` in `completeAgentRun` and in the trace `stats`.
- `GET /pulls/:id/runs` returns `cost_usd` per run.
- `GET /repos/:id/pulls` computes the aggregate on read, the same way as the latest score.
- `GET /runs/:id/trace` returns `stats.cost_usd`.

### Client
- `src/lib/format.ts`: `formatCost(usd)`, `formatTokens(in, out)`, `formatTokenTotal(in, out)`.
- `src/components/run-cost-badge/RunCostBadge`: variants `compact` (`$0.014`) and `detailed` (`9,119 tok · $0.014`).
- The PR list gets a `cost` column, the timeline row gets a `detailed` badge for done runs, and the drawer gets a `COST` stat.

### Formatting
| Value | Output |
|---|---|
| `null` / `undefined` | `—` |
| `0 < usd < 0.01`, or `0` | `$0.001` (3 decimals) |
| `usd ≥ 0.01` and `< 1` | `$0.014` (3 decimals) |
| `usd ≥ 1` | `$1.23` (2 decimals) |

## Acceptance criteria
- [ ] Every completed run shows its cost in the timeline and the drawer.
- [ ] A run with no data shows `—`, never `$0.00`.
- [ ] The PR list COST column is the sum of the latest done run per agent. A re-run of the same agent is not double-counted.
- [ ] There are zero additional LLM calls.
- [ ] The contracts are identical in the server and client copies.
- [ ] Old traces without `stats.cost_usd` still load.

## Open questions
- Should failed runs keep partial usage? Today the engine throws and the usage is lost.
- Should the PR brief card (M5) reuse `RunCostBadge`?
