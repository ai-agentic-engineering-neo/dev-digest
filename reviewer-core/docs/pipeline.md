# The review pipeline

How `@devdigest/reviewer-core` turns a parsed diff into a grounded `Review`, and
why each stage is shaped the way it is. Every path and symbol below is taken
from the code; the contract that must stay true is in
[`../specs/review-contract.md`](../specs/review-contract.md).

```mermaid
flowchart TD
  IN["ReviewInput<br/>diff · systemPrompt · slots · llm"] --> MODE["selectMode()<br/>review/run.ts"]
  MODE -->|single-pass| ONE["1 chunk: diff.raw"]
  MODE -->|map-reduce| MANY["1 chunk per file<br/>sliceDiff() review/reduce.ts"]
  ONE --> LOOP
  MANY --> LOOP
  LOOP["per chunk: checkCancelled() → assemblePrompt() → llm.completeStructured()"]
  LOOP --> PROV["OpenRouterProvider.completeStructured()<br/>llm/openrouter.ts<br/>strict json_schema · parseWithRepair loop"]
  PROV --> RED["reduceReviews()<br/>review/reduce.ts"]
  RED --> GROUND["groundFindings()<br/>grounding.ts"]
  GROUND --> SCORE["scoreFromFindings(kept)"]
  SCORE --> OUT["ReviewOutcome<br/>review · grounding · dropped · mode · assembly · tokens · costUsd · raw"]
```

## Purity: the engine does no I/O

`src/review/run.ts` imports nothing from the server and touches no database,
filesystem, network or environment. Every side effect is injected through
`ReviewInput`:

| Field | Role |
|---|---|
| `llm: LLMProvider` | The only side effect. Interface in `server/src/vendor/shared/adapters.ts`; the engine calls just `completeStructured`. |
| `checkCancelled?: () => void` | Called before each chunk's LLM call. It must throw to abort; the engine never inspects the error, so the caller owns the type (the server throws `RunCancelledError` in `server/src/modules/reviews/run-executor.ts`). |
| `onEvent?: (e: ReviewEvent) => void` | Progress sink. The server bridges it onto the run log / SSE; tests collect messages. |

Skills, memory and specs arrive as already resolved strings, not slugs, so DB
and filesystem code stays in the caller and `npm test` runs with a stubbed
provider and no keys.

## Prompt assembly (`src/prompt.ts`)

`assemblePrompt(parts: PromptParts)` returns exactly two messages plus a
`PromptAssembly` record (contract in `server/src/vendor/shared/contracts/trace.ts`)
that the server stores in the run trace.

**System message** = `parts.system` + blank line + `INJECTION_GUARD`.

**User message** = these sections joined by blank lines, in this order, each
omitted when its input is empty or undefined:

| Order | Section heading | Source field | Wrapped? |
|---|---|---|---|
| 1 | (no heading) | `task` | no |
| 2 | `## PR description` | `prDescription`, cut to `MAX_PR_DESCRIPTION_CHARS` (4000) | yes, `pr-description` |
| 3 | `## Skills / rules` | `skills[]` joined by blank lines | no |
| 4 | `## Relevant memory` | `memory[]` as `- ` bullets | no |
| 5 | `## Repo skeleton` | `repoMap` | yes, `repo-map` |
| 6 | `## Project context` | `specs[]`, one block each | yes, `spec-<i>` |
| 7 | `## Callers of changed symbols` | `callers` | yes, `callers` |
| 8 | `## Diff to review` | `diff` (always present) | yes, `diff` |

"Wrapped" means `wrapUntrusted(label, content)`, which emits
`<untrusted source="label">…</untrusted>` after rewriting any `</untrusted>` in
the content to `<\/untrusted>` so the payload cannot close the fence early.
Skills and memory are treated as trusted or curated and are not wrapped.

### `INJECTION_GUARD` and why keyword scanning is rejected

`INJECTION_GUARD` is a constant appended to every system prompt. It tells the
model that anything inside `<untrusted>` blocks is data, never instructions,
and that claims such as "test fixture", "demo", "not for production" or "do not
flag" never descope the review, in any language.

