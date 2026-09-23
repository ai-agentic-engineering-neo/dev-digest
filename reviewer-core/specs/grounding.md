# Grounding gate

Status: implemented.

The mandatory mechanical check between "the model returned findings" and "the
review has findings". `src/grounding.ts`.

## Goal

A finding that cites `src/auth.ts:214` when the diff never touches line 214 is
worthless and worse than nothing: it is confidently wrong, and it costs a
reviewer real time to disprove. The gate drops those before they reach the UI,
using arithmetic rather than judgement.

## The rule

A diff-finding is kept **only if its `[start_line, end_line]` range intersects
a real hunk** in the unified diff for the same file. Anything else is dropped
with a reason, recorded in the run trace.

Implementation is a line index built once per run — file → set of new-side line
numbers covered by hunks (`buildLineIndex`) — then a range intersection per
finding. `newLineNumbers` is used when the hunk carries it, otherwise the
hunk's declared `newStart`/`newLines` range is the fallback.

## The exception: full-file findings

Not every finding is anchored to a changed line. Full-file scanners report on
the file as a whole, so requiring a hunk intersection would drop all of their
output. Kinds in `FULL_FILE_KINDS` — `secret_leak`, `lethal_trifecta`,
`phantom`, `hook` — ground against the weaker condition that **the file appears
in the diff at all**.

This is a real widening of the gate, and it's why `kind` is part of the finding
contract rather than presentation metadata: it decides which grounding rule
applies.

## Why mechanical, not another LLM call

Asking a model to check the previous model's citations inherits the same
failure mode, costs a second call, and produces a non-reproducible result. Line
intersection is deterministic, free, and unit-testable with a hand-written diff
(`test/grounding.test.ts`). The gate is the one place in the pipeline where
"the model said so" is not sufficient evidence.

## Output

`GroundingResult` deliberately returns **both** sides:

```ts
{ kept: Finding[], dropped: { finding: Finding; reason: string }[] }
```

The dropped list with its reasons goes into the run trace, so a user asking
"why did this run find nothing" gets an answer — a run that produced ten
hallucinated findings and a run that genuinely found nothing look identical
without it. `groundingSummary()` condenses it for the trace Stats block.

## The score is downstream of this

The final review score is computed deterministically from the findings that
**survived** the gate. The model's self-reported score is discarded. So a model
that hallucinates aggressively is penalised by getting its findings dropped,
not rewarded by a confident number.

## Cost interaction

Grounding runs after all chunks return, so it does not change token spend. Note
the separate null-poisoning rule on cost aggregation: one unpriced call makes
the whole run's `costUsd` null (`src/review/run.ts:184`) — see
[../../server/specs/run-cost.md](../../server/specs/run-cost.md).

## Out of scope

- Re-anchoring a near-miss finding to the nearest real hunk (considered;
  rejected — silently moving a citation invents evidence).
- Grounding against the full file contents rather than the diff, for
  diff-findings.
- Any severity or confidence adjustment; the gate only keeps or drops.
