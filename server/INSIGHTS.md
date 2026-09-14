# Insights — server

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

### 2026-09-14 — GitLab adapter: diff_refs and discussion_id are not GitHub's commit_id/comment_id
`server/src/adapters/gitlab/rest.ts` (`postInlineNote`, `createReviewComment`, `mapNote`) — GitLab inline (diff-anchored) discussion notes require the MR's `diff_refs` (`base_sha`/`start_sha`/`head_sha`, fetched via `getMrDetail`) at creation time, unlike GitHub's single `commit_id`; and replying to a thread goes through `POST .../discussions/:discussion_id/notes` where `discussion_id` is a hash-like string, NOT the numeric id of any individual note in that thread. The adapter maps GitLab's numeric note id into `PrReviewComment.in_reply_to_id`-shaped fields but callers that want to *reply* must pass the discussion id (surfaced as the same field) back in — don't assume a GitHub-style "comment id" round-trips for GitLab.

### 2026-09-14 — check git history before implementing a "missing" feature
When a feature looks like it's just never been built (e.g. cost tracking absent from `agent_runs`/`RunSummary`/the PR list), grep the git log for it before writing new code — this repo had "Cost" fully implemented and shipped, then reverted, twice: `93119a5e` (`feat(reviews): run cost badge`) and `d45ab0d2` (`feat(reviews): remove per-PR/run cost` — an even earlier attempt's removal), both wiped off `main` by `c6af1e4` (`revert: restore main to the starter state, homework belongs in forks`). `git show <sha> -- <path>` on those recovers a near-complete, previously-working reference diff (contracts, migration, repo/executor wiring, component APIs, i18n keys, test cases) instead of designing from scratch. `git diff <sha>^..HEAD -- <path>` confirms whether the current file still matches the pre-feature state before trusting the diff will apply cleanly.

## Mistake

## Decision

### 2026-09-14 — GitLab REQUEST_CHANGES maps to unapprove + a prefixed note
`server/src/adapters/gitlab/rest.ts` (`postReview`) — GitLab's REST API has no `REQUEST_CHANGES` review event (approvals are `approve`/`unapprove` only; confirmed against the official GitLab API docs, Sept 2026). Chosen mapping: `REQUEST_CHANGES` → call `unapprove` (swallow a 404 — it just means the user hadn't approved yet) then post a discussion note prefixed `"Changes requested: "`; `APPROVE` calls `approve` and optionally posts a plain note; `COMMENT` only posts a note. This preserves GitHub-equivalent user-facing behavior without inventing a new field on the shared `Pr` model — don't add a GitLab-specific "blocking" concept elsewhere without revisiting this call site first.

### 2026-09-14 — `agent_runs.batch_id` groups one runReview() call's runs
`server/src/db/schema/runs.ts` (`agentRuns.batchId`, uuid, no FK) + `server/src/modules/reviews/service.ts` (`runReview`, one `randomUUID()` shared across the per-agent `createAgentRun` loop). Needed because the PR-list Cost column sums the *latest review batch's* completed run costs (all agents one "Run Review" click targeted), not just the single most-recent run — the historical `93119a5e` implementation only ever surfaced the single-latest-run cost, so `batch_id` didn't exist before. Aggregation lives in `server/src/modules/pulls/latest-batch-cost.ts` (`latestBatchCostByPr`): newest-first, first-seen batch key per PR wins, only `status='done'` rows in that batch contribute, zero contributing rows → `null` not `0`.

## Context

### 2026-09-14 — the local dev Postgres volume can drift ahead of committed migrations from reverted/forked work
Discovered while adding `repos.provider` (GitLab support): the docker-compose `devdigest-postgres` volume already had a `provider` column AND a different unique index (`workspace_id, provider, full_name` vs. the committed `workspace_id, full_name`) — 19 rows in `drizzle.__drizzle_migrations` against only 11 committed migration files, plus real leftover `repos` rows (including a `gitlab` one) from GitLab work done before `c6af1e4` ("revert: restore main to the starter state"). `pnpm db:migrate` failed with `column "provider" already exists` because of this drift — it wasn't caused by the current session's schema change. Unlike the git-history case (see Pattern above), this drift is invisible to `git log`/`git diff` — it only shows up by inspecting the live DB (`docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\d <table>'` and the `__drizzle_migrations` count vs. `ls src/db/migrations/*.sql`). Fix: `docker compose down -v && docker compose up -d` then `pnpm db:migrate` from a clean volume — but confirm with the user first, since it destroys whatever is in the local dev DB (per `e2e/README.md`'s own warning against `-v`).

### 2026-09-14 — `reviewer-core`'s `ReviewOutcome.costUsd` was being computed and discarded
`reviewer-core/src/review/run.ts`'s `reviewPullRequest()` already sums per-chunk LLM cost into `ReviewOutcome.costUsd` (map-reduce aware — null if any chunk's cost is unknown). `server/src/modules/reviews/run-executor.ts`'s `runOneAgent` received this in `outcome` but did `const { tokensIn, tokensOut, grounding } = outcome;`, silently dropping `costUsd` before it ever reached `completeAgentRun`. Any future "cost" feature work should start by checking whether the number is already flowing through `ReviewOutcome`/`CompletionResult`/`StructuredResult` (it usually is, via `estimateCost`/`PriceBook` in `server/src/adapters/llm/*` and `server/src/platform/price-book.ts`) before adding new computation.

## Open Questions
