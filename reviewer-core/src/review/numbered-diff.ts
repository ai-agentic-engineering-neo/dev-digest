/**
 * `numberDiff` — prints each diff line's new-file line number in a fixed
 * gutter, so the model can cite a real line instead of counting down from the
 * `@@ -a,b +c,d @@` header (it miscounts — see `specs/L03-numbered-diff.md`).
 *
 * **Invariant** (must never drift from the server's parser): for every hunk,
 * the numbers this prints equal
 * `parseUnifiedDiff(raw).files[i].hunks[j].newLineNumbers`
 * (`server/src/adapters/git/diff-parser.ts`) — the exact set citation
 * grounding checks. A `-` (deleted) line, a `+++`/`---`/`diff --git` header, a
 * `\ No newline at end of file` marker, and the header line before the first
 * `@@` of a file all get a blank gutter and do not advance the cursor.
 */

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const BLANK_GUTTER = ' '.repeat(7);

function gutter(n: number): string {
  return String(n).padStart(6) + ' ';
}

export function numberDiff(raw: string): string {
  if (raw === '') return '';
  const lines = raw.split('\n');
  if (raw.endsWith('\n')) {
    lines.pop();
  }

  let inHunk = false;
  let cursor = 0;
  const out: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      inHunk = false;
      out.push(BLANK_GUTTER + line);
      continue;
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      out.push(BLANK_GUTTER + line);
      continue;
    }
    const hh = line.match(HUNK_HEADER);
    if (hh) {
      cursor = Number(hh[3]);
      inHunk = true;
      out.push(BLANK_GUTTER + line);
      continue;
    }
    if (!inHunk) {
      out.push(BLANK_GUTTER + line);
      continue;
    }
    if (line.startsWith('-') || line.startsWith('\\')) {
      out.push(BLANK_GUTTER + line);
      continue;
    }
    out.push(gutter(cursor) + line);
    cursor++;
  }

  return out.join('\n');
}
