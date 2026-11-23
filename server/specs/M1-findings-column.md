# M1 — Findings column on the PR list (server)

Status: built

## Problem

The PR list shows a score and a cost per PR, but not what the reviews found. A
reviewer has to open each PR to learn whether it has a critical finding. The
list endpoint returns nothing about findings.

## Goals

- `GET /repos/:id/pulls` returns, per PR, how many findings of each severity
  the PR currently has.
- A PR reviewed by several agents counts every agent once: the number is the
  sum over each agent's latest review.
- No extra model calls and no schema change.

## Non-goals

- Returning the findings themselves on the list. The client loads them from
  `GET /pulls/:id/reviews` when the reviewer asks for the preview.
- Filtering by confidence, or excluding accepted or dismissed findings.
- An index on `reviews.pr_id` or `findings.review_id`. The list is small.

## Behaviour

1. The route reads the PR's reviews with `kind = 'review'`, newest first (the
   query that already feeds the score).
2. For each PR, the first review seen per agent is that agent's latest one. A
   review without an agent (`agent_id` null) is grouped under one "no agent"
   key. Older reviews by the same agent are superseded and add nothing.
3. A failed or cancelled run writes no review, so an agent's latest
   **successful** review stays counted when a later run fails.
4. One `IN` query reads `review_id` and `severity` of the findings of the
   counted reviews. They are tallied per PR into `CRITICAL`, `WARNING` and
   `SUGGESTION`. Any other severity value is ignored.
5. Every stored finding of a counted review is counted, including accepted,
   dismissed and low-confidence ones. This matches the `N findings` number in
   a review run's header on the PR page.
6. `findings_counts` is `null` for a PR with no review, and an object of three
   numbers (possibly all zero) once at least one review exists.

## Changes

- Module `pulls`:
  - `status.ts` — `pickLatestReviewPerAgent` (pure), next to `rollupSeverities`,
    which does the tally.
  - `routes.ts` — the review query also selects `id` and `agentId`; one more
    `IN` query on `findings`; `findings_counts` in the response.
  - As with the cost badge, this is a deliberate exception to "a milestone is a
    new module": the list route lives in `pulls`.
- Contracts (both copies of `@devdigest/shared`): `PrFindingsCounts`, and
  `PrMeta.findings_counts` (nullish).
- Seed: PR #482 gets a second completed run, by Performance Reviewer, with its
  own review (1 WARNING, 2 SUGGESTION, one of them below 0.65 confidence). It
  is older than the Security Reviewer review, so the score and the run that is
  open by default do not change. This step is idempotent.
- Tables and migrations: none.

## Acceptance criteria

- [x] A PR with one review returns the per-severity counts of that review.
- [x] A PR reviewed by two agents returns the sum of both agents' latest reviews.
- [x] An older review by the same agent is not counted.
- [x] A PR with no review returns `findings_counts: null`.
- [x] On a fresh seeded DB, PR #482 returns `{ CRITICAL: 1, WARNING: 2, SUGGESTION: 2 }`.

## Tests

- `test/pulls-status.test.ts`: `pickLatestReviewPerAgent` — two agents, a
  superseded review, a review without an agent, two PRs.
- `test/reviews.it.test.ts`:
  - "M1 findings column: the PR list sums…": two agents' latest reviews are
    summed, the superseded one is skipped, and a PR with no review returns `null`.
  - "M1 findings column: the seeded PR #482…": the seeded counts, score and
    total cost, after the seed has run twice.

## Related specs

- [client/specs/M1-findings-column.md](../../client/specs/M1-findings-column.md)

## Open questions

- None.
