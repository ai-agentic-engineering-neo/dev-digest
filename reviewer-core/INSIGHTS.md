# reviewer-core — insights

Things that are true about `reviewer-core/` but not visible in the code.
Append-only: when an entry goes stale, add a dated note under it instead of
deleting it. Cross-package findings go in the [root file](../INSIGHTS.md).
Agents write here only through the `engineering-insights` skill, whose script
inserts lines and never changes existing ones.

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## What works

## What doesn't work

- **2026-09-23** — No test exercises map-reduce: the server test whose name says "map-reduce" reviews a one-file diff with the default strategy, and a one-file diff always falls back to single-pass → a map-reduce change needs a new multi-file test (mode selection, `sliceDiff`, `reduceReviews`). Evidence: `../server/test/reviews.it.test.ts:160`, `src/review/run.ts:117`.
- **2026-09-23** — `sliceDiff` picks a file's blocks by substring (`b/<path>` or ` <path>` anywhere in the `diff --git` line), so the map-reduce slice for `x.ts` also carries `lib/x.ts` (confirmed by running it) → match the exact `b/<path>` header when touching it. Evidence: `src/review/reduce.ts:63-64`.

## Codebase patterns

## Tool & library notes

## Recurring errors & fixes

## Doc drift

- **2026-09-23** — README names functions that don't exist under those names:
  `toReview()`, `run`, `reduce`. The real exports are `toReviewPayload`,
  `reviewPullRequest`, `reduceReviews`. Evidence: `README.md:33,41-42,48`,
  `src/index.ts`.

## Session notes

- **2026-09-23** — HW1 fixes, block F (docs/pipeline.md, specs/grounding-and-scoring.md): +3 (What doesn't work ×2, Open questions nuance)

## Open questions

- **2026-09-23** — (security) `INJECTION_GUARD` claims the PR title sits inside
  `<untrusted>` blocks, but the server puts `pull.title` and `pull.author`
  verbatim into the unwrapped `task` line. Wrap them, or fix the guard's wording?
  Evidence: `src/prompt.ts:16-28`, `../server/src/modules/reviews/helpers.ts:82-84`.
  - **2026-09-23** — The server evidence has moved: the task line is `taskLine()` with title and author at `../server/src/modules/reviews/helpers.ts:89-91` (was cited as `:82-84`). Evidence: `../server/src/modules/reviews/helpers.ts:89-91`.
