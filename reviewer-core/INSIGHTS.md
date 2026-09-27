# Insights — reviewer-core

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

## What Doesn't Work

- 2026-09-27 — A test that compares two implementations (the old server parser
  vs `numberDiff`) proves only that they AGREE: it stayed green while both
  numbered the line after an added `++ i` wrong, renamed the file to `i` and kept
  a quoted non-ASCII path escaped — found only by piping real `git diff` output
  through them → test diff handling against ground truth (line N of the actual
  head file, `git diff --numstat`), and put several hostile traits in ONE path or
  line (`ф"q.ts`): each trait alone passed. (ref: server/test/diff-ground-truth.test.ts,
  src/diff/parse.ts)

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-09-27 — L03 diff-parser follow-up: count-driven `parseDiff` moved here from
  the server; `numberDiff`, `sliceDiff` and chunking derive from one parse
  (spec: specs/L03-diff-parser.md).

## Open Questions
