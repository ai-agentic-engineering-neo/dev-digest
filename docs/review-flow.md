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
    participant INT as IntentService
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

    Note over EX,INT: Shared pre-work: intent (server/specs/05-intent-layer.md), REVIEW_INTENT_ENABLED
    opt kill switch on
        EX->>INT: resolveForReview(pull, repo, diff)
        alt cache hit (input_hash matches)
            INT->>DB: SELECT pr_intent
            INT-->>BUS: info: PR intent ready (cached, confidence=…)
        else miss
            INT->>INT: extractTicketRefs / extractDocRefs (title, body, commits)
            INT->>GH: getIssue (same-repo tickets only, max 3)
            INT->>GIT: readFileAt(headSha, path) (docs, max 5)
            opt local read fails
                INT->>GH: getFileContent(path, ref=headSha)
            end
            INT->>LLM: completeStructured (IntentClassification)
            INT->>INT: computeConfidence (code, not the model)
            INT->>DB: upsert pr_intent (usage billed HERE, not agent_runs)
        end
        alt derivation fails/times out (30s budget)
            INT-->>BUS: info: warning: intent unavailable — …
        end
    end

    loop each agent SEQUENTIALLY
        EX->>EX: container.llm(provider)
        opt agent.repoIntel enabled (best-effort)
            EX->>RI: getCallerSignatures
            EX->>RI: getRepoMap
            EX->>RI: getFileRank (top 5 percent)
        end
        EX->>CORE: reviewPullRequest(systemPrompt, diff, context, task)
        Note right of CORE: input.intent (when resolved above) → `## PR intent`
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
        CORE->>CORE: applyScopePolicy (out_of_scope; never drops/downgrades)
        CORE->>CORE: scoreFromFindings (100 - 35C - 12W - 3S, unaffected by scope)
        CORE-->>EX: review, grounding, assembly, raw, tokens

        EX->>DB: insert reviews
        EX->>DB: insert findings (grounded only; out_of_scope flag persisted)
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
  at its next `checkCancelled` checkpoint, before the next LLM call. The executor
  checks once more after the engine returns, so a cancel that arrives during the
  last LLM call still discards the review. The server also marks the row
  `cancelled` and completes the bus immediately, so orphaned runs can be
  cancelled too. The cancel flag survives `complete()`, which is why the live
  runner still sees it.
- **Per-agent failure.** Status `failed`, the error text and the log so far
  are persisted. The remaining agents keep running.
- **Server restart.** `RunBus` is in-memory and reviews don't go through
  `JobRunner`, so runs still `running` at boot are reaped by `reapStaleRuns`.
- **Intent is shared pre-work, not per-agent.** One derivation (or cache hit)
  feeds every queued agent's prompt and trace; it never fails the review — a
  missing key, timeout or provider error only logs `warning: intent
  unavailable — …` and the run proceeds without it (server/specs/
  05-intent-layer.md).
- **Smart Diff is independent of a review, and free of a model call.**
  `GET /pulls/:id/smart-diff` classifies every PR file by role as soon as
  `pr_files` exists — before any review has run. Once a review exists, it
  reads the findings of **each agent's newest** review for `finding_lines`: a
  re-run of an agent replaces its older findings, other agents' stay. The PR
  list's FINDINGS counters sum the same set (server/specs/06-smart-diff.md).

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
- **The intent call's cost is never in `agent_runs.cost_usd`.** It is billed
  on `pr_intent` and in each run's `trace.intent` only — the reviewed-PR cost
  shown in the UI is purely the review calls' cost.
- **`out_of_scope` never changes what gets reported.** It only adds a badge;
  the finding is still persisted, still a blocker if CRITICAL, still counted
  in the score exactly like an in-scope finding.

## Key files

| Stage | File |
| --- | --- |
| PR import | `server/src/modules/pulls/routes.ts`, `server/src/modules/polling/routes.ts` |
| Review status | `server/src/modules/pulls/domain.ts` |
| Trigger | `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/application/review-service.ts` |
| Execution | `server/src/modules/reviews/application/run-executor.ts` (+ `diff-loader.ts`, `intent-prework.ts`, `prompt-context.ts`), rules in `reviews/domain/` |
| Intent | `server/src/modules/intent/` (`application/intent-service.ts`, `domain/{links,intent,classification}.ts`, `infrastructure/{doc-source,ticket-source,llm-model,repository}.ts`) — server/specs/05-intent-layer.md |
| Smart Diff | `server/src/modules/smart-diff/` (`domain/{classify,smart-diff,constants}.ts`, `application/smart-diff-service.ts`, `infrastructure/repository.ts`) — server/specs/06-smart-diff.md |
| Engine | `reviewer-core/src/review/run.ts`, `reviewer-core/src/prompt.ts` (`renderIntent`, `INTENT_SCOPE_RULE`), `reviewer-core/src/grounding.ts`, `reviewer-core/src/review/scope.ts` (`applyScopePolicy`), `reviewer-core/src/review/reduce.ts` |
| Live events | `server/src/platform/sse.ts` |
| Client | `client/src/lib/hooks/reviews.ts`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` and its `_components/` |
