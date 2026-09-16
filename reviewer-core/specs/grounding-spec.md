# spec — grounding

What `groundFindings()` must guarantee. This is the mandatory gate between
"what the model claimed" and "what the caller receives" — see
[`../docs/pipeline.md`](../docs/pipeline.md) for where it sits in the pipeline
and [`../../server/specs/review-flow.md`](../../server/specs/review-flow.md)
for the end-to-end review contract this feeds.

## Guarantees

- A finding is **kept** only if it cites a line that actually exists in the
  diff being reviewed. Anything else — a hallucinated file, an out-of-range
  line, a line from a file not in the diff — is **dropped silently** before
  the caller sees it (not surfaced as an error; grounding failure is expected
  model behavior, not a bug).
- The **score is always recomputed** from the findings that survive grounding.
  The model's own self-reported score is read, if present, but never trusted
  or passed through.
- Grounding runs on **every** review, unconditionally — there is no agent
  setting or flag that disables it.
- `groundingSummary()` reports how many findings were dropped and why, for
  observability — callers can surface this, but must not use its absence of
  drops as a proxy for "the review is trustworthy" (a model can still be
  wrong about a *correctly cited* line).

## Non-goals

- Grounding checks **citation validity**, not **finding correctness**. A
  finding can cite a real line and still be a false positive — that's a
  model-quality problem, not something this gate catches.
- It does not deduplicate findings or merge overlapping ones.

## Edge cases to preserve

- **Empty diff** (e.g. a PR with only binary file changes) → zero groundable
  lines → all findings drop → score reflects "no findings," not an error state.
- **Renamed file** → citations must resolve against the diff's post-rename
  path, not the pre-rename one.
- **Multi-hunk file** → a citation must land inside *some* hunk's changed-line
  range, not just anywhere in the file.
