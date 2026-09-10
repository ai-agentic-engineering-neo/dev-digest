/**
 * Diff rendering for the prompt — line numbering.
 *
 * A raw unified diff carries exactly ONE coordinate: the `@@ … +newStart,newLines @@`
 * hunk header. Every other line is anonymous. A model asked for `start_line` therefore
 * has to COUNT from the hunk header to the line it wants, and counting drifts: the
 * further into a hunk the line sits, the further off the citation lands. On a file
 * added whole (one hunk covering all 726 lines) observed citations were low by 20 lines
 * near the top and by 200+ near the bottom, monotonically — the signature of an
 * accumulating undercount, not of noise. `groundFindings` cannot catch it either: with
 * a single whole-file hunk EVERY line number intersects the hunk, so the gate degrades
 * to "the file is in the diff".
 *
 * The fix is to stop asking the model to count. `numberDiffLines` prefixes each
 * new-side line with the number it will have to cite, so reading replaces counting.
 *
 * INVARIANT — the numbers rendered here must equal the ones `buildLineIndex`
 * (`grounding.ts`) derives from the parsed diff, or the prompt would advertise line
 * numbers the citation gate then rejects. That means mirroring the line classification
 * of the diff parsers (`agent-runner/src/diff.ts`, `server/src/adapters/git/diff-parser.ts`)
 * EXACTLY, including their edge cases:
 *   - `+` (but not `+++`) → an added line, consumes a new-side number
 *   - `-` (but not `---`) → a removed line, consumes nothing (rendered unnumbered)
 *   - anything else inside a hunk → context, consumes a new-side number
 * The parsers live in the packages that own diff I/O and cannot be imported by this
 * pure engine, so the invariant is enforced by a test on the agent-runner side
 * (`diff.test.ts`) that renders a real diff and checks every emitted number against
 * `buildLineIndex`. Change the classification in one place and that test fails.
 *
 * The invariant holds in one direction only, and deliberately: every number rendered
 * here is accepted by the gate, but not every line the gate accepts is rendered.
 * `buildLineIndex` expands a hunk with NO new-side lines (a deletion-only hunk) to its
 * declared `newStart`/`newLines` range, covering a position where no line exists — there
 * is nothing for this function to print there. That asymmetry is pre-existing gate
 * leniency, pinned by its own test case; do not "fix" it by inventing a number.
 */

/** `@@ -old,oldLines +new,newLines @@` — only the new-side numbers matter here. */
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Prefix every new-side line of a unified diff with its line number in the new
 * version of the file. Removed lines get blank padding (they have no new-side
 * number); headers, the preamble and anything outside a hunk are emitted verbatim.
 *
 * Input that contains no hunk header is returned unchanged — `assemblePrompt`'s diff
 * slot also accepts a plain task string, and numbering must be a no-op there.
 */
export function numberDiffLines(raw: string): string {
  const lines = raw.split('\n');
  // A diff terminated by a newline yields one phantom trailing '' from split(). The
  // parsers pop it (counting it would over-extend the last hunk by one line); do the
  // same here, then restore the terminator on the way out.
  const endsWithNewline = lines.length > 0 && lines[lines.length - 1] === '';
  if (endsWithNewline) lines.pop();

  const out: string[] = [];
  // 0 = not inside a hunk. Real line numbers are 1-based, so 0 is a safe sentinel.
  let cursor = 0;
  let width = 1;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      cursor = 0;
      out.push(line);
      continue;
    }
    const header = HUNK_HEADER_RE.exec(line);
    if (header) {
      const newStart = Number(header[1]);
      const newLines = header[2] ? Number(header[2]) : 1;
      cursor = newStart;
      // Widest number this hunk can print, so the numbers form a column.
      width = String(Math.max(newStart + Math.max(newLines, 1) - 1, 1)).length;
      out.push(line);
      continue;
    }
    if (cursor === 0) {
      // File preamble (`index …`, `new file mode`, `--- a/x`, `+++ b/x`) or any text
      // that is not a diff at all.
      out.push(line);
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      out.push(`${' '.repeat(width)} ${line}`);
      continue;
    }
    out.push(`${String(cursor).padStart(width, ' ')} ${line}`);
    cursor++;
  }

  return out.join('\n') + (endsWithNewline ? '\n' : '');
}
