# Review flow: from PR import to findings in the UI

End-to-end sequence of how a pull request gets into DevDigest, how a review
runs, and how its findings reach the PR detail page.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as Client (Next.js)
    participant API as Fastify API
    participant GH as GitHub (Octokit)
    participant DB as Postgres
    participant EX as ReviewRunExecutor
    participant GIT as Local clone (git)
    participant RI as RepoIntel
    participant CORE as reviewer-core
    participant LLM as LLM provider
    participant BUS as RunBus (in-memory)

    %% ---------- 1. PR import ----------
    rect rgb(235, 242, 255)
    Note over U,DB: 1. PR import (sync-on-read)
    U->>UI: open PR list
    UI->>API: GET /repos/:id/pulls
    API->>GH: listPullRequests
    GH-->>API: PR list
    API->>DB: upsert pull_requests (repo_id, number)
    opt PRs without diff stats (max 10 per request)
        API->>GH: getPullRequest
        API->>DB: update additions / deletions / filesCount
    end
    API->>DB: latest score from reviews
    API-->>UI: PrMeta[] + status (needs_review / reviewed / stale)

    U->>UI: open PR
    UI->>API: GET /pulls/:id
    API->>GH: getPullRequest (files, commits, body)
    API->>DB: replace pr_files (patch) + pr_commits, set body
    API-->>UI: PrDetail
    UI->>API: GET /pulls/:id/reviews
    API-->>UI: ReviewDto[] (existing findings)
    end

    %% ---------- 2. Trigger ----------
    rect rgb(240, 255, 240)
    Note over U,BUS: 2. Review trigger (manual)
    U->>UI: Run Review (one agent or all)
    UI->>API: POST /pulls/:id/review
    API->>DB: resolveTargets (agents)
    loop each target agent
        API->>DB: insert agent_runs status=running
    end
    API-)EX: executeRuns (fire-and-forget, not awaited)
    API-->>UI: runs [run_id, agent_id, agent_name]
    UI->>API: GET /pulls/:id/runs/active (poll 4s)
    UI->>API: GET /runs/:runId/events (one EventSource per run)
    API->>BUS: subscribe (replay buffer, then live)
    end

    %% ---------- 3. Execution ----------
    rect rgb(255, 248, 235)
    Note over EX,BUS: 3. Background execution
    EX->>BUS: tool: Loading PR diff
    EX->>GIT: git diff base...headSha
    alt diff empty or git error
        EX->>DB: pr_files.patch
        EX->>EX: parseUnifiedDiff (synthetic diff)
    end
    alt diff load failed
        EX->>DB: all runs status=failed + trace
        EX->>BUS: complete (all runs)
    end

    loop each agent SEQUENTIALLY
        EX->>EX: container.llm(provider)
        opt agent.repoIntel enabled (best-effort)
            EX->>RI: getCallerSignatures
            EX->>RI: getRepoMap
            EX->>RI: getFileRank (top 5 percent)
        end
        EX->>CORE: reviewPullRequest(systemPrompt, diff, context, task)
        CORE->>CORE: selectMode (single-pass by default)
        loop each chunk (1 in single-pass, N files in map-reduce)
            CORE->>CORE: checkCancelled
            CORE->>CORE: assemblePrompt (untrusted wrappers + INJECTION_GUARD)
            CORE->>LLM: completeStructured (json_schema Review)
            opt fails Zod validation (up to 2 retries)
                CORE->>LLM: reprompt with schema errors
            end
            LLM-->>CORE: verdict, summary, score, findings
            CORE-->>BUS: onEvent (tool / result)
        end
        CORE->>CORE: reduceReviews (worst verdict wins)
        CORE->>CORE: groundFindings (lines must intersect a hunk)
        CORE-->>BUS: grounding dropped ... (info)
        CORE->>CORE: scoreFromFindings (100 - 35C - 12W - 3S)
        CORE-->>EX: review, grounding, assembly, raw, tokens

        EX->>DB: insert reviews
        EX->>DB: insert findings (grounded only)
        EX->>DB: markReviewed (lastReviewedSha = headSha)
        EX->>DB: agent_runs status=done, tokens, grounding, blockers
        EX->>DB: insert run_traces (single JSON document)
        EX->>BUS: complete(runId)
    end
    end

    %% ---------- 4. Rendering ----------
    rect rgb(248, 240, 255)
    Note over U,BUS: 4. Live log + findings in the UI
    BUS-->>API: buffered + live events
    API-->>UI: SSE info / tool / result / error
    UI->>UI: LiveLogStream (error events become toasts)
    BUS-->>API: done
    API-->>UI: stream closed
    UI->>UI: onerror, running=false, onRunDone
    UI->>API: invalidate pr-active-runs + pr-runs
    UI->>API: GET /pulls/:id/reviews
    API->>DB: reviews + findings
    API-->>UI: ReviewDto[]
    UI->>U: Timeline + ReviewRunAccordion (VerdictBanner + FindingsPanel + FindingCard)
    end

    %% ---------- 5. Actions ----------
    rect rgb(255, 240, 240)
    Note over U,DB: 5. Finding actions and run trace
    U->>UI: Accept or Dismiss
    UI->>API: POST /findings/:id/accept or dismiss
    API->>DB: set accepted_at or dismissed_at
    UI->>API: refetch reviews
    U->>UI: Open run trace
    UI->>API: GET /runs/:id/trace
    API->>DB: run_traces
    API-->>UI: RunTrace (prompt, raw output, log)
    end
```

## Not shown in the diagram

- **Cancel.** `POST /runs/:id/cancel` calls `runBus.cancel`. The engine stops
  at its next `checkCancelled` checkpoint, before the next LLM call. The server
  also marks the row `cancelled` and completes the bus immediately, so orphaned
  runs can be cancelled too.
- **Per-agent failure.** Status `failed`, the error text and the log so far
  are persisted. The remaining agents keep running.
- **Server restart.** `RunBus` is in-memory and reviews don't go through
  `JobRunner`, so runs still `running` at boot are reaped by `reapStaleRuns`.

## Things that aren't obvious

- **The fallback diff depends on the PR page having been opened.** `pr_files`
  is only filled by `GET /pulls/:id`. With no local clone and no prior detail
  fetch, the diff is empty. GitHub also truncates `patch` for large files.
- **`markReviewed` uses the `headSha` from when the run started.** A push
  during the review correctly leaves the PR as `needs_review`.
- **Findings dropped by grounding are not stored.** They only appear in the
  run trace log.
- **The score is deterministic.** It is computed from the grounded findings,
  and the model's own `score` is ignored. The verdict still comes from the model.
- **`{all:true}` runs agents one after another.** Total time is the sum of the
  per-agent times.

## Key files

| Stage | File |
| --- | --- |
| PR import | `server/src/modules/pulls/routes.ts`, `server/src/modules/polling/routes.ts` |
| Review status | `server/src/modules/pulls/status.ts` |
| Trigger | `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/service.ts` |
| Execution | `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/diff-loader.ts` |
| Engine | `reviewer-core/src/review/run.ts`, `reviewer-core/src/prompt.ts`, `reviewer-core/src/grounding.ts`, `reviewer-core/src/review/reduce.ts` |
| Live events | `server/src/platform/sse.ts` |
| Client | `client/src/lib/hooks/reviews.ts`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` and its `_components/` |
