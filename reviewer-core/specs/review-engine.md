# Review engine contract — `reviewPullRequest` (current behavior)

> **Status: describes behavior that already exists** (written after the code, from `src/` as of 2026-11-04).
> Any change that breaks a criterion below is a contract change. Update this spec in the same PR and run the
> server unit tests (the server type-checks against this source).
> How it works inside: [`../docs/pipeline.md`](../docs/pipeline.md) · cost/retries: [`../docs/providers-and-cost.md`](../docs/providers-and-cost.md).

## Goal

Given a parsed PR diff, resolved agent inputs, and an injected LLM, return **one grounded `Review`**. Every
finding in it cites a line that exists in the diff, and its score comes from those findings. The only side effect
is calls to the injected `LLMProvider`. This makes the engine identical for the studio server and the CI runner,
and testable with a stub.

## Scope

### Entry point
`reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome>`, exported from `src/index.ts`
(defined at `src/review/run.ts:137`).

### Inputs — `ReviewInput` (`src/review/run.ts:44`)

| Field | Required | Contract |
|---|---|---|
| `systemPrompt` | yes | Trusted. Sent as the system message with `INJECTION_GUARD` appended. |
| `model` | yes | Passed through to `llm.completeStructured`. |
| `diff: UnifiedDiff` | yes | Already parsed. `files[].hunks[].newLineNumbers` drive grounding. `raw` is what the model sees. |
| `llm: LLMProvider` | yes | Only `completeStructured` is called. |
| `strategy` | no | `'auto'` (default) \| `'single-pass'` \| `'map-reduce'`. See "Mode selection". |
| `skills`, `memory` | no | Resolved strings (never slugs). Rendered **unwrapped** (trusted). Empty array ⇒ section left out. |
| `specs` | no | Untrusted. Each item wrapped `spec-<i>`. Empty ⇒ left out. |
| `repoMap`, `callers`, `prDescription` | no | Untrusted, wrapped. Blank or whitespace-only ⇒ left out. `prDescription` cut to 4000 chars. |
| `task` | no | Plain first line of the user message. |
| `maxRetries` | no | Schema-repair retry budget passed to the provider (default `DEFAULT_REVIEW_MAX_RETRIES` = 2). |
| `mapThresholdLines` | no | `auto` threshold on `additions + deletions` (default `DEFAULT_MAP_THRESHOLD_LINES` = 400). |
| `sessionId` | no | Sent on every LLM call when set. |
| `onEvent(e)` | no | Progress sink: `{ kind: 'info'\|'tool'\|'result', msg, data? }`. |
| `checkCancelled()` | no | Called before each chunk's LLM call. Throwing aborts the review with that error. |
| `onUsage(u)` | no | Called after each **successful** chunk LLM call with `{ tokensIn, tokensOut, costUsd }`. |

### Output — `ReviewOutcome` (`src/review/run.ts:109`)

| Field | Contract |
|---|---|
| `review` | `{ verdict, summary }` from the model (worst verdict across chunks). `findings` = grounded survivors only. `score` = `scoreFromFindings(findings)`. |
| `grounding` | `"<kept>/<total> passed"`. |
| `dropped` | `{ finding, reason }[]` for every finding removed by grounding. |
| `mode` | `'single-pass'` \| `'map-reduce'`: the path that actually ran. |
| `assembly` | `PromptAssembly` for the trace (map-reduce: the whole-diff assembly, not a per-chunk one). |
| `chunks` | `{ label }[]`: `'all files'` or one file path per chunk. |
| `tokensIn`, `tokensOut` | Sum over all chunk calls. |
| `costUsd` | Sum over chunks, or `null` if any chunk's cost is `null`. |
| `raw` | Raw model outputs joined with `\n---\n`. |

### Mode selection (`src/review/run.ts:129 → selectMode`)
- `single-pass` → 1 chunk (the whole `diff.raw`).
- `map-reduce` → 1 chunk per file **if more than 1 file**, else single-pass.
- `auto` → map-reduce only if total changed lines > threshold **and** more than 1 file.

### Map-reduce
- One `sliceDiff(diff, path)` chunk per file, run sequentially. Non-diff prompt parts repeat in every chunk.
- `reduceReviews`: 1 partial → unchanged. N → findings concatenated (no dedup), worst verdict
  (`request_changes` > `comment` > `approve`), summaries joined with a space.

### Grounding rules (`src/grounding.ts:52 → groundFindings`), always against the whole `input.diff`
1. `finding.file` not among `diff.files[].path` → dropped (`file '<f>' not present in diff`).
2. `kind` ∈ {`secret_leak`, `lethal_trifecta`, `phantom`, `hook`} → kept (file presence is enough).
3. Otherwise kept only if some line in `[min(start,end), max(start,end)]` is in the file's line index
   (`newLineNumbers`, or the hunk's declared new range when that list is empty). Else dropped
   (`lines a-b do not intersect any diff hunk in '<f>'`).

### Score (`src/review/reduce.ts:27 → scoreFromFindings`)
`clamp(100 − 35·CRITICAL − 12·WARNING − 3·SUGGESTION, 0, 100)` over the **kept** findings. The model's own `score` is
never returned.

### Prompt hardening (`src/prompt.ts:85 → assemblePrompt`)
- `INJECTION_GUARD` is appended to every system message. It is never weakened, and keyword filtering is never added.
- Untrusted content goes inside `<untrusted source="…">`, with `</untrusted>` escaped (`wrapUntrusted`).
- Section order is fixed: task → PR description → Skills/rules → Relevant memory → Repo skeleton → Project context →
  Callers → Diff. An empty optional input produces a byte-identical prompt to the one without that slot.

### Errors
The engine defines no error types. Errors from `checkCancelled`, the provider, or schema validation propagate
unchanged. No partial `ReviewOutcome` is returned, so `onUsage` is the only record of spend before the failure.

## Out of scope (caller's job)
DB, filesystem, GitHub, env and secrets. Turning skill slugs into bodies. Choosing the provider and model. Pricing tables
(injected via `estimateCost`). Persistence, SSE, cancellation state. Posting to GitHub (`toReviewPayload` is a separate
pure helper).

## Acceptance criteria
1. With a stub `LLMProvider`, a run makes no network, DB, or filesystem calls and needs no env vars.
2. A finding citing a line outside every hunk is dropped and listed in `dropped`. `grounding` reports `k/n passed`
   (`test/run.test.ts` "single-pass: assembles, grounds, drops the hallucinated finding").
3. `review.score` equals `scoreFromFindings(kept)`, whatever score the model returned (0 findings ⇒ 100; one CRITICAL ⇒ 65).
4. `checkCancelled` throwing before a chunk aborts the run before that chunk's LLM call
   (`test/run.test.ts` "checkCancelled throwing aborts before the LLM call").
5. `sessionId` is forwarded on every chunk call (`test/run.test.ts` "forwards sessionId…").
6. `onUsage` fires once per completed chunk, so spend before a later failing chunk is reported
   (`test/run.test.ts` "onUsage reports each completed chunk…").
7. `assemblePrompt` always appends `INJECTION_GUARD`. A blank `prDescription` leaves the section out. A long one is cut
   to 4000 chars (`test/prompt.test.ts`).
8. `strategy: 'map-reduce'` with a single-file diff runs `single-pass`.
9. `npm run typecheck` and `npm test` pass in `reviewer-core/`. Server unit tests pass.
