# Spec — Run Cost Badge (server side)

Status: implemented · Lab L01, task 3 · UI side: [client/specs/run-cost-badge.md](../../client/specs/run-cost-badge.md)

## Goal
Show what each review run cost (USD + tokens) so the user has a first personal cost metric.
**Zero extra model calls**: cost comes from data we already get on every LLM call.

## Where the number comes from
- `reviewer-core` already sums `costUsd` per chunk (`reviewer-core/src/review/run.ts`).
  - OpenRouter: the real `usage.cost` from the API response; fallback to the live PriceBook, then the
    static table (`server/src/adapters/llm/pricing.ts`).
  - OpenAI / Anthropic: static table (`estimateCost`) — `null` for unknown models.
- If **any** chunk has unknown cost → run cost is `null` (never a fake number).

## Data
- `agent_runs.cost_usd double precision NULL` (re-added in migration 0010; 0009 dropped it).
- `run_traces.trace.stats.cost_usd` — `nullish` in the contract: traces written before this feature
  have no such field.

## Behaviour by run status
| Status | tokens_in/out, cost_usd |
|---|---|
| `running` | not yet written (NULL) |
| `done` | totals from the engine |
| `failed` / `cancelled` | **partial** usage of the chunks that completed before the failure (via `onUsage`) |
| pre-work failure (diff load) | 0 tokens, cost NULL — no LLM call happened |

Known limitation: if one LLM call exhausts its schema-repair retries and throws, that call's tokens are
lost (only completed chunks are counted). A 429/quota error consumes no tokens.

## API
- `GET /pulls/:id/runs` → `RunSummary.cost_usd: number | null`
- `GET /runs/:id/trace` → `RunTrace.stats.cost_usd?: number | null`
- `GET /repos/:id/pulls` → `PrMeta.cost_usd?: number | null` (list endpoint only) =
  **sum over the latest finished run of each agent** on the PR. `running` runs are skipped (that
  agent's previous finished run counts). Null costs are ignored in the sum; all null / no runs → `null`.

## Acceptance criteria
- Every finished run exposes its cost; a run with no data exposes `null` (UI renders `—`).
- The number matches the run log and the OpenRouter dashboard for the same run.
- No extra LLM calls.

## Out of scope / follow-ups
- Cost on the PR Detail → Overview verdict card ("$0.014 · 8.2K→1.3K").
- Cost in the "Review runs" accordion header (`ReviewRecord` has no run usage yet).
