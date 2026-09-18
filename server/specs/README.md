# specs — server

Specs / acceptance criteria for the `server` package.

## `GET /repos/:id/pulls` — `findings_by_severity`

- Computed from `findings` joined to `reviews` on `reviews.id =
  findings.reviewId`, filtered to `isNull(findings.dismissedAt)`, restricted
  to each PR's latest `kind = 'review'` row (same scope as `score`).
- Response field is `.nullish()`:
  - **Absent** — the PR has no `kind = 'review'` review yet.
  - **Present, all-zero** (`{CRITICAL: 0, WARNING: 0, SUGGESTION: 0}`) — a
    review exists but every finding was dismissed, or it found nothing.
  - **Present, real counts** — otherwise.
- A `kind = 'summary'` review must never shadow a `kind = 'review'` one, even
  if it's newer — findings/score always come from the review-kind row.
- No new LLM call at read time, ever — pure `COUNT`/`filter` over persisted
  rows.
- Covered by `test/pulls-findings.it.test.ts`.

## `GET /repos/:id/pulls` — `cost_usd`

- Sum of `agent_runs.cost_usd` where `status = 'done'`, across **every**
  run ever recorded for the PR (no batch/date window).
- Runs with `cost_usd IS NULL` are skipped, never summed as `$0`.
- `cost_usd` is `undefined` (key omitted from the JSON) when the PR has zero
  `agent_runs` rows at all; `null` when it has rows but none successful/have
  known cost; a number otherwise.
- Covered by `test/reviews.it.test.ts` (multi-batch sum, all-failed → null,
  mixed success/failure → only the successful run's cost counts).

## `GET /workspace` — `github_user`

- `{ login, avatar_url } | null` — `null` whenever `container.github()` or
  the subsequent `getAuthenticatedUser()` call fails for any reason (no
  token configured, revoked token, network error), never a thrown 500.
- Covered by `test/workspace.it.test.ts`.

## `POST /findings/:id/(accept|dismiss)`

Pre-existing, unchanged by this work — documented here because it's a
dependency of the client's Accept/Dismiss visual spec
(`client/specs/README.md`). Setting one action clears the other's timestamp;
covered by `test/reviews.it.test.ts`'s "finding actions: accept, dismiss".
