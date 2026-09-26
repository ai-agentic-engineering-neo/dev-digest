# Spec: the `reviewPullRequest` contract

What callers of `reviewPullRequest` (`reviewer-core/src/review/run.ts`) may rely
on. The server (`server/src/modules/reviews/run-executor.ts`) persists and
streams what this function returns, so every invariant below is load-bearing
for the studio UI. How the pipeline is built is in
[`../docs/pipeline.md`](../docs/pipeline.md).

## Goal

Given a parsed diff, a trusted system prompt, optional context slots and an
injected `LLMProvider`, return one `Review` whose findings all cite real lines
of that diff and whose score follows deterministically from those findings.

## Inputs: `ReviewInput`

| Field | Type | Required | Notes |
|---|---|---|---|
| `systemPrompt` | `string` | yes | Trusted agent prompt. `INJECTION_GUARD` is appended by the engine. |
| `model` | `string` | yes | Passed through to `llm.completeStructured` untouched. |
| `diff` | `UnifiedDiff` | yes | Already parsed (`server/src/vendor/shared/adapters.ts`); hunks should carry `newLineNumbers`. |
| `llm` | `LLMProvider` | yes | Only `completeStructured` is called. |
| `strategy` | `'auto' \| 'single-pass' \| 'map-reduce'` | no | Default `auto`. |
| `skills` | `string[]` | no | Resolved bodies, rendered unwrapped under `## Skills / rules`. |
| `memory` | `string[]` | no | Rendered as bullets under `## Relevant memory`. |
| `specs` | `string[]` | no | Each wrapped as untrusted `spec-<i>`. |
| `callers` | `string` | no | Wrapped as untrusted `callers`. |
| `repoMap` | `string` | no | Wrapped as untrusted `repo-map`. |
| `prDescription` | `string` | no | Wrapped as untrusted `pr-description`, truncated to 4000 chars. |
| `task` | `string` | no | First line of the user message. |
| `maxRetries` | `number` | no | Default `DEFAULT_REVIEW_MAX_RETRIES` (2). Forwarded to the provider. |
| `mapThresholdLines` | `number` | no | Default `DEFAULT_MAP_THRESHOLD_LINES` (400). |
| `sessionId` | `string` | no | Forwarded to every `completeStructured` call. |
| `onEvent` | `(e: ReviewEvent) => void` | no | Progress sink. |
| `checkCancelled` | `() => void` | no | Must throw to abort. |

Empty strings and empty arrays behave like `undefined`: the section is omitted
from the prompt and recorded as `null` in `assembly`.

## Outputs: `ReviewOutcome`

| Field | Type | Meaning |
|---|---|---|
| `review` | `Review` | `verdict`, `summary`, `score`, `findings`. Findings are the grounded survivors; `score` is recomputed. |
| `grounding` | `string` | Exactly `"<kept>/<total> passed"`, e.g. `"1/2 passed"` (`groundingSummary`, `src/grounding.ts`). |
| `dropped` | `{ finding, reason }[]` | Every finding removed by grounding, with the reason string from `groundFindings`. |
| `mode` | `'single-pass' \| 'map-reduce'` | The path that actually ran, after `selectMode` resolved `auto` and the single-file fallback. |
| `assembly` | `PromptAssembly` | Single-pass: the one prompt sent. Map-reduce: the whole-diff assembly, not any per-file chunk. |
| `chunks` | `{ label }[]` | `[{ label: 'all files' }]` for single-pass, one entry per file path for map-reduce. |
| `tokensIn`, `tokensOut` | `number` | Summed over all chunks (and, inside `OpenRouterProvider`, over repair attempts). |
| `costUsd` | `number \| null` | Sum of chunk costs; `null` if any chunk returned `null`. |
| `raw` | `string` | Raw model outputs of all chunks joined with `\n---\n`. |

## Invariants

Each entry names the code that enforces it and the test that pins it, if any.

1. **Score is recomputed from surviving findings.** `review.score` is
   `scoreFromFindings(ground.kept)` (`src/review/run.ts`, `src/review/reduce.ts`):
   100 minus 35 per CRITICAL, 12 per WARNING, 3 per SUGGESTION, clamped to
   0..100. The model's `score` and the reduce-step mean are ignored.
   Pinned: `reviewer-core/test/run.test.ts` ("score is deterministic", and the
   single-pass case expecting 65 after one drop); `server/test/reviews.it.test.ts`.
2. **Verdict passes through from the model.** `review.verdict` is
   `reduceReviews(partials).verdict`: the single partial's verdict, or the
   worst across partials by `VERDICT_RANK`. It is never derived from
   severities. Pinned only indirectly: `server/test/reviews.it.test.ts` expects
   the fixture's `request_changes` to reach the API.
3. **A finding must intersect a real hunk** of its file unless `kind` is one of
   `secret_leak`, `lethal_trifecta`, `phantom`, `hook` (`FULL_FILE_KINDS`,
   `src/grounding.ts`). Intersection is inclusive over
   `[min(start_line, end_line), max(...)]` against new-side line numbers.
   Pinned: `server/test/grounding.test.ts` (keeps line 12, drops line 999,
   keeps a `secret_leak` at line 1, range across a hunk);
   `reviewer-core/test/run.test.ts`.
