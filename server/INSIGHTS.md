# Insights — server

Dated discoveries and decisions. Not loaded by default.
Promote an entry to `server/CLAUDE.md` → Gotchas only if dropping it would make Claude err.

## 2026-11-24 — Cost UI removed, pricing kept
Commits removed per-PR/run cost from the UI, but `platform/price-book.ts` and `adapters/llm/pricing.ts` (live OpenRouter prices + static fallback) remain — M1 brings the cost badge back.

## 2026-11-24 — Run trace `tool_calls` is synthetic
`run-executor.ts` builds `tool_calls` from engine chunks as `review_file` entries with evenly split duration; it is not a real tool-call log.

## 2026-11-24 — Leftovers for later milestones
`src/prompts/onboarding.system.md` and tables like `eval_*`, `ci_*`, `pr_brief`, `pr_intent`, `digests` exist for later milestones; the starter's user flow (repo → PR → review) doesn't use them.

## 2026-11-24 — Run cost is stored, not recomputed (`agent_runs.cost_usd`)
M1 restored cost as a nullable `numeric(12,6)` column written in `completeAgentRun` from the engine's `outcome.costUsd` (OpenRouter `usage.cost`, else PriceBook). Drizzle returns `numeric` as a **string** → `Number()` in `run.repo.ts`, `String()` on write. NULL means "unpriced" (failed runs, pre-M1 runs, any call without a price) and must render "—", never `$0.00`. `GET /repos/:id/pulls` sums per PR with one `GROUP BY` (SUM skips NULLs; all-NULL → `null`).
