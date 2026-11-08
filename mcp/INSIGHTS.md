# mcp — insights

Non-obvious lessons learned while working in `mcp/`. Maintained by the `engineering-insights` skill.
Append-only: new lines go at the end of their section; corrections are new dated entries.
Format: `- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path:line → symbol)`.
Add an entry only if forgetting it would make an agent (or a human) repeat the mistake.

## What Works
<!-- Approaches that proved effective here -->

## What Doesn't Work
<!-- Dead ends and antipatterns — the most valuable section -->

## Codebase Patterns
- 2026-11-07 — A client cancel (`notifications/cancelled`) makes the abortable `sleep` reject with `signal.reason`, which need not be an `Error`, so classifying by error type logs it as an unexpected failure with a stack → detect cancellation by `extra.signal.aborted` (extra = the handler's LAST argument) before any other error mapping (src/errors.ts:56 → guarded).
- 2026-11-07 — In the fake API, `GET /pulls/:id/runs` advances `runStatusSequence` for the tracked run (`trackedRunId`, default `run-new`), and `run_agent_on_pr` now calls `listRuns` once BEFORE `startReview` (active-run dedup), so a pre-seeded running run consumes one sequence entry on that first call → account for the extra poll when writing sequences for reuse tests (test/helpers/harness.ts:102 → trackedId; src/tools/run-agent-on-pr.ts:44 → active-run lookup).
<!-- Conventions and structure that are not obvious from the code -->

## Tool & Library Notes
- 2026-11-07 — The SDK v1 `Client` handles `notifications/progress` itself and silently drops a malformed one (no `progressToken`), so neither `setNotificationHandler(ProgressNotificationSchema)` nor `fallbackNotificationHandler` can prove "no progress was sent" — the first version of that test stayed green under a mutation that sent progress without a token → record what the SERVER transport sends (wrap `serverT.send`, assert on `serverSent`) and mutation-check the test (test/helpers/harness.ts:138 → connect `serverSent`).
<!-- Quirks of tools, libraries, OS/shell -->

## Recurring Errors & Fixes
<!-- Error message → cause → fix -->

## Session Notes
<!-- Short dated context worth keeping -->

## Open Questions
<!-- Unresolved, needs a decision -->
