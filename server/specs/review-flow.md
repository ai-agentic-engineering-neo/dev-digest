# Review flow: behavioural contract

What a review run guarantees, from the trigger to the read routes, and which
code enforces each guarantee. Paths are relative to `server/src/` unless they
start with `reviewer-core/`. This is not a feature spec; it is the set of
invariants any change to `modules/reviews/` must keep true. The plumbing
(container, bus, jobs) is described in [`../docs/architecture.md`](../docs/architecture.md).

Status: describes the code as of 2026-09-25 (after the L01 run cost work).

## Lifecycle at a glance

```
POST /pulls/:id/review ──► agent_runs rows (status=running) ──► HTTP 200 {runs}
                                   │
                                   ▼ (background, not awaited)
        ReviewRunExecutor.executeRuns: load diff once ──► per agent:
          resolve llm ─► repo-intel enrichment ─► reviewPullRequest ─►
          reviews + findings ─► markReviewed ─► completeAgentRun ─►
          ONE run_traces doc ─► runBus.complete
                                   │
        GET /runs/:id/events (SSE) ◄┘ live + replay
        GET /pulls/:id/runs · /pulls/:id/runs/active · /runs/:id/trace · /pulls/:id/reviews
```

## Invariants

### Trigger

1. `POST /pulls/:id/review` validates `:id` as a uuid (`IdParams`, 422 on
   mismatch) and parses the body with `RunRequest.parse(req.body ?? {})`
   (`vendor/shared/contracts/platform.ts`: `agentId?: string`, `all?: boolean`).
   An empty body is accepted by the parser but rejected in step 2.
   Enforced by `modules/reviews/routes.ts`.
2. Target resolution is exactly: `all: true` → every enabled agent in the
   workspace (`AgentsRepository.listEnabled`); else `agentId` → that agent or
   404 `not_found`; neither → 400 `invalid_run_request`.
   Enforced by `ReviewService.resolveTargets` (`modules/reviews/service.ts`).
3. The route carries its own rate limit of 10 requests per minute, on top of
   the global one. Enforced by the `config.rateLimit` on the route.
4. The PR must belong to the caller's workspace and its repo must exist, else
   404 `not_found`. Enforced by `ReviewService.runReview` via
   `ReviewRepository.getPull(workspaceId, prId)` and `getRepo`.

### Run rows and the response

5. One `agent_runs` row is inserted per target before any model work, with
   `status = 'running'`, `source = 'local'`, and the agent's `provider` and
   `model` copied onto the row. Its id is the `runId` used everywhere after.
   Enforced by `run.repo.ts` `createAgentRun`.
6. The HTTP response is `{ pr_id, runs: [{ run_id, agent_id, agent_name }], reviews: [] }`
   and is returned before any LLM call; `reviews` is always empty here.
   Enforced by `ReviewService.runReview`.
7. Execution is fire-and-forget: `runReview` calls
   `this.executor.executeRuns(...)` with `void` and a `.catch` that only logs.
   Runs do not pass through `JobRunner`; no `jobs` row is written, and no
   timeout or retry applies at the run level (LLM-call retries live inside
   `reviewPullRequest` via `maxRetries`).
   Enforced by `ReviewService.runReview`; `modules/reviews/run-executor.ts`.

### Shared pre-work

8. The diff is loaded once per request, not once per agent. `loadDiff`
   (`modules/reviews/diff-loader.ts`) tries `container.git.diff(base, headSha)`
   and falls back to `diffFromPrFiles` (a synthetic unified diff from
   `pr_files.patch`) when git fails or returns no files.
   Enforced by `ReviewRunExecutor.executeRuns`.
9. If the diff cannot be loaded, every queued run fails together: each row gets
   `status = 'failed'`, `error = 'Failed to load PR diff: …'`, `duration_ms 0`,
   tokens 0, `cost_usd null`, `grounding '0/0 passed'`, a trace built from the
   log buffer, and its bus is completed. Enforced by the `failAll` closure in
   `executeRuns`.
10. Pre-work log lines are fanned out to every run's stream and buffer, so each
    run's persisted trace includes the diff-load lines even though they ran
    once. Enforced by constructing `RunLogger` with all `runIds` and narrowing
    with `forRun` per agent.
