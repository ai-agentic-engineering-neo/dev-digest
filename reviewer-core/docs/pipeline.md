# Review pipeline — how the engine runs today

`reviewPullRequest` (`src/review/run.ts:123-219`) is the only entry point: diff +
agent inputs + an injected `LLMProvider` in, a grounded `Review` and run telemetry
out. Diagram and exports: [`../README.md`](../README.md), whose `run`, `reduce` and
`toReview()` are really `reviewPullRequest`, `reduceReviews` and `toReviewPayload`
(`src/index.ts:35-55`). Rules that must stay true:
[`../specs/grounding-and-scoring.md`](../specs/grounding-and-scoring.md). Cited paths are relative to `reviewer-core/`.

## Inputs and outputs

| Input | Engine default | What the server passes (`../server/src/modules/reviews/run-executor.ts:190-212`) |
| ----- | -------------- | ---- |
| `systemPrompt`, `model`, `diff`, `llm` | required (`run.ts:44-52`) | the agent row, the parsed PR diff, `container.llm(agent.provider)` |
| `strategy` | `'auto'` (`run.ts:126`) | `agent.strategy`. The DB default is `single-pass` (`../server/src/db/schema/agents.ts:20-22`), so `auto` runs only when set in the Agent editor |
| `maxRetries` | 2 (`run.ts:31-32,125`) | not passed |
| `mapThresholdLines` | 400 changed lines (`run.ts:29-30,124`) | not passed |
| `task` | none | `taskLine(pull)` + a repo-intel rank note (`run-executor.ts:184`) |
| `prDescription`, `repoMap`, `callers` | omitted | the PR body; repo-intel digests when the agent has repo intel on (`run-executor.ts:168-182,200-205`) |
| `skills`, `memory`, `specs` | omitted | never passed today |
| `sessionId` | none | `owner/name#number:agent` (`run-executor.ts:207`) |
| `onEvent`, `checkCancelled` | none | the run log / SSE bridge; a check that throws `RunCancelledError` (`run-executor.ts:208-211`) |

`ReviewOutcome` (`run.ts:95-113`): the grounded `review`, `grounding`, `dropped`
(with reasons), `mode`, the trace's `assembly` and chunk labels, summed tokens and
`costUsd`, and all raw outputs joined with `\n---\n` (`run.ts:217`).

## 1. Mode selection

`selectMode` (`run.ts:115-121`):

- `single-pass` — one call with the whole diff.
- `map-reduce` — one call per file, but only when the diff has more than one file.
  A one-file diff falls back to single-pass (`run.ts:117`).
- `auto` — map-reduce only when additions + deletions exceed the threshold **and**
  there is more than one file (`run.ts:119-120`).

The server defaults to single-pass on purpose: one file's failed call fails the
whole run (`../server/src/modules/reviews/constants.ts:5-12`).

## 2. Chunk loop

Chunks are `[{ label: 'all files', diffText: diff.raw }]`, or one per file cut
with `sliceDiff` (`run.ts:144-147`). The loop is sequential: map-reduce calls do not
run in parallel (`run.ts:162-188`). For each chunk:

1. `checkCancelled()` — a throw aborts the run before the next call (`run.ts:164`).
2. A `tool` event, then `assemblePrompt` with the chunk's diff text (`run.ts:167-172`).
   Each chunk also gets the full task, PR description, repo skeleton and callers.
3. `llm.completeStructured({ schema: Review, schemaName: 'Review', maxRetries, sessionId })`
   (`run.ts:174-181`).
4. Tokens and cost are summed, the raw text and the partial `Review` are kept, and
   a `result` event reports the candidate count (`run.ts:182-187`).

`sliceDiff` (`src/review/reduce.ts:58-72`) keeps each `diff --git` block whose header
contains `b/<path>` or ` <path>` — a substring match, so the slice for `x.ts` also
takes `lib/x.ts`. No match → a header with no hunks (`reduce.ts:68-71`).

Trace caveat: `assembly` starts as the whole-diff prompt and is replaced by the
prompt actually sent only in single-pass (`run.ts:141-142,173`). In map-reduce the
trace shows a whole-diff prompt that was never sent.

## 3. Prompt assembly

