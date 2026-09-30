# Examples: vague vs. useful

Each pair shows the same underlying discovery written two ways. The vague
version restates a general truth a reader already knows; the useful version
names the concrete trigger and the fix, so a future session can act on it
without re-deriving it. Each heading also notes which package's
`INSIGHTS.md` the example would actually land in — none of these are
repo-wide, so none would go to root `INSIGHTS.md`.

## What Works — `server/INSIGHTS.md`

Vague:
> Promises can be tricky in pipelines.

Useful:
> Batch `Promise.allSettled()` in groups of 10 for the PR-file ingest loop
> — `Promise.all()` over the full file list times out past ~30 files
> (`server/src/modules/reviews/run-executor.ts`).

## What Doesn't Work — `server/INSIGHTS.md`

Vague:
> Watch out for async issues in tests.

Useful:
> A test importing `test/helpers/pg.ts` but not named `*.it.test.ts` lands
> in the unit CI lane and silently never runs against real Postgres — no
> failure, no warning. Always suffix `.it.test.ts` for DB-backed tests (see
> `server/CLAUDE.md` Gotchas).

## Codebase Patterns — `server/INSIGHTS.md`

Vague:
> We decided to keep things simple for now.

Useful:
> Cost-per-run tracking is deliberately absent from the reviews module —
> only model pricing is stored. Usage metering doesn't exist yet, and a
> half-implemented cost field would look authoritative while being wrong.
> Revisit once usage metering lands (see commit `d45ab0d`).

## Tool & Library Notes — `server/INSIGHTS.md`

Vague:
> Be careful with Zod and Fastify together.

Useful:
> `fastify-type-provider-zod` route schemas default to stripping unknown
> keys silently instead of 422ing — a client's typo'd field name (e.g.
> `serverity` for `severity`) just vanishes instead of erroring. Add
> `.strict()` to any object schema where a silently-dropped field would be
> dangerous to miss.

## Recurring Errors & Fixes — `server/INSIGHTS.md`

Vague:
> Zod schemas can be tricky with optional fields.

Useful:
> `PATCH /reviews/:id` silently accepted `{}` and no-opped instead of 400ing
> — the Zod schema had every field `.optional()` with no `.refine()`
> requiring at least one key. Fixed in
> `server/src/vendor/shared/contracts/reviews.ts`.

## Session Notes (`### YYYY-MM-DD`) — `reviewer-core/INSIGHTS.md`

Vague:
> ### 2026-09-25
> Worked on the reviewer, fixed some bugs.

Useful:
> ### 2026-09-25
> `reviewer-core`'s grounding gate rejected a finding whose quoted snippet
> had trailing whitespace the diff didn't — gate compares raw substrings,
> not trimmed. Not a bug in the gate; the prompt needs to tell the model to
> quote exactly, not paraphrase-then-clean.

## Open Questions — `server/INSIGHTS.md`

Vague:
> Not sure if this is the best approach long-term.

Useful:
> `REPO_INTEL_ENABLED` degrades silently to diff-only context when a repo
> isn't indexed yet (by design, per `server/CLAUDE.md`) — open question:
> should the review UI surface *that* a review ran diff-only, so a reviewer
> doesn't mistake missing repo-intel context for the agent having checked
> and found nothing?
