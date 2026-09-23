# Grounding and scoring — contract

**Status:** contract — describes shipped behaviour that must stay true. Change the code and this file in the same commit.

What happens to the model's `Review` after the LLM call: which findings survive, how
score, verdict, blockers and the GitHub event are derived, how cost adds up. Each rule
cites code and its test, or says **untested**; paths are relative to `reviewer-core/`.
Walkthrough: [`../docs/pipeline.md`](../docs/pipeline.md) · diagram: [`../README.md`](../README.md) ·
prompt conventions: [agent-prompts](../../docs/agent-prompts/README.md#how-the-engine-uses-the-output-why-the-conventions-matter) ·
server side: [`../../server/specs/review-flow.md`](../../server/specs/review-flow.md).

## Grounding

### G1 — The file must be in the diff
`groundFindings` drops a finding whose `file` is not exactly a `diff.files[].path`,
with `file '<f>' not present in diff` (`src/grounding.ts:52-64`). The server's parser
takes paths from the `+++ b/` line and drops files with `+++ /dev/null`, so a deleted
file, or a renamed file's old path, never grounds (`../server/src/adapters/git/diff-parser.ts:39-43,78`).
This check runs before the kind check, so file-level kinds need it too.
Test: `../server/test/grounding.test.ts:56-60`. Deleted and renamed files: **untested**.

### G2 — File-level kinds skip the line check
`kind` ∈ {`secret_leak`, `lethal_trifecta`, `phantom`, `hook`} is kept once G1 passes,
whatever its lines (`src/grounding.ts:16,59,66-70`). A null, missing or `finding` kind goes to G3.
Test: `../server/test/grounding.test.ts:62-68` (`secret_leak` only).

### G3 — The lines must overlap a covered new-side line
Kept when any line in `[min(start,end), max(start,end)]` is covered in its file
(`src/grounding.ts:41-46,72-75`); else dropped with `lines S-E do not intersect any
diff hunk in '<f>'` (`src/grounding.ts:76-79`). Covered = each hunk's `newLineNumbers`:
added **and** context lines, never deleted ones (`src/grounding.ts:24-39`,
`../server/src/adapters/git/diff-parser.ts:63-74`). A hunk with empty `newLineNumbers`
(pure deletion, `+N,0`) falls back to its declared range, i.e. line `N`
(`src/grounding.ts:31-33`). So an unchanged context line, or a wide range touching one
changed line, is enough.
Tests: `../server/test/grounding.test.ts:41-45` (line 12 is context), `:47-54` (drop),
`:70-76` (range); `test/run.test.ts:46-64`. **Untested:** `start > end`; the fallback; the
parser taking any non-`+`/`-` line (`\ No newline at end of file`, a trailing empty line)
as context, so coverage can run 1–2 lines past a hunk (`diff-parser.ts:70-74`).

### G4 — The summary is `kept/total passed`
`groundingSummary` returns `${kept}/${kept + dropped} passed` (`src/grounding.ts:87-90`).
The engine emits one `info` event per drop, then `Citation grounding: …` (`src/review/run.ts:199-202`).
The server stores it on the run and in trace stats; failed or cancelled runs get
`0/0 passed` (`../server/src/modules/reviews/run-executor.ts:250,271,306`).
Tests: `../server/test/grounding.test.ts:78-87`, `test/run.test.ts:61,69`, `../server/test/reviews.it.test.ts:203,210`.

### G5 — Grounding runs once, after reduce, on the whole diff
It runs on the reduced findings against the full `input.diff` in both modes
(`src/review/run.ts:190-197`), so a map chunk's findings aren't limited to its slice.
Kept findings keep the model's order (`src/grounding.ts:58-81`); `outcome.review.findings`
is exactly the kept list (`run.ts:208`), and the server persists only that
(`run-executor.ts:215,229`). Never add a bypass.
Test: `../server/test/reviews.it.test.ts:195-197`. Order and map-reduce: **untested**.

### G6 — Inline comments anchor to a covered line
Given a diff, `toReviewPayload` anchors each inline comment to the covered line in range
nearest `end_line`; with none, the comment is dropped and the finding stays in the body.
Without a diff it uses `end_line` (`src/output/to-review.ts:107-146,152`).
Tests: `test/to-review.test.ts:135-155`.

## Score

### S1 — Score = clamp(0, 100, 100 − Σ penalty) over the kept findings
CRITICAL 35, WARNING 12, SUGGESTION 3 (`src/review/reduce.ts:13-17,27-30`), applied to
`ground.kept` (`src/review/run.ts:208`). `confidence`, `category` and `kind` don't count;
a duplicate counts twice. Examples: none → 100; one SUGGESTION → 97; one WARNING → 88;
one CRITICAL → 65; one CRITICAL + two WARNING → 41; three CRITICAL → 0 (−5 clamped).
Tests: `test/run.test.ts:67` (one CRITICAL → 65), `test/run.test.ts:72-89` (none → 100),
`../server/test/reviews.it.test.ts:193`. **Untested:** the 12 and 3 penalties, the clamp.

### S2 — The model's score is never kept
S1 overwrites the model's score (single-pass) or the rounded mean of partial scores
(map-reduce, `src/review/reduce.ts:50-52`) at `run.ts:208`. The `Reduced to … score=`
event fires before grounding and prints the discarded value (`run.ts:190-194`), so the
run log can disagree with the stored score.
Test: `test/run.test.ts:72-89` (model says 10, engine stores 100). The event: **untested**.

### S3 — The model's score must still be valid
`Review.score` is an integer 0–100 (`../server/src/vendor/shared/contracts/findings.ts:69-76`).
A fractional or out-of-range score fails validation and costs a reprompt
(`src/llm/structured.ts:74-83`), though S2 discards it. **Untested.**

## Verdict and gate

### V1 — The verdict is not recomputed
Single-pass keeps the model's verdict (`src/review/reduce.ts:44`); map-reduce keeps the
worst partial, `request_changes` > `comment` > `approve` (`reduce.ts:33-37,46-49`), even
if that chunk's findings are all dropped later. Grounding leaves it alone (`run.ts:208`);
the server stores it as-is (`run-executor.ts:224`). So `request_changes` with no kept
findings and score 100 is a valid output, and so is `approve` with a CRITICAL. Only the
prompt's [verdict convention](../../docs/agent-prompts/README.md#required-conventions-every-reviewer-prompt) keeps them consistent.
Test: `../server/test/reviews.it.test.ts:190` (pass-through). **Untested:** the inconsistent cases, worst-verdict-wins.

### V2 — Blockers are kept findings at or above the gate
`countBlockers` counts findings whose rank (SUGGESTION 1, WARNING 2, CRITICAL 3) is at
least the gate's minimum (`never` ∞, `critical` 3, `warning` 2, `any` 1)
(`src/output/to-review.ts:23-31,48-51`); `gateTriggered` is true exactly when that count
is > 0 (`to-review.ts:37-40`). The server counts kept findings against `agent.ciFailOn`
(`run-executor.ts:240`), DB default `critical` (`../server/src/db/schema/agents.ts:25-27`).
Failed and cancelled runs store `NULL` blockers
(`../server/src/modules/reviews/repository/run.repo.ts:173`), not the `0` its comment claims (`run.repo.ts:156`).
Tests: `test/to-review.test.ts:73-91,157-165`. The server wiring: **untested**.

### V3 — The GitHub event ignores the verdict
`toReviewPayload`: no findings → `APPROVE`; gate tripped → `REQUEST_CHANGES`; else
`COMMENT`; gate default `critical` (`src/output/to-review.ts:151,156-161`). The body
header follows the event (`to-review.ts:79-84`). The server doesn't call it today.
Tests: `test/to-review.test.ts:28-71`.

## Cost

### C1 — Run cost = the sum of chunk costs; one `null` makes it `null`
`costUsd` starts at 0 and adds each chunk's cost; a `null` chunk makes the run `null`
for good (`src/review/run.ts:159,184`). `0` is a real price (a free model), not unknown.
Tests: `../server/test/reviews.it.test.ts:246-254` (one $0.001 chunk), `:323-336` (a
`null` chunk → `NULL`). **Untested:** several chunks, `null` after a priced chunk.

### C2 — A call costs `usage.cost`, else the estimate, else `null`
`OpenRouterProvider` requests `usage.cost` only when its id is `openrouter`
(`src/llm/openrouter.ts:83`) and sums it over the call's repair attempts
(`openrouter.ts:97-98`). If no attempt reports it, it calls the injected
`estimateCost(model, tokensIn, tokensOut)` on the summed tokens; no estimator or an
unknown model gives `null` (`openrouter.ts:107`). Reprompts are billed.
**Untested:** `OpenRouterProvider` has no test.

### C3 — The server's estimator is the PriceBook
For `openrouter` agents the server injects `PriceBook.estimate`
(`../server/src/platform/container.ts:185-188`): live OpenRouter prices cached 6 h, the
static table while cold, `null` when neither knows the model
(`../server/src/platform/price-book.ts:5,33-39`, `../server/src/adapters/llm/pricing.ts:37-41`).
Its OpenAI/Anthropic providers use the static table only
(`../server/src/adapters/llm/openai.ts:122`, `../server/src/adapters/llm/anthropic.ts:135`).
Tests: `../server/test/price-book.test.ts:15-45`, `../server/test/adapters.test.ts:103-106`.

### C4 — Failed and cancelled runs store a `NULL` cost
The failure path writes 0 tokens and no cost, stored as `NULL` (`run-executor.ts:299-309`,
`run.repo.ts:169`), even when attempts or earlier chunks were billed.
Tests: `../server/test/reviews.it.test.ts:341-349` (failed), `:276-305` (a failed run adds
nothing to the PR's cost). Cancelled runs: **untested**.

## Not covered by tests

- Grounding: deleted/renamed files (G1); `lethal_trifecta`, `phantom`, `hook` (G2);
  `start > end`, the fallback, the parser quirk (G3); kept-finding order (G5).
- Score and verdict: penalties 12 and 3, the clamp (S1); the event value (S2); S3;
  `request_changes` with no kept findings (V1); the server's `countBlockers` call (V2).
- Map-reduce as a whole: mode selection, `sliceDiff`, `reduceReviews`. No test runs it.
- Cost: multi-chunk sums and `null` poisoning (C1), `OpenRouterProvider` (C2), cancelled runs (C4).

## When you change this

- Update the rule here in the same commit, and add or fix the test it cites. Engine
  tests are hermetic: stub the `LLMProvider` as `test/run.test.ts:107-132` does.
- Score or verdict semantics: also update the "How the engine uses the output" section
  of [agent-prompts](../../docs/agent-prompts/README.md) and the gotchas in [`../CLAUDE.md`](../CLAUDE.md).
- A new file-level kind: add it to `FindingKind` (`../server/src/vendor/shared/contracts/findings.ts:17-23`)
  and the client copy, then to `FULL_FILE_KINDS` (`src/grounding.ts:16`).
- Cost or blockers: check what the server stores and shows ([`01-run-cost-badge.md`](../../server/specs/01-run-cost-badge.md)).
