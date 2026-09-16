# server/ — INSIGHTS

Non-obvious knowledge you can't infer from the code or git history: gotchas hit
in practice, "why it's built this way", debugging dead ends.

Contract:

- Append only — never rewrite, reword, or prune existing entries.
- One dated bullet per insight, newest on top of its section:
  `- YYYY-MM-DD — one actionable sentence. (file-or-PR ref)`
- If it belongs in the README, `docs/`, or a `specs/` file instead — put it there.

## What Works

<!-- newest on top -->

- _none yet_

## What Doesn't Work

<!-- newest on top -->

- _none yet_

## Codebase Patterns

<!-- newest on top -->

- 2026-09-16 — PR-list cost is the SUM of the latest review round, keyed by `agent_runs.multi_run_id` (one `multi_agent_runs` row per "Run Review" trigger, created in `runReview`); rows with a null `multi_run_id` (pre-grouping) are their own round, and the per-PR round must be picked only AFTER all rounds are summed — rows come newest-first, so a round's rows keep arriving after its newest run was seen, and picking early yields a partial sum. (src/modules/pulls/routes.ts, src/modules/reviews/service.ts)

## Tool & Library Notes

<!-- newest on top -->

- _none yet_

## Recurring Errors & Fixes

<!-- newest on top -->

- 2026-09-16 — `pnpm db:migrate` failing with `column "cost_usd" … already exists` on the dev DB means the DB drifted onto a foreign migration history (leftover fork volume: extra journal hashes + extra columns) — drop/recreate the `devdigest` database (it only holds seed data), re-run migrate + seed; DROP DATABASE first terminates the idle `postgres.js` pool session held by the running dev API or it fails with "being accessed by other users" (the pool reconnects on next query, no API restart needed). (src/db/migrations/)

## Session Notes

<!-- newest on top -->

- _none yet_

## Open Questions

<!-- newest on top -->

- _none yet_
