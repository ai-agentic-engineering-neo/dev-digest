# Grounding checks every model-produced finding (reviewer-core)

Status: built

Audit item: BE-3 in [`docs/improvement-plan.md`](../../docs/improvement-plan.md).

## Problem

The citation gate trusts two fields the model writes. A finding whose `kind` is
`secret_leak`, `lethal_trifecta`, `phantom` or `hook` skips the line check and is
kept on any line of a file in the diff, so a model (or a PR that steers it) can
exempt its own finding from grounding. And the range check loops over every
integer from `start_line` to `end_line`, so an `end_line` of 1e8 blocks the event
loop for most of a second.

## Goals

- A finding produced by the LLM is always line-grounded, whatever its `kind`.
- The full-file exemption applies only when the caller explicitly says the
  findings come from a server-side full-file scanner; the default is no exemption.
- A range is valid only when `start_line <= end_line`.
- The range check iterates the diff's new-side lines for the file, not the
  integer range, so its cost is bounded by the diff, not by the finding.
- A finding's span is capped; a wider span is dropped.

## Non-goals

- Building a full-file scanner. None exists yet; the option is the seam for one.
- Rewriting the model's `kind` field. The finding is kept or dropped as written.
- Correcting a bad range. A finding with a wrong range is dropped, never fixed.

## Behaviour

`groundFindings(findings, diff, options?)` checks each finding in order:

1. The file is not in the diff → dropped (`file '…' not present in diff`).
2. `options.fullFileScanner === true` and `kind` is one of the full-file kinds →
   kept (the file being in the diff is enough).
3. `start_line > end_line` → dropped (`start_line … is after end_line …`).
4. `end_line - start_line + 1 > MAX_FINDING_SPAN_LINES` (500) → dropped (`span of …
   lines exceeds …`).
5. Some new-side line of that file in the diff lies in `[start_line, end_line]`
   → kept; otherwise dropped (`lines …-… do not intersect any diff hunk`).

Without options, step 2 never applies: every finding goes through steps 3–5.
`reviewPullRequest` (the LLM path) calls the gate without the exemption.

## Changes

- Input: none on `reviewPullRequest`.
- Prompt: none.
- Pipeline: `review/run.ts` passes `{ fullFileScanner: false }` to the gate.
- Output: none; dropped findings carry the new reasons in `dropped`.
- Public API: `GroundingOptions` and `MAX_FINDING_SPAN_LINES` exported from
  `src/index.ts`; `groundFindings` takes an optional third argument.

## Acceptance criteria

- [x] On the LLM path a `secret_leak` finding on a line outside the diff is dropped.
- [x] With `{ fullFileScanner: true }` a `secret_leak` finding on a line outside
      any hunk of a file in the diff is kept.
- [x] A finding with `end_line` of 1e9 returns promptly and is dropped.
- [x] A finding with `start_line > end_line` is dropped.

## Tests

- `reviewer-core/test/grounding.test.ts` — default drops a full-file kind off the
  hunks; the explicit option keeps it; reversed range dropped; 1e9 span dropped
  well under a time bound.
- `reviewer-core/test/run.test.ts` — `reviewPullRequest` drops a model-labelled
  `secret_leak` finding outside the diff.
- `server/test/grounding.test.ts` — the full-file case passes through the
  explicit option.

## Related specs

- None.

## Open questions

- None.