11. Agents in one request execute sequentially, in target order.
    Enforced by the `for … await this.runOneAgent(...)` loop in `executeRuns`.

### Per-agent execution

12. A failure in one agent never aborts the others: `runOneAgent` persists its
    own failure and rethrows; the loop's `catch` only logs.
    Enforced by `executeRuns`.
13. The provider is resolved through `container.llm(agent.provider)`. A missing
    key throws `ConfigError`, which lands in the failure branch (invariant 18)
    with the config message as `error`. Enforced by `runOneAgent`.
14. Repo-intel enrichment is gated per agent by `agent.repoIntel !== false` and
    is best-effort: `buildCallersDigest` (`getCallerSignatures`, limit 10),
    `buildRepoMapDigest` (skipped when `degraded` or empty) and `buildRankNote`
    (files with `percentile >= 95`) each swallow errors into a log line and
    return nothing. Enrichment can never fail a run.
    Enforced by the three private builders in `run-executor.ts`.
15. The engine call is `reviewPullRequest` from `@devdigest/reviewer-core` with
    `strategy: agent.strategy ?? REVIEW_STRATEGY` (`'single-pass'`),
    `task = taskLine(pull) + rankNote`, `sessionId = owner/name#number:agentName`,
    `onEvent` wired to the run logger and `checkCancelled` throwing
    `RunCancelledError`. Callers, repo map and PR body are passed only when
    non-empty. Enforced by `runOneAgent`.
16. Findings that do not cite a line present in the diff are dropped and the
    score is recomputed from the survivors; the model's own score is ignored.
    `costUsd` is the sum over chunks and becomes `null` if any chunk is `null`.
    Enforced by `reviewer-core/src/review/run.ts` (`groundFindings`,
    `scoreFromFindings`).

### Persistence on success

17. The success path writes, in this order, and only after the engine returns:
    1. `reviews` row: `kind 'review'`, `run_id = runId`, `agent_id`, `verdict`,
       `summary`, `score`, `model` (`ReviewRepository.insertReview`).
    2. `findings` rows for the kept findings (`insertFindings`).
    3. `pull_requests.last_reviewed_sha = pull.headSha` (`markReviewed`), which
       feeds `deriveReviewStatus` on the PR list.
    4. `agent_runs` update: `status 'done'`, `duration_ms`, `tokens_in`,
       `tokens_out`, `cost_usd` (may be `null` or `0`), `findings_count`,
       `grounding`, `score`, `blockers = countBlockers(kept, agent.ciFailOn)`,
       `error null` (`completeAgentRun`).
    5. Exactly one `run_traces` document, upserted on `run_id`
       (`saveRunTrace`), then `runBus.complete(runId)`.
    Enforced by `runOneAgent`.
18. The trace (`RunTrace` in `vendor/shared/contracts/trace.ts`) carries
    `config` (agent name, version, provider, model, PR number, `source 'local'`),
    `stats` (the same numbers as the `agent_runs` row, including `cost_usd`),
    `prompt_assembly` from the engine, one `tool_calls` entry per chunk
    (`tool 'review_file'`, `args` = chunk label, `meta` = mode), `raw_output`,
    empty `memory_pulled` and `specs_read`, and `log` = the run's full bus
    buffer via `RunLogger.logFor(runId)`. Enforced by `runOneAgent`.

### Failure and cancellation

19. Any throw inside `runOneAgent` after the run started is persisted as
    `status 'failed'` with `error = err.message`, or `status 'cancelled'` with
    `error 'Cancelled by user'` when the error is `RunCancelledError`. In both
    cases `tokens_in`/`tokens_out` are 0, `cost_usd` is `null`, `findings_count`
    is 0, `grounding` is `'0/0 passed'`, `score`/`blockers` are `null`, the
    trace is `traceFromBuffer` (zeroed stats, `prompt_assembly.system` only,
    `log` = the buffer so far), and the bus is completed. Persistence errors in
    this branch are swallowed. Enforced by the `catch` in `runOneAgent`.
20. `POST /runs/:id/cancel` publishes an info event, sets the bus cancel flag,
    updates the row to `cancelled` only if it is still `running`
    (`cancelRunIfRunning`), and completes the bus immediately so SSE clients
    end and orphaned runs (no live runner) can be cancelled too. Enforced by
    `ReviewService.cancelRun`.
