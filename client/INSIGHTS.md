# Insights — client

Dated discoveries and decisions. Not loaded by default.
Promote an entry to `client/CLAUDE.md` → Gotchas only if dropping it would make Claude err.

## 2026-11-24 — `apiFetch` sets JSON content-type only when a body is sent
A body-less POST with `content-type: application/json` makes Fastify reject it ("Body cannot be empty"). Keep that conditional header in `lib/api.ts`.

## 2026-11-24 — Cost UI: one formatter, "—" for no data
`lib/format-cost.ts` (`formatCost`) + `components/run-cost-badge` (compact/detailed) are the only places cost is formatted (PR list, run timeline, verdict banner, trace Stats). `RunSummary.cost_usd` is required-nullable in the contract, so test fixtures built as `Partial<RunSummary>` must set `cost_usd: null`. The verdict banner gets cost via `FindingsTab` → `prRuns.find(run_id === review.run_id)`; `reviews.run_id` is nullable, so old reviews just show no cost line.
