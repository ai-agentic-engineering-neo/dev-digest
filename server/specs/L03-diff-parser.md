# Robust diff parsing and line numbering (server)

**Status:** in-progress
**Lesson / ticket:** L03 (follow-up to "fixed calculation of diff line with issue", `bc411c7`)

The feature spans `reviewer-core/` and `server/`, so it keeps **one** spec:
[../../reviewer-core/specs/L03-diff-parser.md](../../reviewer-core/specs/L03-diff-parser.md).

Server-side changes:

- `src/adapters/git/diff-parser.ts` is a one-line re-export of
  `parseUnifiedDiff` from `@devdigest/reviewer-core` — no parsing logic here
  anymore (AC-9).
- `src/adapters/git/simple-git.ts`'s `SimpleGitClient.diff` pins the `-c` git
  config and diff flags listed in the parent spec's Contract, so a host's
  local/global git config can't change what the parser sees (AC-5).
- `src/modules/reviews/helpers.ts` exports `diffCountMismatches(diff)` (AC-7),
  used by `src/modules/reviews/run-executor.ts` right after "Diff ready" to
  log a hunk count/header mismatch once per review.