4. **No finding survives with a file absent from the diff**, including the
   full-file kinds. The file check runs before the kind exemption
   (`groundFindings`, reason `file '<path>' not present in diff`).
   Pinned: `server/test/grounding.test.ts` ("drops a finding whose file is not
   in the diff").
5. **Prompts never describe the JSON shape.** `assemblePrompt` (`src/prompt.ts`)
   adds only the task, context sections and `INJECTION_GUARD`; the response
   shape is sent as `response_format: { type: 'json_schema', strict: true }` by
   `OpenRouterProvider.completeStructured` (`src/llm/openrouter.ts`) from
   `toJsonSchema(Review)`. Pinned: `server/test/prompt-structured.test.ts`
   checks the schema is a strict object; no test asserts the absence of shape
   text in the prompt.
6. **Every untrusted slot is fenced.** `prDescription`, `repoMap`, `specs`,
   `callers` and `diff` go through `wrapUntrusted`, which neutralises a
   `</untrusted>` inside the content. `INJECTION_GUARD` is always appended to
   the system message. Pinned: `reviewer-core/test/prompt.test.ts`,
   `server/test/prompt-structured.test.ts`.
7. **Slot order is fixed**: task, PR description, skills, memory, repo
   skeleton, project context, callers, diff (`assemblePrompt`). The diff is
   always last and always present. Pinned partially:
   `reviewer-core/test/prompt.test.ts` (PR description precedes the diff).
8. **PR description is capped at 4000 characters** (`MAX_PR_DESCRIPTION_CHARS`).
   Pinned: `reviewer-core/test/prompt.test.ts`.
9. **Cancellation happens between chunks.** `checkCancelled` is invoked once
   per chunk, immediately before that chunk's `completeStructured` call, and
   whatever it throws propagates unchanged. It is not called after the last
   chunk, so reduce and grounding always complete once the final call returns.
   Pinned: `reviewer-core/test/run.test.ts` ("checkCancelled throwing aborts
   before the LLM call").
10. **Events.** `onEvent` receives `ReviewEvent { kind, msg, data? }` with
    `kind` from `RunEventKind` (`server/src/vendor/shared/contracts/trace.ts`).
    The engine emits `info` (mode line, one per dropped finding), `tool` (one
    per chunk, `data: { file: label }`) and `result` (per-chunk candidate
    count, reduced verdict/score, `Citation grounding: N/M passed`). It never
    emits `error`; failures are thrown. Pinned: `reviewer-core/test/run.test.ts`
    checks a `Citation grounding` message is emitted.
11. **Retries are the provider's job.** The engine forwards `maxRetries` and
    does not loop itself. `OpenRouterProvider.completeStructured` makes up to
    `maxRetries + 1` attempts, feeding `parseWithRepair`'s `repromptMessage`
    back as a user turn, then throws. Pinned:
    `server/test/prompt-structured.test.ts` covers `parseWithRepair`; no test
    pins the attempt count.
12. **`sessionId` reaches every chunk call.** Pinned:
    `reviewer-core/test/run.test.ts` ("forwards sessionId to every LLM call").
13. **Strategy resolution.** `auto` selects map-reduce only when
    `additions + deletions > mapThresholdLines` and `diff.files.length > 1`;
    an explicit `map-reduce` on a single-file diff runs single-pass
    (`selectMode`). Pinned partially: `reviewer-core/test/run.test.ts` expects
    `mode === 'single-pass'` for the small mock diff under `auto`.
14. **Unpriced means null, not zero.** `costUsd` becomes `null` when any chunk
    reports `null` and stays `null` (`src/review/run.ts`). Not pinned at the
    engine level.
15. **Grounding drops are visible.** Every drop appears in `dropped` with a
    reason and as an `info` event. Pinned: `reviewer-core/test/run.test.ts`
    (`dropped` has length 1).

## Out of scope / not guaranteed

- Deduplication of findings. `reduceReviews` concatenates; repeated findings
  each subtract from the score.
- Deriving `verdict` from severities. Callers that need a deterministic
  decision use `gateTriggered` / `countBlockers` / `toReviewPayload`
  (`src/output/to-review.ts`), which ignore `verdict`.
- Diff parsing, truncation or token budgeting of the diff. The engine sends
  `diff.raw` (or a `sliceDiff` per file) as given.
- Correctness of `sliceDiff` for renames or unusual headers; it matches on
  `b/<path>` or ` <path>` in `diff --git` lines and otherwise falls back.
- Ordering of `review.findings` beyond "model order, chunks in file order".
- Use of `confidence`, `category` or `id` in scoring or grounding. Only
  `severity`, `file`, `start_line`, `end_line` and `kind` are consulted.
- Pricing. The engine has no price table; cost is whatever the provider
  reports or the injected `estimateCost` returns.
- Network retries, timeouts and the no-choices guard. These live in
  `OpenRouterProvider`, not in `reviewPullRequest`, and do not apply to other
  `LLMProvider` implementations.
- Persistence, SSE, run traces and the `agent_runs` row. The server owns them.
- `complete` and `embed` on `OpenRouterProvider`; both throw.

## Open questions

- Should `verdict` be derived from grounded severities so a wrong model
  verdict cannot reach the UI? Recorded in `INSIGHTS.md` under Open Questions.
