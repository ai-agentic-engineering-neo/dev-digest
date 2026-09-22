# INSIGHTS — server
Lessons learned while working in this package (by humans or agents).
Maintained via the engineering-insights skill (.claude/skills/engineering-insights) — read it
before work, add only verified non-obvious lessons after. Newest first within a section.
Keep each entry ≤5 lines. Agents only append; changing, moving to CLAUDE.md or deleting existing entries needs the user's OK.

<!-- Entry format:
### YYYY-MM-DD — short title
- What: specific fact / symptom / error text
- Why: cause or rationale
- Rule: what to do next time
- Evidence: path/file.ts:42 · command · commit
- Also in: <other-pkg>/INSIGHTS.md   (cross-package only)
-->

## What Works
<!-- Approaches that proved themselves, ideally after an alternative failed -->

## What Doesn't Work
<!-- Failed approaches / anti-patterns, with the reason -->

## Codebase Patterns
<!-- Non-obvious conventions or decisions with rationale, not already in CLAUDE.md -->

### 2026-09-22 — PR-level finding aggregates must NOT filter `reviews.kind`
- What: `reviewsForPull` returns every review row, 'summary' included, so a rollup adding `eq(t.reviews.kind, 'review')` under-counts vs what the PR page shows.
- Why: the adjacent latest-SCORE query *does* filter kind (only 'review' rows carry a score), so copying it into a findings query is the natural, wrong move.
- Rule: NEVER filter `kind` when aggregating findings per PR; filter it only when reading a score.
- Evidence: src/modules/reviews/repository/review.repo.ts:58 · test/pulls-findings.it.test.ts "counts a 'summary' review's findings too"

## Tool & Library Notes
<!-- Quirks of dependencies and tools -->

### 2026-09-21 — Drizzle aggregates keep SQL NULL as `null`, even with `.mapWith(Number)`
- What: `sum(col).mapWith(Number)` returns `null` (not `0`) for a group whose values are all NULL.
- Why: drizzle's row mapper short-circuits on null before calling the decoder (node_modules/drizzle-orm/utils.js:28).
- Rule: ALWAYS rely on that for "no data" vs "genuinely zero" aggregates instead of adding COALESCE.
- Evidence: src/modules/pulls/routes.ts:139 · test/run-cost.it.test.ts "PR list COST is null (not 0)"

## Recurring Errors & Fixes
<!-- Exact error text → cause → fix -->

### 2026-09-21 — `(HTTP code 409) … container is running` when the whole *.it.test suite runs
- What: one suite fails at teardown with "cannot remove container ... container is running", while all its tests pass.
- Why: testcontainers races on removing parallel Postgres containers; it is a teardown flake, not a test failure.
- Rule: Re-run that one file (`pnpm exec vitest run test/<file>.it.test.ts`) before investigating; treat a green single-file run as proof.
- Evidence: test/settings-models.it.test.ts · `pnpm exec vitest run .it.test` (33/33 tests passed, 1 suite errored)

## Open Questions
<!-- Unresolved; What + Evidence only; delete once answered -->