`assemblePrompt` (`src/prompt.ts:85-141`) builds two messages: the agent prompt plus
`INJECTION_GUARD` as system (`prompt.ts:86`), and the user sections in the order
[agent-prompts](../../docs/agent-prompts/README.md#how-a-prompt-is-assembled) shows.

- The task line is pushed **unwrapped** (`prompt.ts:105`), and so are skills (joined
  bodies) and memory (`- ` bullets) (`prompt.ts:88-93`). The PR description, repo
  skeleton, each spec chunk (`spec-<i>`), callers and the diff go through
  `wrapUntrusted` (`prompt.ts:94-97,107,112,117,120`).
- `wrapUntrusted` rewrites `</untrusted>` as `<\/untrusted>`, so content can't close
  its own block (`prompt.ts:30-34`).
- Empty slots are left out: the PR description, repo map and callers when blank
  after trim; skills, memory and specs when the array is empty (`prompt.ts:88-119`).
  The diff section is always last (`prompt.ts:120`).
- The PR description is cut to 4000 characters (`prompt.ts:37,99-102`).
- The trace record stores `callers` and `repo_map` as passed, unwrapped. `specs` and
  `user` are stored wrapped (`prompt.ts:129-138`).

Known gap: the guard says the PR title sits inside `<untrusted>` (`prompt.ts:17-18`),
but the server puts the title and author verbatim into the unwrapped task line
(`../server/src/modules/reviews/helpers.ts:89-91`).

## 4. Provider call

The server builds `OpenRouterProvider` (`src/llm/openrouter.ts`) for agents on
`openrouter` — every seeded agent (`../server/src/db/seed.ts:12-13`) — and its own
OpenAI/Anthropic classes otherwise (`../server/src/platform/container.ts:173-193`).
`OpenRouterProvider`:

- It is the OpenAI SDK pointed at `https://openrouter.ai/api/v1`, with a 90 s timeout
  and 2 SDK retries on timeout/5xx/429 (`openrouter.ts:32,46-57`).
- It sends `temperature` 0 and a strict JSON-schema `response_format` from
  `toJsonSchema` (`openrouter.ts:60,69-77`).
- `session_id` and `usage: { include: true }` are sent only when the provider id
  is `openrouter` (`openrouter.ts:80,83`).
- An HTTP 200 with no `choices` throws right away with the upstream message. It is
  not reprompted (`openrouter.ts:88-92`).
- `completeStructured` and `listModels` (USD per 1M tokens, negative prices as unknown,
  cheapest output first) work; `complete` and `embed` throw (`openrouter.ts:123-163`).

The retry layers multiply. Each chunk gets up to `maxRetries + 1` = 3 reprompt
attempts (`openrouter.ts:68`), and each attempt gets up to 3 HTTP tries from the SDK.

## 5. Structured output and repair

`src/llm/structured.ts`:

- `toJsonSchema` converts the Zod `Review` with the SDK's `zodResponseFormat`
  (`structured.ts:19-22`).
- `parseWithRepair` first runs `JSON.parse` on the raw text. If that fails, it tries
  `extractJson`, which takes the first fenced block or else the first balanced
  `{…}`/`[…]` (`structured.ts:25-48,61-65`). The strict parse goes first because
  fences or braces inside JSON strings can fool `extractJson` (`structured.ts:57-60`).
- Invalid JSON or a Zod mismatch returns a reprompt. The provider appends the bad
  output as an assistant turn, adds the reprompt and tries again
  (`structured.ts:66-83`, `openrouter.ts:112-113`).
- After the last attempt the provider throws (`openrouter.ts:115`). The error leaves
  `reviewPullRequest`, and the server marks the run failed (`run-executor.ts:292-315`).

Tokens and `usage.cost` add up across attempts (`openrouter.ts:94-98`).

## 6. Reduce

`reduceReviews` (`reduce.ts:43-55`) passes a single partial through unchanged
(`reduce.ts:44`) — the single-pass case. Otherwise it concatenates findings, keeps
the worst verdict, takes the rounded mean score and joins summaries. The
`Reduced to N finding(s); verdict=…, score=…` event fires before grounding
(`run.ts:190-194`), so its count and score are pre-grounding values.

## 7. Grounding and the final score

`groundFindings(merged.findings, input.diff)` runs once, on the whole diff, in
either mode (`run.ts:196-197`). It emits one `info` event per dropped finding, then
`Citation grounding: k/n passed` (`run.ts:199-202`). The returned review keeps the
reduced verdict and summary, swaps in the kept findings and recomputes the score
from them (`run.ts:207-208`). The exact rules are in [the contract](../specs/grounding-and-scoring.md).

## 8. Output helpers

`src/output/to-review.ts`: `toReviewPayload` (body, inline comments anchored to a
real diff line, an event from severities + gate), `gateTriggered`, `countBlockers`.
The server imports only `countBlockers` (`../server/src/modules/reviews/run-executor.ts:3,240`);
the rest is for the CI runner, back in L06 (`README.md:31-33`).

## Testing

- `test/run.test.ts` drives the pipeline with the server's `MockLLMProvider` and
  `MockGitClient` from `../server/src/adapters/mocks.ts` (`test/run.test.ts:3`), and
  `@devdigest/shared` resolves to the server's copy (`vitest.config.ts:9`): the
  engine tests need the server source beside them.
- The mock `safeParse`s its fixture and throws on a mismatch, never calling
  `parseWithRepair` (`../server/src/adapters/mocks.ts:89-105`). `OpenRouterProvider`
  and the reprompt loop have no test; `parseWithRepair` / `extractJson` are
  unit-tested in `../server/test/prompt-structured.test.ts:39-55`.
- No test runs map-reduce. `../server/test/reviews.it.test.ts:160` has "map-reduce"
  in its name, but its diff has one file and its agent keeps the default strategy,
  so it runs single-pass (`run.ts:117`).
