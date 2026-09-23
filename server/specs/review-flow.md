# Review flow — contract

**Status:** contract — describes shipped behaviour that must stay true. Change the code and this file in the same commit.

Scope: one review cycle, from `POST /pulls/:id/review` through the background run, its
SSE stream, cancel and delete, to what every read route returns (the PR list included).
The route map and rate-limit tiers are in [`../README.md`](../README.md), and the wiring is in
[`../docs/architecture.md`](../docs/architecture.md). Cost and severity fields are specified in
[`./01-run-cost-badge.md`](./01-run-cost-badge.md) and
[`./02-findings-by-severity.md`](./02-findings-by-severity.md); their Amendments are current. What
happens inside the engine (grounding, score, verdict, blockers, cost) is in
[`../../reviewer-core/specs/grounding-and-scoring.md`](../../reviewer-core/specs/grounding-and-scoring.md).
Paths are relative to `server/`.

## Rules

### R1 — Start request
`POST /pulls/:id/review` takes a uuid `:id` and the body `{ agentId?: string, all?: boolean }`, which the handler parses itself with `RunRequest.parse`. A wrong type is a 422 `validation_error`. The route allows 10 requests/min, but the limiter is not registered under `NODE_ENV=test`. Code: `src/modules/reviews/routes.ts:27-44`, `src/vendor/shared/contracts/platform.ts:271-274`, `src/app.ts:135-152`. Test: `test/reviews.it.test.ts:172-177` (200). The 422 and 429 are **untested**.

### R2 — Target agents
`all: true` picks every `enabled` agent in the workspace. Otherwise `agentId` picks that agent, or it is a 404 `not_found`. With neither, it is a 400 `invalid_run_request`. The agents are resolved before the PR is read, and `agentId` is not checked to be a uuid. Code: `src/modules/reviews/service.ts:46-57`, `src/modules/agents/repository.ts:58-71`. Test: `test/reviews.it.test.ts:495-503` (`all`), `:172-179` (`agentId`). The 404 and 400 are **untested**.

### R3 — Workspace scope
The PR must be in the caller's workspace and its repo must exist. Otherwise it is a 404, and nothing is written. Code: `src/modules/reviews/service.ts:109-112`, `src/modules/reviews/repository/pull.repo.ts:9-19`. Test: **untested**.

### R4 — One `running` row per agent, before the response
For each target, in order, the server inserts an `agent_runs` row: `status='running'`, `source='local'`, and the agent's provider and model. Its id is the `run_id`. `status` is untyped text: `running | done | failed | cancelled`. Code: `src/modules/reviews/service.ts:117-129`, `src/modules/reviews/repository/run.repo.ts:117-140`, `src/db/schema/runs.ts:24`. Test: `test/reviews.it.test.ts:179` (one run per agent). The `running` status at response time is **untested**.

### R5 — Response
`200 { pr_id, runs: [{ run_id, agent_id, agent_name }], reviews: [] }`. `reviews` is always empty; results are read later (R15–R18). The contract comment saying reviews are "returned once the (synchronous) run completes" is stale. Code: `src/modules/reviews/routes.ts:43`, `src/modules/reviews/service.ts:137`, `src/vendor/shared/contracts/review-api.ts:44-61`. Test: `test/reviews.it.test.ts:177-179`. `reviews: []` is **untested**.

### R6 — Fire-and-forget
Runs execute in the background (`void executor.executeRuns(…)`). The request never waits for them, and if the whole batch crashes, the error is only logged. The JobRunner is not used. Code: `src/modules/reviews/service.ts:131-135`. Test: every DB test polls with `waitForPrRuns` (`test/helpers/runs.ts:12-34`).

### R7 — One diff per request
All agents share one diff, loaded once: `git diff base...head` through `container.git`. If that throws or is empty, the diff is rebuilt from the stored `pr_files` patches. If loading still throws, every run of the request fails with `Failed to load PR diff: …`. Code: `src/modules/reviews/diff-loader.ts:12-44`, `src/modules/reviews/run-executor.ts:72-104`. Test: the git path via `MockGitClient` (`test/reviews.it.test.ts:119`). The fallback and the fail-all are **untested**.

### R8 — Agents run in sequence, isolated
Runs execute one after another, in target order. A failed or cancelled run saves its own result, and the loop moves on to the next. Code: `src/modules/reviews/run-executor.ts:107-134`. Test: **untested**.

### R9 — Per-agent execution
Each run:
1. resolves `container.llm(agent.provider)`. A missing key fails the run, not the request.
2. adds repo-intel context only when `agent.repoIntel !== false`. If an enrichment fails, its section is left out.
3. calls reviewer-core `reviewPullRequest` with the agent's prompt, its model, and `strategy ?? 'single-pass'`.

Code: `src/modules/reviews/run-executor.ts:156-212`, `src/modules/reviews/constants.ts:12`. Test: `test/reviews.it.test.ts:418-436` (anthropic). A missing key is **untested**.

