# M1 — Run cost badge

## Goal
Show what each agent review run cost, so users see spend per run and per PR without leaving the review flow.
Cost is shown on three screens: PR list, PR "Agent runs" timeline, and the run trace drawer.

## Scope
- **PR list** (`/repos/:repoId/pulls`): new **COST** column between STATUS and UPDATED — cost of the PR's **latest completed run** (compact, e.g. `$0.014`).
- **Agent runs timeline** (PR detail → Agent runs): under the run time, `9,119 tok · $0.0013` (total tokens · cost) for completed runs.
- **Run trace drawer → Stats**: 4th card **COST** between TOKENS and FINDINGS (e.g. `$0.06`).

### Out of scope
- Verdict banner cost line (slide's 4th location) — separate task.
- Persisting cost in the DB (no migration); historical price accuracy.
- FINDINGS column and Run Review button seen in the PR-list mockup (not in current code).
- Sum of all runs per PR, cost dashboards/analytics.

## Data & calculation
- **Computed on read** on the server: `cost = PriceBook.estimate(model, tokens_in, tokens_out)` — live OpenRouter price (cached 6h), else the static table in `server/src/adapters/llm/pricing.ts`.
- No extra model calls (the OpenRouter `/models` price list is already cached by `PriceBook`).
- `cost_usd = null` when: model is null, tokens are null, `tokens_in + tokens_out === 0` (failed/cancelled runs), or the model has no known price.
- Known limitation: the value is an estimate at **today's** price, not the price paid at run time.

## Contract (`@devdigest/shared`, server copy first, then mirror to client)
| Schema | File | New field |
|---|---|---|
| `RunSummary` | `contracts/trace.ts` | `cost_usd: number \| null \| undefined` (`z.number().nullish()`) |
| `RunStats` | `contracts/trace.ts` | `cost_usd` (nullish — stored traces stay valid; filled on read) |
| `PrMeta` | `contracts/platform.ts` | `cost_usd` (nullish, list endpoint only, like `score`) |

API: `GET /repos/:id/pulls` → `PrMeta.cost_usd` (latest `status='done'` run by `ran_at`) · `GET /pulls/:id/runs` → `RunSummary.cost_usd` · `GET /runs/:id/trace` → `stats.cost_usd`.

## UI
- Shared `client/src/components/run-cost/`: `RunCostBadge` with `variant="compact"` (`$0.014`) and `variant="detailed"` (`9,119 tok · $0.0013`); helpers `formatCost`, `formatTokenTotal`.
- `formatCost`: `null`/`undefined` → `—`; `< $1` → 2 significant digits (`$0.0013`, `$0.014`, `$0.06`); `≥ $1` → 2 decimals (`$1.24`). Never `$0.00` for missing data.
- `formatTokenTotal`: `tokens_in + tokens_out` with thousands separator (`9,119 tok`).
- Trace drawer reuses the existing `Stat` atom with `formatCost(stats.cost_usd)`.
- i18n: `prReview.list.columns.cost` = "Cost", `runs.trace.stat.cost` = "COST".

## Acceptance criteria
1. Every completed (`done`) run with known model + tokens shows a cost on the timeline and in the trace Stats.
2. A run without data shows `—`, never `$0.00`; failed/running runs show no cost line on the timeline.
3. PR list COST = cost of the latest `done` run; a PR without such a run shows `—`.
4. Values on all three screens use the same `formatCost` rules.
5. No new LLM calls, no DB migration; existing tests pass; new unit tests cover the cost helper and `formatCost`.

## Open questions
- If the latest run of a PR failed, the list shows the latest **done** run's cost (decision: done runs only).