The comment above the constant records the decision: this is the one shared,
trusted defense on every review path. Pattern-matching untrusted text
downstream was rejected because a denylist only ever catches one phrasing in
one language, while the guard is a general rule the model applies to all of
them. `reviewer-core/test/prompt.test.ts` pins that the guard is present and
covers the "intentional / test / demo" case; `INSIGHTS.md` records the same
rule under "What Doesn't Work".

## Strategy selection (`selectMode` in `src/review/run.ts`)

`ReviewStrategy` is `'auto' | 'single-pass' | 'map-reduce'`; the resolved
`ReviewMode` is one of the last two.

| Strategy | Result |
|---|---|
| `single-pass` | Always one call over `diff.raw`. |
| `map-reduce` | One call per file, but only when `diff.files.length > 1`; a single-file diff falls back to single-pass. |
| `auto` (default) | Map-reduce only when `additions + deletions` summed over all files exceeds `mapThresholdLines` (default `DEFAULT_MAP_THRESHOLD_LINES = 400`) **and** more than one file changed. Otherwise single-pass. |

The server passes `agent.strategy ?? REVIEW_STRATEGY`, and
`server/src/modules/reviews/constants.ts` sets `REVIEW_STRATEGY = 'single-pass'`,
so a studio agent without an explicit strategy never map-reduces.

Map chunks come from `sliceDiff(diff, path)` in `src/review/reduce.ts`, which
copies `diff.raw` from the file's `diff --git` header to the next header, and
falls back to a bare synthesized header when none matches.

## `reviewPullRequest` step by step

1. Resolve defaults: `mapThresholdLines` (400), `maxRetries`
   (`DEFAULT_REVIEW_MAX_RETRIES = 2`), strategy (`auto`).
2. `selectMode` picks the mode; `assembly` is initialised from a whole-diff
   `assemblePrompt` so map-reduce traces show the full prompt.
3. Build `chunks`: `[{ label: 'all files', diffText: diff.raw }]` or one
   `{ label: f.path, diffText: sliceDiff(...) }` per file.
4. Emit one `info` event naming the mode and file count.
5. For each chunk: call `checkCancelled?.()`, emit a `tool` event
   (`map: reviewing <file>` or `Reviewing all files in one pass`, with
   `data: { file }`), assemble the prompt for that chunk (single-pass overwrites
   `assembly` with this one), call `llm.completeStructured<Review>` with
   `schema: ReviewSchema`, `schemaName: 'Review'`, `maxRetries` and
   `sessionId` when supplied. Accumulate `tokensIn`, `tokensOut`, `costUsd`,
   `raw`, and the partial `Review`. Emit a `result` event with the candidate
   count.
