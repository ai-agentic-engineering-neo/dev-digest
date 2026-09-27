# Numbered diff in the review prompt (server)

**Status:** in-progress
**Lesson / ticket:** L03

The feature spans `reviewer-core/` and `server/`, so it keeps **one** spec:
[../../reviewer-core/specs/L03-numbered-diff.md](../../reviewer-core/specs/L03-numbered-diff.md).

Server-side change: `src/adapters/git/diff-parser.ts` — a `\ No newline at end of
file` line and the empty string after a final `\n` no longer advance the new-side
cursor (AC-4), and a deleted line starting with `--` is a deletion, not context
(AC-4b, gate G1), so the parser's `newLineNumbers` match the numbers the prompt
prints (AC-5, asserted in `test/grounding.test.ts`).
