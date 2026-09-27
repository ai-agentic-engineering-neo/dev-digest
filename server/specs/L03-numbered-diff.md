# Numbered diff in the review prompt (server)

**Status:** in-progress
**Lesson / ticket:** L03

The feature spans `reviewer-core/` and `server/`, so it keeps **one** spec:
[../../reviewer-core/specs/L03-numbered-diff.md](../../reviewer-core/specs/L03-numbered-diff.md).

Server-side change: `src/adapters/git/diff-parser.ts` is now a one-line
re-export of `parseUnifiedDiff` from `@devdigest/reviewer-core` — the parser
itself moved to `reviewer-core/src/diff/parse.ts`. See
[L03-diff-parser.md](L03-diff-parser.md) (pointer to
[../../reviewer-core/specs/L03-diff-parser.md](../../reviewer-core/specs/L03-diff-parser.md))
for the parser contract, `SimpleGitClient.diff`'s pinned git config/flags, and
the hunk count-mismatch detection in `modules/reviews/helpers.ts`.
