/**
 * `numberDiff` — prints each diff line's new-file line number in a fixed
 * gutter, so the model can cite a real line instead of counting down from the
 * `@@ -a,b +c,d @@` header (it miscounts — see `specs/L03-numbered-diff.md`).
 *
 * **Invariant, by construction**: this renders the very same `ParsedDiffLine[]`
 * that `parseUnifiedDiff` (`../diff/parse.js`) turns into `newLineNumbers` — one
 * parse, two views — so they cannot drift apart the way two hand-written state
 * machines could (see `specs/L03-diff-parser.md`). A `-` (deleted) line, a
 * `+++`/`---`/`diff --git` header, a `\ No newline at end of file` marker, and
 * a stray line all get a blank gutter and no number. The `@@` line of a hunk
 * with no new-side line (deletions only) prints its `anchor` — the hunk's
 * declared new start, the one line grounding accepts for it — so a finding
 * about removed code has a printed number to cite.
 */

import { parseDiff, type ParsedDiffLine } from '../diff/parse.js';

const BLANK_GUTTER = ' '.repeat(7);

function gutter(n: number): string {
  return String(n).padStart(6) + ' ';
}

function renderLine(l: ParsedDiffLine): string {
  const n = l.newLine ?? l.anchor ?? null;
  return (n === null ? BLANK_GUTTER : gutter(n)) + l.text;
}

/**
 * Render an already-parsed run of lines back into gutter-prefixed text.
 * Internal helper so the engine (`run.ts`) can number a single file's slice
 * from one whole-diff `parseDiff` call instead of re-parsing per chunk — the
 * result is byte-identical to `numberDiff(sliceDiff(diff, path))` because a
 * file's `[start, end)` block always begins outside any open hunk, the same
 * state a fresh parse of just that slice would start in.
 */
export function renderNumberedLines(lines: ParsedDiffLine[]): string {
  return lines.map(renderLine).join('\n');
}

export function numberDiff(raw: string): string {
  if (raw === '') return '';
  return renderNumberedLines(parseDiff(raw).lines);
}
