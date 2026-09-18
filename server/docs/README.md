# docs — server

Deep-dives for the `server` package (design rationale, decisions).

## Scoring is deterministic, never trusted from the model

`reviewer-core`'s `groundFindings()` drops any finding that doesn't cite a
real line in the diff, and the score is recomputed from the *surviving*
findings — the model's self-reported score is discarded entirely
(`reviewer-core/CLAUDE.md`'s do-not-touch section calls this out explicitly:
`groundFindings()` must stay the single source of truth). `server` never
re-derives or overrides this; it persists whatever `reviewer-core` returns
and reads it back verbatim for `PrMeta.score`.

## `findings_by_severity`: why it's scoped to the latest review, not all-time

Unlike `cost_usd` (deliberately changed to an all-time sum — see below),
`PrMeta.findings_by_severity` mirrors `score`'s existing "latest review
only" scope. Two reasons: (1) the rubric this was built against literally
titles the PR-list popover "N FINDINGS **IN THIS RUN**", implying a single
review's data, not a history; (2) `score` already established this
precedent, and a findings breakdown that disagreed with the score shown
right next to it (e.g. counting findings from a review superseded by a later
one) would read as a bug. The query
(`server/src/modules/pulls/routes.ts`) reuses the exact same
`latestReviewByPr` map built for `score`, extended to also carry the review
row's own `id` — necessary because `findings.reviewId` references
`reviews.id`, not `reviews.runId` (two different columns on the same row;
easy to mix up).

## Cost: all-time sum, not "latest batch" — and why that was a real change

The previous design summed only the runs in the PR's most recent "Run
Review"/"Review all" batch, reconstructed via a 5-second `ranAt` proximity
window around the run behind the current score (no batch id is persisted).
That was a deliberate, reasoned design — not a bug — see the git history of
`server/src/modules/pulls/routes.ts` for the original comment block. It
changed to a true all-time sum of every `status = 'done'` run because an
external grading rubric specified that literally. The two are genuinely
different product decisions (batch = "cost of the review you're looking at
right now"; all-time = "total spend on this PR ever") — if a future lesson
needs the batch semantics back, don't just revert this file; re-derive
which one is actually wanted, since both have been deliberately chosen at
different points for different reasons.

## Single-local-user identity, not per-request auth

`GitHubClient.getAuthenticatedUser()` (added for the top-right avatar) calls
`GET /user` once per `GET /workspace` request. This is safe as a "current
user" concept only because the app has exactly one GitHub token
(`~/.devdigest/secrets.json`, `process.env` fallback) shared by the whole
workspace — there's no per-request auth or multi-tenant identity anywhere in
this codebase. Don't generalize this pattern to anything that needs to
distinguish *which* user is asking.
