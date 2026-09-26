# spec — the review engine contract

The public surface of `@devdigest/reviewer-core` and the behaviour two separate
callers depend on: the studio server (`modules/reviews/run-executor.ts`) and the
CI agent-runner. Both consume this `src/` directly through a path alias, so a
change here reaches both at once, with no publish step in between to notice it.

Walk-through: [`../docs/pipeline.md`](../docs/pipeline.md).

## `reviewPullRequest(input) → ReviewOutcome`

### Input

| Field | Required | Contract |
|---|---|---|
| `systemPrompt` | ✔ | the agent's prompt. **Trusted** — the only trusted text in the call |
| `model` | ✔ | model id the injected provider understands |
| `diff` | ✔ | parsed `UnifiedDiff`; hunks carry new-side line numbers, which grounding indexes |
| `llm` | ✔ | injected `LLMProvider`. The engine's only side effect |
| `strategy` | | `auto` (default) · `single-pass` · `map-reduce` |
| `skills`, `memory`, `specs` | | resolved **bodies**, never slugs or ids |
| `callers`, `repoMap`, `prDescription` | | untrusted context slots |
| `task` | | framing line, e.g. `Review PR #482 — …` |
| `maxRetries`, `mapThresholdLines` | | override the defaults |
| `sessionId` | | forwarded on every call so all chunks of one review group into one provider session |
| `onEvent` | | progress sink; the server bridges it to SSE |
| `checkCancelled` | | called before each chunk call; **throws** to abort |
| `promptMeasure` | | injected `{ tokens?, fingerprint? }` used to size each prompt section; without it the section metadata carries chars only |
| `onPromptAssembled` | | called once per prompt actually **sent** (each chunk), just before its model call; payload is section metadata only, never prompt text |

**Every optional slot is omit-when-empty.** Passing `undefined` or an empty value
must produce a prompt byte-identical to not passing it. This is what lets later
lessons add slots without silently re-tuning every existing agent.

### Output

`ReviewOutcome` carries the grounded `review`, plus everything the caller needs
for observability without re-deriving it: `mode` (which path ran), `grounding`
(a summary like `"3/4 passed"`), `dropped` (each rejected finding **with its
reason**), `assembly` and `chunks` for the run trace, `tokensIn` / `tokensOut`,
`costUsd`, and the joined raw output.

`costUsd` is `number | null`. `null` means the provider reported no usable price
— it must never be coerced to `0`, which would claim the call was free.

`assemblePrompt(parts, measure?)` also returns `sections`: one content-free entry
per rendered section (`name`, `role`, `source` trusted/untrusted, `chars`,
`items`, plus `tokens` / `fingerprint` / `itemDetail` when measured). Invariant:
the system entry's `chars` equals the system message length, and the user entries'
`chars` plus 2 per `"\n\n"` join equal the user message length. An unused slot
produces no entry, and `messages` are byte-identical with or without a `measure`.
`task` is `untrusted`: the server's task line embeds the PR title and author.

## Mode selection

| `strategy` | Diff | Mode |
|---|---|---|
| `single-pass` | any | `single-pass` |
| `map-reduce` | 1 file | `single-pass` |
| `map-reduce` | >1 file | `map-reduce` |
| `auto` | ≤ threshold lines, or 1 file | `single-pass` |
| `auto` | > threshold lines **and** >1 file | `map-reduce` |

Threshold: `DEFAULT_MAP_THRESHOLD_LINES` (mirrors the server's own constant).
`auto` requires **both** conditions — a large single-file diff stays one call.

## Grounding

A finding is kept when:

1. its `file` appears in the diff, **and**
2. either its `kind` is in `FULL_FILE_KINDS` (whole-file scanners: secret leak,
   lethal trifecta, …), **or** its `start_line`–`end_line` range intersects a
   real hunk in that file.

Everything else is dropped, with a reason string naming either the missing file
or the non-intersecting range.

Invariants:

- **The gate is shared and runs after reduce**, once, for every strategy. It is
  not implemented per path, so single-pass and map-reduce cannot disagree about
  what is admissible.
- **Dropping is never silent.** `dropped` is part of the outcome; a caller that
  ignores it is choosing to, and the studio surfaces it in the run trace.
- **Grounding is not optional.** There is no flag to skip it. An ungrounded
  finding has never been persisted by any caller.

## Score

```
score = clamp(0, 100, 100 − 35·CRITICAL − 12·WARNING − 3·SUGGESTION)
```

counted over the findings that **survived** grounding, so score, findings list
and the deterministic run event always agree. The model's self-reported score is
discarded. One critical finding → 65; one warning → 88; one suggestion → 97.

`reduceReviews` also produces a score when merging map-reduce partials (the mean
of the partials), but it never survives — stage 6 overwrites it. Do not rely on
it.

## Verdict and blockers

- `reduceReviews` takes the **most severe** verdict across partials
  (`request_changes` > `comment` > `approve`), never the last one.
- `countBlockers(findings, failOn)` is the deterministic gate signal: findings at
  or above the agent's `ci_fail_on` threshold (`never` · `critical` · `warning` ·
  `any`). Callers colour run outcomes and fail CI checks on **this**, not on the
  model's verdict — a model that says "approve" while reporting a critical
  finding must still block.

## Structured output

The `Review` zod schema is the single source of truth for the model's response
format: converted to JSON Schema for the provider, then parsed with repair.
A schema-invalid response is retried up to `maxRetries`
(`DEFAULT_REVIEW_MAX_RETRIES`) with the validation error fed back. Prose is never
scraped for findings.

## Cancellation

`checkCancelled` is invoked **before** each chunk's model call and aborts by
throwing; the caller owns the error type. Cancellation therefore takes effect at
the next chunk boundary — it cannot recall a request already in flight, and a
single-pass run has exactly one checkpoint, before its only call.

## Purity rules

These are contract, not style:

- No database, GitHub, filesystem, network or `process.env` access. The only side
  effect is `llm`.
- Measurement is injected too: token counting and fingerprinting arrive through
  `promptMeasure`, so the engine loads no tokenizer and imports no `node:crypto`.
- Tests stub `LLMProvider`; the suite has no key and makes no network calls.
- `INJECTION_GUARD` is treated as a contract. No keyword or denylist scanning of
  untrusted text is added alongside it.
- A change that needs I/O belongs in the server caller, not here.
