# 02 — Findings per severity on the PR list (server)

UI half: [`client/specs/02-findings-by-severity.md`](../../client/specs/02-findings-by-severity.md).

## Goal

The PR list's **FINDINGS** column shows `⊘ 2 △ 2 💡 2` for each PR. Hovering it
opens a read-only popover "N FINDINGS IN THIS RUN" with that run's findings.

## Contract (`PrMeta`, list endpoint `GET /repos/:id/pulls` only)

| Field | Meaning |
|---|---|
| `latest_review_id` | The PR's newest review with `kind='review'`, the same review `score` comes from. `null` if the PR has no review. |
| `findings_counts` | `{ CRITICAL, WARNING, SUGGESTION }` = `COUNT(*)` of that review's findings, grouped by `severity`. Every finding is counted (accepted and dismissed too), so the numbers match what `GET /pulls/:id/reviews` returns for that review. `null` if there is no review. |

Both fields are nullish in the contract. The two vendored copies
(`server/src/vendor/shared`, `client/src/vendor/shared`) are identical for `PrMeta`.

## Rules

- There is no LLM call and no new table. The value is computed on read with one grouped
  `COUNT` over `findings WHERE review_id IN (latest review ids)`.
- The popover's findings come from the existing `GET /pulls/:id/reviews`.
  The client picks the review whose `id === latest_review_id`, so the list and
  the popover always describe the same run.

## Acceptance criteria

1. A PR with an older review (1 CRITICAL) and a newer one (2 CRITICAL, 1 SUGGESTION)
   → `findings_counts = {CRITICAL: 2, WARNING: 0, SUGGESTION: 1}`, and `latest_review_id` = the newer review.
2. A PR without reviews → both fields `null`.

Covered by `test/reviews.it.test.ts` › "PR list: findings_counts + latest_review_id …".
