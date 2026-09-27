# Robust diff parsing and line numbering

**Status:** in-progress
**Lesson / ticket:** L03 (follow-up to "fixed calculation of diff line with issue", `bc411c7`)

The unified-diff parser moves from `server/src/adapters/git/diff-parser.ts` into
reviewer-core as `parseDiff`, which returns per-line records and counts the
lines in each hunk from its header. Four things are derived from its output,
so they can no longer disagree: `parseUnifiedDiff`, `numberDiff`, `sliceDiff`
(which now slices by exact path) and grounding. The server file becomes a
one-line re-export. `SimpleGitClient.diff` passes fixed flags and config, so
the host's git config no longer changes its output. Quoted paths are decoded,
and a deleted file keeps its path. When a hunk's line count does not match its
`@@` header, the hunk is flagged, the review run logs it, and grounding uses
only the lines actually present.

`server/specs/L03-diff-parser.md` is a pointer to this file — the change spans
`reviewer-core/` (the parser, `numberDiff`, `sliceDiff`, the engine) and
`server/` (the re-export shim, `SimpleGitClient.diff`, mismatch logging), so it
keeps one spec.

## Goal

The line number printed for every numbered line equals that line's number in
the new file. Every changed file (non-ASCII, quoted, nested or deleted) is
present in `UnifiedDiff.files` under its real path. A map-reduce chunk
contains exactly one file. None of this depends on the host's git config.

## Non-goals

- No change to the `Finding` contract and no quote-based re-anchoring (a
  separate, unapproved item — a model may still cite the C-quoted form of a
  path it read verbatim).
- No change to `UnifiedDiff` / `DiffHunk` in either vendored copy
  (`server/src/vendor/shared/adapters.ts:183-196`,
  `client/src/vendor/shared/adapters.ts:154-167`).
- `reviewer-core/src/grounding.ts` stays unchanged, including the
  declared-range fallback for hunks with no new-side lines (`grounding.ts:31-34`).
- The client diff viewer's own patch parsing
  (`client/src/components/diff-viewer/helpers.ts:18-32`) stays unchanged.
- `diffNameOnly`, `blame` and `log` in `simple-git.ts` stay unchanged —
  `diffNameOnly` still returns C-quoted non-ASCII paths to the incremental
  indexer (separate follow-up).
- `server/src/adapters/mocks.ts` stays unchanged (its hunk header
  `@@ -10,3 +10,4 @@` at :298 is short by one line on each side — the new
  mismatch warning simply fires on every mock-based run).
- `server/src/modules/reviews/diff-loader.ts` stays unchanged. It keeps
  importing the shim, so onion-architecture §11's exception text stays true.
- Plain `diff -u` input with no `diff --git` line and with hunks whose counts
  are wrong is not supported (see Contract, parser rules).

## Contract

**The `@devdigest/shared` contract does not change.** `UnifiedDiff` /
`DiffHunk` keep their exact shape, and `parseUnifiedDiff` returns hunks with
only the six contract keys.

New in `reviewer-core/src/diff/parse.ts`, exported from `src/index.ts`
(existing exports are unchanged):

```ts
export type DiffLineKind = 'meta' | 'hunk' | 'add' | 'del' | 'context' | 'marker' | 'stray';
export interface ParsedDiffLine { text: string; kind: DiffLineKind; newLine: number | null } // newLine !== null iff kind is 'add' | 'context'
export interface ParsedHunk extends DiffHunk { countMismatch: boolean }
export interface ParsedFile { path: string; additions: number; deletions: number; hunks: ParsedHunk[]; start: number; end: number } // [start,end) into ParsedDiff.lines
export interface ParsedDiff { raw: string; lines: ParsedDiffLine[]; files: ParsedFile[] }
export function parseDiff(raw: string): ParsedDiff;
export function parseUnifiedDiff(raw: string): UnifiedDiff; // files with path !== '' and ≥1 hunk; hunks mapped to the 6 DiffHunk keys
```

The signatures of `numberDiff(raw: string): string` and
`sliceDiff(diff: UnifiedDiff, path: string): string` are unchanged.

**Parser rules.** Lines come from `raw.split('\n')`, dropping the final `''`
when `raw` ends in `\n`.

- **Inside an open hunk** (a hunk is open while `oldRem > 0 || newRem > 0`; an
  omitted count means 1), only the first character classifies a line:
  - `+` → add (new-side counter decreases by 1)
  - `-` → del (old-side counter decreases by 1)
  - ` ` or `''` → context (both counters decrease by 1)
  - `\` → marker (no counter changes)
  - So `+++ x` and `--- x` inside a hunk are an addition and a deletion.
  - Any other line closes the hunk early with `countMismatch = true` and is
    then handled by the rules for lines outside a hunk.
- **Outside a hunk:**
  - `diff --git ` starts a new file.
  - A `@@ -a[,b] +c[,d] @@` line opens a hunk. With no current file it is
    still numbered, but belongs to no file.
  - `--- ` / `+++ ` in the header section set the old and new path. After a
    closed hunk, or before any file, a `--- ` line directly followed by
    `+++ ` starts a new file (plain diff format).
  - `\` right after a hunk → marker.
  - `''` → meta (no flag).
  - A line starting with `+`, `-` or ` ` after a closed hunk → **stray**: no
    number, not counted, and the previous hunk gets `countMismatch = true`.
  - Anything else → meta.
- A hunk that reaches EOF or a new file still open gets `countMismatch = true`.

**Path rules:**

- Take the text after `--- ` / `+++ `.
- If it starts with `"`, C-unquote it: `\\ \" \a \b \t \n \v \f \r` and
  `\ooo` octal bytes, with the bytes decoded as UTF-8.
