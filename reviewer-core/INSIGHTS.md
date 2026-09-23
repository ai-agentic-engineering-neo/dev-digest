# reviewer-core — insights

Things that are true about `reviewer-core/` but not visible in the code.
Append-only: when an entry goes stale, add a dated note under it instead of
deleting it. Cross-package findings go in the [root file](../INSIGHTS.md).

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## Decisions

## Pitfalls

## Doc drift

- **2026-09-23** — README names functions that don't exist under those names:
  `toReview()`, `run`, `reduce`. The real exports are `toReviewPayload`,
  `reviewPullRequest`, `reduceReviews`. Evidence: `README.md:33,41-42,48`,
  `src/index.ts`.

## Open questions

- **2026-09-23** — (security) `INJECTION_GUARD` claims the PR title sits inside
  `<untrusted>` blocks, but the server puts `pull.title` and `pull.author`
  verbatim into the unwrapped `task` line. Wrap them, or fix the guard's wording?
  Evidence: `src/prompt.ts:16-28`, `../server/src/modules/reviews/helpers.ts:82-84`.
