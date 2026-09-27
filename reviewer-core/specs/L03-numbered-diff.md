# Numbered diff in the review prompt

**Status:** in-progress
**Lesson / ticket:** L03 (bug: findings anchored one line too high)

The fix spans `reviewer-core/` (the prompt) and `server/` (one parser rule), so it
keeps **one** spec — this file. `server/specs/L03-numbered-diff.md` only points here.

## Goal

A reviewer must cite the line it means. Today the model receives the raw unified
diff (`run.ts` → `diff.raw` / `sliceDiff`) with no line numbers, so it has to count
down from the `@@ -a,b +c,d @@` header. It miscounts: on PR #5
(`events-map.component.ts`, hunk `@@ -443,6 +443,8 @@`) two of three reviewers put
the hardcoded API key on **445** — the blank context line above it — instead of
**446**. Grounding keeps 445 (context lines are part of the hunk), and the client
correctly draws the card under 445, one line above the code it is about.

Fix: send the model the diff with each line's new-file number printed in a gutter,
and tell it to cite those numbers.

## Non-goals

- Client anchoring. A card stays on the finding's exact `start_line`, never the
  nearest line (`client/src/components/diff-viewer/findings.ts`) — it was correct.
- Grounding rules. `grounding.ts` stays as it is; it now receives right numbers.
- Deduplicating similar findings from different reviewers — intended behaviour.
- Rewriting findings already stored; old reviews keep their numbers until re-run.
- The parser's handling of an added line whose content starts with `++ ` (once
  misread as a `+++ ` file header) — fixed by the count-driven parser, see
  [L03-diff-parser.md](L03-diff-parser.md).

## Contract

### `numberDiff(raw: string): string` — new, pure, in `reviewer-core`

Exported from `src/index.ts`. Input: unified-diff text (a whole diff or one
`sliceDiff` slice). Output: the same lines, in order, each prefixed with a fixed
gutter. Rules:

| Input line | Gutter | Cursor |
|---|---|---|
| `diff --git …`, `index …`, `--- …`, `+++ …`, anything before the first `@@` of a file | blank | — |
| `@@ -a,b +c,d @@ …` | blank | reset to `c` |
| `+…` (added) | new-side number | +1 |
| ` …` or `""` inside a hunk (context) | new-side number | +1 |
| `-…` (deleted) | blank — the line does not exist in the new file | — |
| `\ No newline at end of file` | blank | — |
| the empty string after the diff's final `\n` | not emitted | — |

The gutter is the number right-aligned in 6 columns plus one space
(`"   446 "`); a blank gutter is 7 spaces. The original line follows unchanged,
including its `+`/`-`/space prefix. Example (PR #5):

```
@@ -443,6 +443,8 @@ export class EventsMapComponent
   443      */
   444      private eventNamesMapping: EventNamesMap | null = null;
   445 
   446 +    private gmapApiKey = '…'; // test issue 1
   447 +
   448      get eventsSearchControl() {
```

**Invariant:** for every hunk, the numbers `numberDiff` prints equal
`parseUnifiedDiff(raw).files[i].hunks[j].newLineNumbers` — the set grounding
checks. The two must never disagree.

### Prompt (`reviewPullRequest` / `assemblePrompt`)

- Every diff that reaches the LLM is numbered: the whole-diff assembly
  (`run.ts` trace default), the single-pass chunk, and each map-reduce chunk
  (`numberDiff(sliceDiff(diff, path))`). `sliceDiff` keeps its signature (the
  server re-exports it) and still slices the raw text.
- The verbose telemetry `diffFiles[].chars` measures the numbered text — what is
  actually sent.
- The `## Diff to review` section gets a **trusted** instruction, outside the
  untrusted wrapper: each line starts with its line number in the new file;
  `start_line`/`end_line` must be those printed numbers; never count from the
  `@@` header; never cite a `-` line (it has no number).

### Server parser

The parser now lives in `reviewer-core/src/diff/parse.ts` (`parseDiff` /
`parseUnifiedDiff`), not in `server/`. `server/src/adapters/git/diff-parser.ts`
is a one-line re-export. `numberDiff` renders the very same parse
`parseUnifiedDiff` maps into `newLineNumbers`, so the invariant below holds **by
construction** — not by keeping two hand-written state machines in agreement.
Full contract, the count-driven state machine and the count-mismatch behaviour:
[L03-diff-parser.md](L03-diff-parser.md).

## Acceptance criteria

- [ ] AC-1 `numberDiff` on the PR #5 hunk prints 445 on the blank context line
      and 446 on the `gmapApiKey` line.
- [ ] AC-2 A deleted line gets a blank gutter; numbering skips it (the next
      context/added line keeps the new-side count).
- [ ] AC-3 The counter restarts at every `@@` header and every file (multi-hunk,
      multi-file fixture).
- [ ] AC-4 `\ No newline at end of file` and the trailing empty string get no
      number and do not advance the counter — in `numberDiff` AND the parser.
- [ ] AC-4b A deleted `----` line is a deletion in the parser (no new-side number).
- [ ] AC-5 Invariant: for the grounding test fixtures, printed numbers equal the
      parser's `newLineNumbers` per hunk.
- [ ] AC-6 The prompt the LLM receives contains the numbered diff in single-pass
      and in map-reduce, and the line-number instruction sits outside the
      untrusted delimiters.
- [ ] AC-7 `docs/agent-prompts/README.md` describes the gutter and the rule.
- [ ] AC-8 Manual: re-running the review on PR #5 puts every hardcoded-key card
      under line 446.

## Test plan

- `reviewer-core/test/numbered-diff.test.ts` (new, vitest): AC-1…AC-4.
- `reviewer-core/test/run.test.ts`: AC-6 via the stubbed `LLMProvider` (capture
  the user prompt), both modes.
- `reviewer-core/test/prompt.test.ts`: the instruction is trusted text.
- `server/test/grounding.test.ts` (unit, has diff fixtures + the parser): AC-5,
  plus AC-4 for the parser.
- Existing tests that assert raw diff text inside a prompt
  (`server/test/prompt-log.it.test.ts`, `server/test/prompt-callers.test.ts`, …)
  are updated only where the assertion is about the diff text itself.
- AC-8 is manual (needs a real review run).

## Open questions

- None open here — the parser question above moved to
  [L03-diff-parser.md](L03-diff-parser.md).