- Otherwise cut it at the first `\t`.
- `/dev/null` means "no path on this side".
- Strip exactly one leading `a/` (old side) or `b/` (new side).
- The file's path is the new-side path, or the old-side path when the new
  side is `/dev/null`.

**Adapter:** `SimpleGitClient.diff` runs
`git -c core.quotePath=false -c diff.noprefix=false -c diff.mnemonicPrefix=false -c diff.relative=false -c diff.suppressBlankEmpty=false diff --no-color --no-ext-diff --no-textconv --unified=3 --src-prefix=a/ --dst-prefix=b/ <base>...<head>`.

**Map-reduce chunking (AM-1):** a file whose hunks have no new-side lines
(every hunk's `newLineNumbers` is empty — a deleted file, or a deletions-only
file whose hunks all have `newLines === 0`) gets no map-reduce chunk (no
`completeStructured` call) and doesn't count towards the auto-mode size
threshold, because no line of it can be cited. It still appears in the
single-pass whole-diff text, and `sliceDiff` still slices it. The predicate is
named once — `hasNewSideLines` in `reviewer-core/src/review/reduce.ts` — and
used both for chunk selection and for the threshold sum in `run.ts`.

**Server-side mismatch detection:** `diffCountMismatches(diff)` in
`server/src/modules/reviews/helpers.ts` re-parses `diff.raw` and returns every
hunk with `countMismatch`, `{ path, newStart }`, in file order (hunks with no
file are skipped). `run-executor.ts` logs one `runLog.info` and one
`logger.warn` per review when the list is non-empty, right after "Diff ready".

## Acceptance criteria

- [ ] AC-1: In a diff whose hunk contains the added line `+++ i` followed by
      `+b`, the file keeps its real path `x.ts`. Its `newLineNumbers` are
      `[1,2,3]`, and `numberDiff` prints `     2 +++ i` and `     3 +b`.
- [ ] AC-2: A deleted line `--- old comment` inside a hunk counts:
      `deletions === 1` and it gets a blank gutter.
- [ ] AC-3: A file whose header is `+++ "b/\321\204.ts"` has path `ф.ts`. A
      finding on `ф.ts` at a numbered line survives `groundFindings`.
- [ ] AC-4: `sliceDiff(d,'x.ts')`, with `sub/b/x.ts` also in `d`, contains
      exactly one `diff --git` line: `diff --git a/x.ts b/x.ts`.
- [ ] AC-5: `SimpleGitClient.diff` returns identical `files[].path`, `hunks`
      and `newLineNumbers` for a repo whose local config sets
      `diff.noprefix`, `diff.mnemonicPrefix`, `color.ui=always`,
      `core.quotePath=true`, `diff.external=false` and
      `diff.suppressBlankEmpty=true` as for the same repo without them.
- [ ] AC-6: A deleted file (`+++ /dev/null`) is in `UnifiedDiff.files` under
      its old path.
- [ ] AC-7: A hunk that has fewer lines than its header says gets
      `countMismatch = true`. Its present lines keep their numbers, and
      `diffCountMismatches` lists it. A well-formed git diff yields `[]`.
- [ ] AC-8: For generated file pairs diffed by real git, every numbered line
      N equals line N of the new file. Each file's `additions`/`deletions`
      equal `git diff --numstat` for that file.
- [ ] AC-9: `server/src/adapters/git/diff-parser.ts` is a re-export with no
      parsing logic. All pre-existing tests in `reviewer-core/test` and
      `server/test` pass unedited.
- [ ] AC-10: Both rewritten `prompt.test.ts` tests fail when
      `DIFF_LINE_NUMBER_RULE` is removed from `prompt.ts:293` or moved into
      the system message.
- [ ] AC-11 (AM-1): With the WP1 golden fixture and `strategy: 'map-reduce'`,
      `reviewPullRequest` makes one `completeStructured` call per file
      **except `gone.ts`** (4 calls, not 5), and no chunk user message
      contains `-g1`. The auto threshold's line count for the fixture equals
      the count without `gone.ts`.

## Test plan

| Package | Command | Needs Docker? | Covers |
|---|---|---|---|
| reviewer-core | `npm run typecheck && npm test` | no | AC-1–4, 6, 7, 10, 11; `numberDiff`/`sliceDiff` regressions |
| server | `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` | no (needs local `git`) | AC-3, 5, 7, 8, 9; invariant (`grounding.test.ts`) |
| server | `../scripts/hermetic.sh pnpm exec vitest run .it.test` | yes | regression only: review runs still ground `src/config.ts:11` with the mock diff |
| all | `scripts/check-all.sh` | yes for `.it` | the recorded ledger for plan-verifier |