### R10 — A `done` run
The executor writes, in this order:
1. a `reviews` row: `kind='review'`, `run_id`, the engine's verdict and summary, the score the engine recomputes, and the agent's model;
2. the grounded findings only;
3. `pull_requests.last_reviewed_sha = head_sha`;
4. `agent_runs` → `done`, with duration, tokens, `cost_usd` (the engine's `costUsd`, NULL if any call was unpriced), `findings_count`, `grounding` (`"k/n passed"`), `score`, `blockers = countBlockers(kept, agent.ciFailOn)` and `error = NULL`;
5. one `run_traces` document (an upsert);
6. then the bus completes.

Code: `src/modules/reviews/run-executor.ts:213-289`, `src/modules/reviews/repository/run.repo.ts:142-185`, `../reviewer-core/src/review/run.ts:184`, `:204-208`. Test: `test/reviews.it.test.ts:183-210` (score 65 instead of the model's 42, 1 of 2 findings kept, `1/2 passed`, a trace), `:246-274` (cost), `:323-339` (an unpriced model stores NULL). `last_reviewed_sha` and `blockers` are **untested**.

### R11 — `done` is written before the trace (known race)
`status='done'` is written before `saveRunTrace`. A client that polls the row can therefore ask for the trace too early and get a 404. Code: `src/modules/reviews/run-executor.ts:243`, `:288`. Test: `test/reviews.it.test.ts:201` and `:256` read the trace right after `waitForPrRuns`, so they can flake. See [`../INSIGHTS.md`](../INSIGHTS.md), Open questions.

### R12 — A `failed` or `cancelled` run
The row gets `failed` with the error message, or `cancelled` with `Cancelled by user`. It keeps the duration so far, with tokens 0, `findings_count` 0 and `grounding '0/0 passed'`. `cost_usd`, `score` and `blockers` are NULL; the comment at `src/modules/reviews/repository/run.repo.ts:156` says "0" for blockers, which is wrong. The trace is built from the event buffer, and no `reviews` row is written. Errors while writing all of this are swallowed. Code: `src/modules/reviews/run-executor.ts:292-315`, `:410-434`, `src/modules/reviews/repository/run.repo.ts:169-174`. Test: `test/reviews.it.test.ts:341-352`, `:291-300` (failed, cost NULL). The error text, the trace and `cancelled` are **untested**.

### R13 — Live events (SSE)
`GET /runs/:id/events` sends frames with `id = seq`, `event = kind` and `data` = the `RunEvent` JSON. It replays the buffered events first, then streams live ones, and it ends when the run completes. It has no rate limit and no workspace check. The buffers live in process memory and are never evicted. After a restart, an old run replays nothing and its stream never ends, so clients must read `GET /runs/:id/trace` instead. Code: `src/modules/reviews/routes.ts:48-92`, `src/platform/sse.ts:62-100`, `src/vendor/shared/contracts/trace.ts:21-28`. Test: `test/reviews.it.test.ts:469-493`. The restart case is **untested**.

### R14 — Cancel
`POST /runs/:id/cancel`:
- publishes an info event and sets the bus flag;
- sets `status='cancelled'`, but only on a row still `running`;
- completes the bus, which ends open streams;
- returns `{ ok: true }` for any uuid.

That is enough to end an orphaned run. The engine checks the flag only before each LLM call.

Known gap: `complete()` clears the flag during the same request, and the final `completeAgentRun` has no status guard. A live run therefore keeps going and overwrites `cancelled` with `done` or `failed`, and a `done` run also saves its review.

Code: `src/modules/reviews/service.ts:85-90`, `src/modules/reviews/repository/run.repo.ts:94-101`, `:162-176`, `src/platform/sse.ts:76-83`, `src/modules/reviews/run-executor.ts:209-211`, `../reviewer-core/src/review/run.ts:163-164`. Test: **untested**.

### R15 — Run reads
`GET /pulls/:id/runs` returns every `agent_runs` row of the PR in the workspace, of any status, newest `ran_at` first, with the agent name, `cost_usd`, `score` and `blockers`. `GET /pulls/:id/runs/active` returns only the `running` rows, in no set order. For an unknown PR, both return `[]`, not a 404. Code: `src/modules/reviews/repository/run.repo.ts:10-69`, `src/modules/reviews/routes.ts:95-104`. Test: `test/reviews.it.test.ts:259-260`, `:309-313`, `:348-349`. `/active` is **untested**.

### R16 — Review reads
`GET /pulls/:id/reviews` is a 404 unless the PR is in the workspace. Otherwise it returns every review of the PR, of both kinds, newest `created_at` first. Each review comes with all its findings, dismissed ones included, and with its run's `cost_usd`, `tokens_in` and `tokens_out` from a LEFT JOIN; these are null when the review has no run. Code: `src/modules/reviews/service.ts:160-174`, `src/modules/reviews/repository/review.repo.ts:65-89`. Test: `test/reviews.it.test.ts:184-197`, `:262-265`.

### R17 — Trace read
`GET /runs/:id/trace` returns the stored document, or a 404 `not_found` when there is none. It has no workspace check. Code: `src/modules/reviews/routes.ts:121-126`, `src/modules/reviews/repository/run.repo.ts:187-190`. Test: `test/reviews.it.test.ts:201-204`, `:256-257`. The 404 is **untested**.

### R18 — PR list
In `GET /repos/:id/pulls`:
- `score` and `findings_by_severity` come from the PR's latest `kind='review'` review. Summaries are ignored and dismissed findings count. A review with no findings gives all zeros, and a PR never reviewed gives `null`.
- `cost_usd` is the sum of `agent_runs.cost_usd` over the PR's `status='done'` runs. NULL costs are skipped, and the value is `null` when no done run has a known cost. It does not depend on reviews, so a run whose review was deleted still counts.

Code: `src/modules/pulls/routes.ts:114-190`, `src/vendor/shared/contracts/platform.ts:171-184`. Test: `test/reviews.it.test.ts:246-274`, `:276-321`, `:323-339`, `:355-416`.

### R19 — Finding actions
`POST /findings/:id/accept` sets `accepted_at` and clears `dismissed_at`, and `/dismiss` does the reverse. Both return `{ finding }`. A finding outside the workspace is a 404. The UI labels dismiss "Reject", but that is only copy (`../client/messages/en/prReview.json:7`). Code: `src/modules/reviews/findings.ts:11-34`, `src/modules/reviews/repository/review.repo.ts:134-158`. Test: `test/reviews.it.test.ts:438-467` (accept, then a dismiss that clears `accepted_at`). The reverse and the 404 are **untested**.

### R20 — Delete a run
`DELETE /runs/:id` first deletes the workspace's reviews with that `run_id` (their findings cascade), then the `agent_runs` row (its trace cascades). These are two statements with no transaction. When nothing matches, it returns `{ ok: false }` with a 200. Code: `src/modules/reviews/repository/run.repo.ts:78-91`, `src/modules/reviews/routes.ts:107-111`, `src/db/schema/runs.ts:38-40`. Test: **untested**.

### R21 — Delete a review
`DELETE /reviews/:id` deletes the review and its findings, but keeps the `agent_runs` row and its trace, because `reviews.run_id` has no FK. The run therefore still shows in the Timeline and still counts in the PR list's `cost_usd`. It is a 404 when the review is not in the workspace. Code: `src/modules/reviews/repository/review.repo.ts:98-108`, `src/modules/reviews/routes.ts:135-140`, `src/db/schema/reviews.ts:19`, `:30-32`. Test: **untested**.

### R22 — Boot reaper
Every `buildApp`, before it serves anything, sets `status='failed'` on every `running` row in the DB, across all workspaces, with no error text. If that fails, boot only logs a warning. This assumes one API instance per DB. Code: `src/app.ts:70-85`, `src/modules/reviews/repository/run.repo.ts:103-112`. Test: **untested**.

## Not covered by tests

- The 422 on the body or `:id`, the 400 `invalid_run_request`, the 404 for an unknown agent or PR, and the
  10/min cap (the limiter is off under `NODE_ENV=test`, `src/app.ts:95-97`).
- The `pr_files` fallback and the fail-all on a diff error (R7), per-agent isolation (R8), and a missing provider key (R9).
- `last_reviewed_sha` and `blockers` (R10); the error text and trace of a failed run; every `cancelled` path (R12, R14).
- SSE for a run from before a restart (R13), `/pulls/:id/runs/active`, and the trace 404.
- `dismiss` → `accept` clearing `dismissed_at`, and the cross-workspace finding 404 (R19).
- Both deletes (R20, R21) and the reaper (R22).
- The "run all" test (`test/reviews.it.test.ts:495-504`) asserts only `runs.length ≥ 2` and does not wait for the
  runs. It also starts the seeded OpenRouter agents with no mock (see `../docs/architecture.md`).
- `waitForPrRuns` returns silently on timeout (`test/helpers/runs.ts:31`), so a stuck run fails a later assertion
  instead of reporting a timeout.

## When you change this

- Change the rule and the code in one commit; cite the new lines and the test that checks them.
- A response field is a contract change: edit `src/vendor/shared/contracts/` first, then the hand copy in
  `../client/src/vendor/shared/`.
- Fixing R11 (save the trace before `done`) or R14 (guard the final write with `status='running'`, and keep the
  flag until the run stops) changes the rule text. Add a note under the matching Open question in
  `../INSIGHTS.md` through the `engineering-insights` skill.
- Score, grounding, verdict and cost come from reviewer-core. Change its contract first.
- A new DB-backed test goes in a `*.it.test.ts` file and awaits `waitForPrRuns` before it asserts.