6. `reduceReviews(partials)` merges the partials; emit a `result` event with
   the merged verdict and score (this score is the model's, pre-grounding).
7. `groundFindings(merged.findings, diff)`; emit one `info` event per dropped
   finding with its reason, then a `result` event `Citation grounding: N/M passed`.
8. Return `ReviewOutcome` with `review = { ...merged, findings: kept, score:
   scoreFromFindings(kept) }`.

## Structured output (`src/llm/structured.ts`, `src/llm/openrouter.ts`)

`toJsonSchema(schema, name)` converts the Zod `Review` schema
(`server/src/vendor/shared/contracts/findings.ts`) with `zodResponseFormat` from
`openai/helpers/zod` into a strict object schema (`additionalProperties: false`,
pinned in `server/test/prompt-structured.test.ts`).

`OpenRouterProvider.completeStructured` sends that schema out of band as
`response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }`
with `temperature` defaulting to 0. Because the shape is enforced by the API,
prompts must not describe the JSON layout; see `docs/agent-prompts/README.md`.

`parseWithRepair(schema, raw)` first tries `JSON.parse(raw.trim())`, then falls
back to `extractJson` (fence or balanced-brace extraction), then `safeParse`.
On failure it returns `{ ok: false, error, repromptMessage }`. The provider then
appends the model's reply as an `assistant` message and the reprompt as a
`user` message and calls again. The loop runs `maxRetries + 1` attempts (three
by default) and throws `OpenRouter structured output failed schema validation`
when they are exhausted. Token counts and API cost are summed across attempts,
so a repaired call is billed in full.

## Reduce and score (`src/review/reduce.ts`)

`reduceReviews(partials)` returns the single partial unchanged when there is
only one. Otherwise it concatenates findings, takes the worst verdict by
`VERDICT_RANK` (`request_changes` 2, `comment` 1, `approve` 0), rounds the mean
of the partial scores, and joins non-empty summaries with a space. There is no
deduplication.

`scoreFromFindings(findings)` is `100` minus `SEVERITY_PENALTY` per finding,
clamped to `[0, 100]`: `CRITICAL` 35, `WARNING` 12, `SUGGESTION` 3. So zero
findings is 100, one suggestion 97, one warning 88, one critical 65. The
model's `score` and the reduced mean are both discarded in favour of this.

## The grounding gate (`src/grounding.ts`)

`buildLineIndex(diff)` maps each file path to the set of new-side line numbers
from `hunk.newLineNumbers`, falling back to the declared `newStart .. newStart
+ max(newLines, 1) - 1` range when a hunk carries no explicit numbers.

`groundFindings(findings, diff)` applies two checks in order:

1. The finding's `file` must be a path in `diff.files`, otherwise it is dropped
   with reason `file '<path>' not present in diff`.
2. Unless `finding.kind` is in `FULL_FILE_KINDS` (`secret_leak`,
   `lethal_trifecta`, `phantom`, `hook`), the inclusive range
   `[min(start_line, end_line), max(...)]` must contain at least one indexed
   line, otherwise it is dropped with reason
   `lines A-B do not intersect any diff hunk in '<path>'`.

`groundingSummary` renders `"<kept>/<total> passed"`; drops are returned with
reasons and emitted as events, so nothing goes silent.

## Tokens and cost

`tokensIn` / `tokensOut` are the sums of every chunk's `StructuredResult`.
`costUsd` starts at `0` and becomes `null` as soon as any chunk reports a
`null` cost; it never recovers, so a partially priced run is reported as
unpriced rather than under-counted.

Inside `OpenRouterProvider`, cost comes from three sources in priority order:

1. `usage.cost` from the API. The provider sends `usage: { include: true }`
   (only when `id === 'openrouter'`) and reads the OpenRouter-specific field
   off `res.usage`, summing across repair attempts.
2. The injected `estimateCost(model, tokensIn, tokensOut)` option. The server
   injects `priceBook.estimate` in `server/src/platform/container.ts`.
3. `null` when neither is available.

## `OpenRouterProvider` specifics (`src/llm/openrouter.ts`)

- Drives OpenRouter through the OpenAI SDK with `baseURL` defaulting to
  `https://openrouter.ai/api/v1`, `timeout` 90 000 ms and SDK `maxRetries` 2
  (network, 5xx, 429). These are separate from the schema-repair retries.
- **No-choices guard**: OpenRouter can answer HTTP 200 with an empty `choices`
  array and an `error` object in the body. The provider throws
  `OpenRouter returned no choices for <schema>: <message>` instead of reading
  `undefined`.
- **Session grouping**: when `req.sessionId` is set and `id === 'openrouter'`
  the body carries `session_id`, so all chunks of one review group in the
  OpenRouter dashboard. `reviewPullRequest` forwards `sessionId` to every chunk
  (pinned in `reviewer-core/test/run.test.ts`).
- `listModels` fetches `/models` raw (the SDK strips `pricing`) and treats
  negative sentinel prices as unknown. `complete` and `embed` throw.

## How consumers import it

- The server's `tsconfig.json` maps `@devdigest/reviewer-core` to
  `../reviewer-core/src/index.ts`; consumers import the raw TypeScript source.
  This package's `build` and `typecheck` scripts are both `tsc --noEmit`, so
  nothing is ever emitted.
- `reviewer-core/tsconfig.json` maps `@devdigest/shared` to
  `../server/src/vendor/shared/index.ts` (the canonical contracts) and pins
  `zod` to `./node_modules/zod` so the borrowed contracts and the engine share
  one Zod instance; `vitest.config.ts` repeats the shared alias for tests.
- Dependencies are `openai` (SDK plus `zodResponseFormat`) and `zod`. The
  package uses **npm** (`package-lock.json`), unlike `server/` and `client/`.
- `src/index.ts` is the whole public surface; the server's `platform/prompt.ts`,
  `platform/grounding.ts` and `platform/structured.ts` are re-export shims.
