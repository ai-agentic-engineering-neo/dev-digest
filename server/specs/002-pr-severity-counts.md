# 002 — PR severity counts on the list (Lesson L01, ТЗ #16–21)
Status: done (e2e flow steps pending a fresh-seed run)

## Goal
Expose per-severity finding counts of each PR's latest review on the PR list endpoint so the
client can render the FINDINGS column. Pure SQL group-by over persisted findings — no LLM call.

## Contract (shared schemas · routes · UI)
- `@devdigest/shared` (server + client copies):
  - `contracts/findings.ts`: `SeverityCounts = z.object({ CRITICAL: int, WARNING: int, SUGGESTION: int })`.
  - `contracts/platform.ts`: `PrMeta.severity_counts: SeverityCounts.nullish()` (list endpoint only) —
    SUM over the latest review of EACH agent (one Run Review writes one review row per agent).
- `GET /repos/:id/pulls`:
  - the existing latest-review query also selects `reviews.id`;
  - one IN-query `SELECT review_id, severity FROM findings WHERE review_id IN (…latest review ids)` + JS grouping
    (same pattern as the score/cost rollups — the list is small);
  - `severity_counts` = sum of counts over the newest `kind='review'` record per `agent_id`
    (`latestReviewIdsPerAgent` + `sumSeverityCounts`; dismissed findings included — the detail page
    renders them too); `null` when the PR was never reviewed. `score` still comes from the newest review.
  - pure grouping helper `modules/pulls/severity.ts` (`countSeverities`), next to `cost.ts`.
  - replace the "FINDINGS breakdown is intentionally not surfaced" comment in `routes.ts`.
- `GET /pulls/:id/runs`, `GET /pulls/:id/reviews`: unchanged (client derives timeline counts from reviews).
- No DB migration.

## Out of scope
Denormalized counts on `agent_runs`, per-run counts in `RunSummary`, finding previews on the list payload.

## Acceptance criteria
- [x] Seeded PR #482 → `severity_counts = { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }`; unreviewed PR → `null`.
- [x] Only each agent's latest review counts; an agent with 0 findings no longer hides other agents' findings
      (regression: #1551 showed "—" because the newest review was a 0-finding Performance run).
- [x] Unit: `test/pulls-severity.test.ts`. Integration: list endpoint assertion in `test/reviews.it.test.ts`.
- [ ] e2e flow: `e2e/specs/02-repo-pulls-detail.flow.json`

## Links
- Client: `client/specs/002-findings-severity.md`
