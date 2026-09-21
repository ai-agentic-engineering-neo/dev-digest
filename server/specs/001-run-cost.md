# 001 — Run cost (Lesson L01)
Status: done

## Goal
Persist the USD cost of every agent run and expose it on the read routes, so the
client can show it on the PR list, the PR timeline and the run trace drawer.
Zero extra model calls — cost already comes back from the LLM layer
(`reviewer-core` `ReviewOutcome.costUsd`: OpenRouter `usage.cost` → PriceBook →
static `pricing.ts` → null).

## Contract (shared schemas · routes · UI)
- DB: `agent_runs.cost_usd double precision NULL` (migration `0010`).
- `@devdigest/shared` (server + client copies):
  - `RunStats.cost_usd: number | null | undefined` (optional → legacy traces parse).
  - `RunSummary.cost_usd: number | null`.
  - `PrMeta.cost_usd: number | null | undefined` (list endpoint only).
- `run-executor`: done run → `costUsd` saved on the row and in `trace.stats.cost_usd`;
  failed / cancelled / pre-work failure → `null`.
- `GET /repos/:id/pulls` → `cost_usd` = SUM over the PR's `done` runs with a known
  cost; `null` when none (`modules/pulls/cost.ts`).
- `GET /pulls/:id/runs` → `cost_usd` per run. `GET /runs/:id/trace` → `stats.cost_usd`.
- Seed: PR #482 gets one done General Reviewer run (8200→1300 tok, $0.014) linked
  to the seeded review.

## Out of scope
Cost in ReviewRunAccordion / VerdictBanner, observability aggregates, non-USD.

## Acceptance criteria
- [x] Completed run persists `cost_usd`; failed run stores `null` (not 0).
- [x] PR list returns the sum of completed runs; all-unknown → `null`.
- [x] Unit: `test/pulls-cost.test.ts`. Integration: `test/reviews.it.test.ts`.
- [x] e2e flow: `e2e/specs/02-repo-pulls-detail.flow.json`, `e2e/specs/04-pr-findings.flow.json`

## Links
- Client: `client/specs/001-run-cost-badge.md`
