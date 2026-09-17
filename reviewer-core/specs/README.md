# Grounded Findings Specification

## Summary

The review engine produces a `Review` containing a list of `Finding` objects, each with a citation to a source file and line range. Every finding that is returned to the caller **must satisfy the grounding invariant**: its `[start_line, end_line]` must intersect an actual diff hunk for that file, or the finding is dropped by the citation gate. The `verdict` (APPROVE / COMMENT / REQUEST_CHANGES) and `score` (0–100) are computed deterministically from the final (grounded) findings, never trusted from the model. The engine performs no I/O beyond the injected `LLMProvider` — no persistence, no GitHub calls, no mutation of any external state.

## Invariants

Each returned `Review` must satisfy **all** of the following:

### 1. Severity is one of the three valid levels

Every finding's `severity` field is in `{ 'CRITICAL', 'WARNING', 'SUGGESTION' }`.

- **Enforced by**: `Finding` Zod schema in `client/src/vendor/shared/contracts/findings.ts:11-12`. The schema is consumed during structured output validation (`llm/structured.ts:54-85, parseWithRepair`), so an LLM response that includes any other severity value fails validation and triggers a parse-with-repair retry.

### 2. Every finding cites a real diff location (grounding gate)

For diff-findings (those not in the `FULL_FILE_KINDS` set), the finding's `[start_line, end_line]` must intersect at least one hunk in the unified diff for the same file.

- **Enforced by**: `groundFindings()` in `grounding.ts:52-84`. 
  - Line 24-39: `buildLineIndex()` scans hunks and builds file → set of new-side line numbers.
  - Line 61-64: If the file is not in the diff, the finding is dropped.
  - Line 72-80: For non-full-file findings, `rangeIntersects()` checks if any line in `[start_line, end_line]` exists in the diff. If not, the finding is dropped with reason "lines do not intersect any diff hunk".
  - Line 66-69: Full-file findings (kind in `{ 'secret_leak', 'lethal_trifecta', 'phantom', 'hook' }`) only require the file to be present; they are exempt from line-range grounding.

- **Consequence**: The caller can inspect `ReviewOutcome.dropped` (review/run.ts:?) to see which findings were discarded and why. No hallucination goes unreported.

### 3. Score is deterministically derived from grounded findings

The `score` field (0–100, integer) is computed as: 100 − (sum of per-finding penalties), clamped to [0, 100]. The penalties are: CRITICAL = 35, WARNING = 12, SUGGESTION = 3.

- **Enforced by**: `scoreFromFindings()` in `review/reduce.ts:27-30`. The Review verdict and score are recomputed after grounding (review/run.ts:?), not taken from the model's self-reported values.

- **Consequence**: The score is always consistent with the findings. Zero findings → score 90 or above (per Finding schema description, client/src/vendor/shared/contracts/findings.ts:74-76). One suggestion → score ≤ 97. The number on screen never contradicts the findings.

### 4. Verdict is deterministically computed from findings and CI gate policy

The `verdict` is one of `{ 'request_changes', 'approve', 'comment' }`, computed solely from finding severities and the `failOn` policy, never from the model's self-reported verdict.

- **Enforced by**: `gateTriggered()` in `output/to-review.ts:37-40`. The function checks if any finding's severity rank meets or exceeds the gate minimum:
  - `failOn: 'never'` → unreachable (min rank = ∞), always 'approve'
  - `failOn: 'critical'` → 'request_changes' if any CRITICAL finding exists
  - `failOn: 'warning'` → 'request_changes' if any CRITICAL or WARNING finding exists
  - `failOn: 'any'` → 'request_changes' if any finding exists
  - If gate not triggered: 'comment' if any findings, else 'approve'

- **Consequence**: The review event is deterministic, reproducible, and independent of model drift.

### 5. No side effects outside the injected LLMProvider

The engine performs no database writes, GitHub API calls, file I/O, or mutations of shared state. The only I/O is the injected `LLMProvider` call(s).

- **Enforced by**: Code structure.
  - `src/review/run.ts`: No imports from `@devdigest/server`, no database calls, no GitHub SDK. Only calls `llm.complete(…)` and utility functions.
  - `src/llm/openrouter.ts`: Only makes HTTP calls to OpenRouter via the `fetch` API. No cookie/session mutation.
  - `src/grounding.ts`, `src/prompt.ts`, `src/output/to-review.ts`, `src/review/reduce.ts`: Pure functions; no I/O.

- **Consequence**: The engine is mock-testable and portable. The server and CI runner can inject their own LLM provider (OpenAI, Anthropic, or OpenRouter), and the review logic is unchanged.

## Non-Goals

This package does **not**:

- **Persist reviews**: The engine returns a `Review` object; callers (server or CI runner) own persistence.
- **Call GitHub**: No octokit or GitHub API integration. The engine outputs a `GitHubReviewPayload` (markdown body + optional inline comments + event) that the caller posts.
- **Decide which agent runs**: The engine is agnostic to the agent that provides the system prompt. The caller selects the agent and passes the system prompt text.
- **Emit findings from arbitrary sources**: The engine processes findings from the LLM only. Full-file scanners (hooks, blast, onboarding) are out of scope; they would be separate agents or preprocessing steps.
- **Validate the diff format**: The engine assumes the diff is a valid `UnifiedDiff` from `@devdigest/shared`. Parsing and validation happen in the caller.
- **Select a review strategy**: The engine accepts an explicit strategy (`'single-pass'` or `'map-reduce'`) or auto-selects based on diff size. The caller chooses the trade-off between LLM latency and token budget.