21. The only place a live runner can observe cancellation is the engine's
    checkpoint before each chunk's LLM call (`input.checkCancelled?.()` in
    `reviewer-core/src/review/run.ts`, wired to `runBus.isCancelled` in
    `runOneAgent`). Enforced by `reviewPullRequest`; see the caveat below on
    how narrow that window is.
22. On boot, every `agent_runs` row still `running` is set to `failed` with no
    `error` text and no trace written. Enforced by `reapStaleRunningRuns`,
    called from `buildApp`.

### Streaming and reads

23. `GET /runs/:id/events` replays the buffered events first, then streams live
    ones, and ends when the bus signals `done`. A subscriber that connects after
    completion gets the replay and an immediate end. Wire format: SSE `id` =
    `seq`, `event` = kind, `data` = the JSON `RunEvent`. Enforced by
    `RunBus.subscribe` / `onDone` (`platform/sse.ts`) and the route.
24. `GET /pulls/:id/runs` returns every run for the PR in the workspace, any
    status, newest `ran_at` first, as `RunSummary` (including `error`,
    `cost_usd`, `score`, `blockers`). Enforced by `run.repo.ts` `listRunsForPull`.
25. `GET /pulls/:id/runs/active` returns only `status = 'running'` rows with the
    agent name joined. Enforced by `activeRunsForPull`.
26. `GET /runs/:id/trace` returns the single `run_traces` document or 404
    `not_found` (`'Run trace not found'`). Enforced by the route and `getRunTrace`.
27. `GET /pulls/:id/reviews` 404s when the PR is not in the workspace, then
    returns reviews newest first, each with its findings and `agent_name`.
    Enforced by `ReviewService.reviewsForPull` and `review.repo.ts` `reviewsForPull`.
28. The PR list's `cost_usd` is the sum of `agent_runs.cost_usd` over rows with
    `status = 'done'` and a non-null cost, `null` when there are none; failed,
    cancelled and null-cost runs never contribute. Enforced by
    `run.repo.ts` `costRollupForPulls` and `modules/pulls/routes.ts`.

### Deletion

29. `reviews.run_id` is a plain uuid column with no foreign key
    (`db/schema/reviews.ts`, migration `0008`). `DELETE /runs/:id` therefore
    deletes the review(s) with that `run_id` explicitly, then the run; the trace
    cascades from `agent_runs` and findings cascade from `reviews`. Returns
    `{ ok: false }` rather than 404 when the run is not in the workspace.
    Enforced by `run.repo.ts` `deleteAgentRun`.
30. `DELETE /reviews/:id` removes the review and its findings (cascade) but
    leaves the `agent_runs` row and its trace in place; 404 when not found.
    Enforced by `review.repo.ts` `deleteReview` and the route.

## Out of scope / not guaranteed

- Atomicity across the success path. Steps in invariant 17 are separate
  statements, not a transaction; a throw after `insertReview` leaves the review
  row in place while the run is marked `failed`.
- That a live runner actually stops on cancel. `RunBus.complete`, called at the
  end of `cancelRun`, deletes the run from the `cancelled` set, so the flag is
  visible only between `runBus.cancel` and that `complete` (the span of one
  `cancelRunIfRunning` update). A checkpoint outside that window sees no
  cancellation, the run finishes, and `completeAgentRun` overwrites the
  route's `cancelled` status with `done` and a persisted review. A single-pass
  run mid-call has no later checkpoint at all. No server test covers cancel.
- Workspace scoping of `/runs/:id/events`, `/runs/:id/cancel` and
  `/runs/:id/trace`. They call `getContext` but do not check that the run
  belongs to the workspace; `getRunTrace` and `cancelRunIfRunning` take no
  `workspaceId`.
- Replay after a restart. The bus buffer is in-memory; after a restart the SSE
  stream is empty and the persisted trace is the only record.
- More than one API process per database (boot reaping would fail the other
  instance's live runs).
- Ordering or isolation between concurrent `POST /pulls/:id/review` calls on
  the same PR; nothing prevents parallel runs for the same agent.
- `error` text and a trace for runs reaped on boot (invariant 22).
- Recomputing cost from current prices. `cost_usd` is stored at completion and
  never revised (see `run-cost-badge.md`).
- The `agents.version` snapshot in the trace is informational; the review is
  not linked to an `agent_versions` row.
