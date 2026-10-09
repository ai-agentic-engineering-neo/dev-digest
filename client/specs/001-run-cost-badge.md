# 001 — Run cost badge (Lesson L01)
Status: done

## Goal
Show what each review run cost, in three places, without any new request.

## Contract (shared schemas · routes · UI)
- Data: `PrMeta.cost_usd` (`GET /repos/:id/pulls`), `RunSummary.cost_usd`
  (`GET /pulls/:id/runs`), `RunTrace.stats.cost_usd` (`GET /runs/:id/trace`).
  Server side: `server/specs/001-run-cost.md`.
- `src/lib/format-cost.ts`: `formatCost` (<$0.01 → 4 dp, <$1 → 3 dp, else 2 dp;
  null → "—"), `formatTokenCount` ("9,119").
- `src/components/run-cost-badge/RunCostBadge`:
  - `compact` → `$0.014`
  - `detailed` → `9,119 tok · $0.0013` (tokens only if cost unknown; "—" if nothing).
- Screens:
  1. PR list — COST column before UPDATED (`PRRow`, compact).
  2. PR detail → Agent runs → Timeline — under the run time, done runs only (`RunHistory`, detailed).
  3. Run trace drawer → Stats — COST tile between TOKENS and FINDINGS (`TraceBody`).
- i18n: `common.runCost.*`, `prReview.list.columns.cost`, `runs.trace.stat.cost`.

## Out of scope
FINDINGS column / Run Review button on the PR list row; cost in ReviewRunAccordion / VerdictBanner.

## Acceptance criteria
- [x] Unknown cost renders "—", never "$0.00"; failed runs show no badge.
- [x] Tests: `RunCostBadge.test.tsx`, `PRRow.test.tsx`, `RunHistory.test.tsx`, `RunTraceDrawer.test.tsx`.
- [x] e2e flow: `e2e/specs/02-repo-pulls-detail.flow.json` (`$0.014` on the list),
      `e2e/specs/04-pr-findings.flow.json` (`9,500 tok · $0.014` in the timeline)

## Links
- `server/specs/001-run-cost.md`
