# reviewer-core/docs

Deeper reference material for `reviewer-core` that doesn't belong in [`../CLAUDE.md`](../CLAUDE.md) (too detailed/stable to re-read every session) or in [`../README.md`](../README.md) (too deep for a human-facing overview).

Add files here for things like: prompt/grounding design write-ups, provider-integration notes, decisions that don't fit `INSIGHTS.md`'s running-log format.

See [`specs/`](./specs/) for feature specifications.

## Pipeline architecture (as it stands)

No feature work has touched this package on the `L01` branch (the cost/
findings-visibility work lives entirely in `server`/`client` — see
[`server/docs/specs/02-spec-cost-and-findings-tracking`](../../server/docs/specs/02-spec-cost-and-findings-tracking/02-spec-cost-and-findings-tracking.md)),
so there is no `L01` feature spec here. This note instead records the
existing single-pass review pipeline this package already implements, since
that's what the `server`'s run-cost work (Unit 1 of the spec above) reads
`costUsd` from:

1. **`src/prompt.ts`** (`assemblePrompt`) builds the system/user prompt from
   the diff + optional context slots (`skills`/`memory`/`specs`/`callers` —
   present for later course lessons; this starter passes none, and
   `assemblePrompt` simply omits an absent section rather than erroring).
   `wrapUntrusted` fences untrusted diff content so it can't be mistaken for
   instructions by the model.
2. **`src/llm/openrouter.ts`** implements `LLMProvider` against any
   OpenAI-compatible endpoint (OpenRouter by default); **`src/llm/structured.ts`**
   turns the `Review` Zod schema into a JSON Schema for forced structured
   output, with parse-with-repair on a malformed first response.
3. **`src/review/run.ts`** (`reviewPullRequest`) orchestrates one pass:
   prompt → LLM call → structured `Review` → grounding. It already sums
   per-chunk LLM usage into `ReviewOutcome.costUsd` (`src/review/reduce.ts`
   handles the map-reduce/chunked variant, `null` if any chunk's cost is
   unknown) — this is the value `server/src/modules/reviews/run-executor.ts`
   persists onto `agent_runs.cost_usd` (see the server spec's Unit 1).
4. **`src/grounding.ts`** (`groundFindings`) is a mechanical citation gate:
   any finding whose file:line doesn't intersect a real diff hunk is
   silently dropped, deterministically, before the score is recomputed from
   the *surviving* findings — the model's self-reported score is never
   trusted.
5. **`src/output/to-review.ts`** (`toReviewPayload`) shapes a `Review` into a
   GitHub-review-shaped payload (body + per-line comments) for a CI/automation
   caller — not consumed by the `server`/`client` app path itself.
