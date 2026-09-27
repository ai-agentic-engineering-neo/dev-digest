import type { UnifiedDiff, DiffHunk } from '@devdigest/shared';

/**
 * Count-driven unified-diff parser (spec: `specs/L03-diff-parser.md`).
 *
 * `parseDiff` walks `raw` once, classifying every line by two things only:
 * whether a hunk is currently open (tracked by counting its `@@` header's own
 * old/new remaining counts down to zero — never by scanning for the next `@@`
 * or `diff --git`), and, inside an open hunk, the line's first character.
 * `+++`/`--- ` are ONLY file headers *outside* a hunk — inside one they are a
 * plain addition/deletion, because a real diff can touch a line that itself
 * starts with those three characters (a markdown `---` rule, a `+++` in a
 * changelog). A hunk whose body has more or fewer lines than its header
 * claims is flagged `countMismatch` rather than silently mis-numbered or
 * dropped; `parseUnifiedDiff`, `numberDiff` and `sliceDiff` are all derived
 * from this one parse, so they cannot disagree with each other (see
 * `review/numbered-diff.ts`, `review/reduce.ts`).
 */

export type DiffLineKind = 'meta' | 'hunk' | 'add' | 'del' | 'context' | 'marker' | 'stray';

/** One line of `raw`. `newLine` is the new-file line number iff `kind` is
 *  `'add'` or `'context'` — exactly the hunk's `newLineNumbers`. A hunk with
 *  none of those carries `anchor` on its `@@` line instead; both are citable. */
export interface ParsedDiffLine {
  text: string;
  kind: DiffLineKind;
  newLine: number | null;
  /** Only on a `'hunk'` (`@@`) line whose hunk has no new-side line: the
   *  hunk's declared `newStart` (0 for a deleted file) — the one line a finding
   *  about those deleted lines can cite, because grounding falls back to the
   *  declared range for such a hunk (`grounding.ts` buildLineIndex). */
  anchor?: number;
}

export interface ParsedHunk extends DiffHunk {
  /** True when this hunk's body had more or fewer lines than its `@@` header
   *  declared (short body, stray trailing content, or truncated at EOF/next
   *  file). Numbering and grounding still use only the lines actually present. */
  countMismatch: boolean;
}

/** One file's diff block. `[start, end)` indexes into `ParsedDiff.lines` —
 *  from this file's first header line (`diff --git`, or the leading `--- `
 *  of a header-less plain diff) up to the next file's first header line, or
 *  EOF. */
export interface ParsedFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: ParsedHunk[];
  start: number;
  end: number;
}

export interface ParsedDiff {
  raw: string;
  lines: ParsedDiffLine[];
  files: ParsedFile[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** C `\ooo` octal / single-letter escapes `git` uses to quote a path
 *  (`core.quotePath`) — decoded as raw bytes, then re-decoded as UTF-8. */
const SIMPLE_ESCAPES: Record<string, number> = {
  '\\': 0x5c,
  '"': 0x22,
  a: 0x07,
  b: 0x08,
  t: 0x09,
  n: 0x0a,
  v: 0x0b,
  f: 0x0c,
  r: 0x0d,
};

const utf8Encoder = new TextEncoder();

/** Push the UTF-8 bytes of the code point starting at `str[i]` onto `bytes`
 *  and return the index of the next code point (2 UTF-16 units for a
 *  surrogate pair, else 1). Used for any character git left unescaped inside
 *  a quoted path: with `core.quotePath=false` git still quotes a path
 *  containing `"`, `\` or a control character, but writes everything else
 *  (including non-ASCII) raw, so `charCodeAt(0) & 0xff` would keep only the
 *  low byte of the UTF-16 code unit and corrupt it (F2). */
function pushCodePointUtf8(bytes: number[], str: string, i: number): number {
  const cp = str.codePointAt(i)!;
  for (const b of utf8Encoder.encode(String.fromCodePoint(cp))) bytes.push(b);
  return i + (cp > 0xffff ? 2 : 1);
}

function cUnquote(str: string): string {
  const bytes: number[] = [];
  let i = 1; // skip the opening quote
  while (i < str.length) {
    const ch = str[i]!;
    if (ch === '"') break;
    if (ch === '\\') {
      const next = str[i + 1];
      if (next !== undefined && next >= '0' && next <= '7') {
        let oct = '';
        let j = i + 1;
        while (j < str.length && oct.length < 3 && str[j]! >= '0' && str[j]! <= '7') {
          oct += str[j];
          j++;
        }
        bytes.push(parseInt(oct, 8) & 0xff);
        i = j;
        continue;
      }
      const mapped = next !== undefined ? SIMPLE_ESCAPES[next] : undefined;
      if (mapped !== undefined) {
        bytes.push(mapped);
        i += 2;
        continue;
      }
      // Unrecognized escape — git wrote a raw backslash it chose not to
      // decode further; treat it as an ordinary unescaped character.
      i = pushCodePointUtf8(bytes, str, i);
      continue;
    }
    i = pushCodePointUtf8(bytes, str, i);
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

/** Parse the text after `--- `/`+++ ` per the header rules: C-unquote a
 *  quoted path, else cut at the first tab; `/dev/null` → `null` ("no path on
 *  this side"); strip exactly one leading `a/`/`b/`. */
function parseHeaderPath(text: string, side: 'old' | 'new'): string | null {
  let path: string;
  if (text.startsWith('"')) {
    path = cUnquote(text);
  } else {
    const tab = text.indexOf('\t');
    path = tab === -1 ? text : text.slice(0, tab);
  }
  if (path === '/dev/null') return null;
  const prefix = side === 'old' ? 'a/' : 'b/';
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

interface OpenHunk {
  ph: ParsedHunk;
  /** The hunk's own `@@` line, so a deletions-only hunk can get its anchor. */
  header: ParsedDiffLine;
  oldRem: number;
  newRem: number;
  cursor: number;
}

export function parseDiff(raw: string): ParsedDiff {
  const rawLines = raw.split('\n');
  if (raw.endsWith('\n')) rawLines.pop();

  const lines: ParsedDiffLine[] = [];
  const files: ParsedFile[] = [];

  let current: ParsedFile | null = null;
  let oldPathForCurrent: string | null = null;
  let hadOldPath = false;
  let openHunk: OpenHunk | null = null;
  let lastClosedHunk: ParsedHunk | null = null;
  // True for exactly the one line immediately after a hunk closes (normally
  // or by force) — used only to decide whether a `\` line outside a hunk is
  // `marker` or plain `meta` (F1). Read once per outside-hunk line, then reset.
  let justClosedHunk = false;

  // Plain helpers that return a value rather than reassigning `current` /
  // `openHunk` themselves: a nested function that mutates a captured `let`
  // stops TS from re-widening its type at the call site (tsc 5.9 narrows it
  // to `never` on first use afterwards). Callers assign the result inline.
  function newFile(idx: number): ParsedFile {
    return { path: '', additions: 0, deletions: 0, hunks: [], start: idx, end: -1 };
  }
  function finalizeHunk(oh: OpenHunk, forceMismatch: boolean, file: ParsedFile | null): ParsedHunk {
    if (forceMismatch) oh.ph.countMismatch = true;
    if (oh.ph.newLineNumbers.length === 0) oh.header.anchor = oh.ph.newStart;
    if (file) file.hunks.push(oh.ph);
    return oh.ph;
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;

    if (openHunk) {
      const c = line.length === 0 ? ' ' : line[0]!;
      let consumed = true;
      if (c === '+') {
        openHunk.newRem--;
        const nl = openHunk.cursor++;
        lines.push({ text: line, kind: 'add', newLine: nl });
        openHunk.ph.newLineNumbers.push(nl);
        if (current) current.additions++;
      } else if (c === '-') {
        openHunk.oldRem--;
        lines.push({ text: line, kind: 'del', newLine: null });
        if (current) current.deletions++;
      } else if (c === ' ') {
        openHunk.oldRem--;
        openHunk.newRem--;
        const nl = openHunk.cursor++;
        lines.push({ text: line, kind: 'context', newLine: nl });
        openHunk.ph.newLineNumbers.push(nl);
      } else if (c === '\\') {
        lines.push({ text: line, kind: 'marker', newLine: null });
      } else {
        consumed = false;
        lastClosedHunk = finalizeHunk(openHunk, true, current);
        openHunk = null;
        justClosedHunk = true;
      }
      if (consumed) {
        if (openHunk!.oldRem <= 0 && openHunk!.newRem <= 0) {
          lastClosedHunk = finalizeHunk(openHunk!, false, current);
          openHunk = null;
          justClosedHunk = true;
        }
        continue;
      }
    }

    // Outside a hunk (openHunk is guaranteed null here: the branch above
    // always closes it before falling through to reprocess the same line).
    // `afterHunkClose` is true only for the one line right after that close —
    // reset immediately so later lines (even later stray/meta ones) don't
    // inherit it.
    const afterHunkClose = justClosedHunk;
    justClosedHunk = false;

    if (line.startsWith('diff --git')) {
      if (current) {
        current.end = i;
        if (current.path !== '') files.push(current);
      }
      current = newFile(i);
      oldPathForCurrent = null;
      hadOldPath = false;
      lines.push({ text: line, kind: 'meta', newLine: null });
      continue;
    }

    const hh = HUNK_HEADER.exec(line);
    if (hh) {
      const oldStart = Number(hh[1]);
      const oldLines = hh[2] !== undefined ? Number(hh[2]) : 1;
      const newStart = Number(hh[3]);
      const newLines = hh[4] !== undefined ? Number(hh[4]) : 1;
      const ph: ParsedHunk = {
        file: current?.path ?? '',
        oldStart,
        oldLines,
        newStart,
        newLines,
        newLineNumbers: [],
        countMismatch: false,
      };
      const header: ParsedDiffLine = { text: line, kind: 'hunk', newLine: null };
      openHunk = { ph, header, oldRem: oldLines, newRem: newLines, cursor: newStart };
      lines.push(header);
      continue;
    }

    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const isOld = line.startsWith('--- ');
      const text = line.slice(4);
      if (isOld) {
        // After a closed hunk, or before any file, a bare `--- `/`+++ ` pair
        // (no `diff --git`) starts a new file — the header-less plain-diff
        // format. In the normal git-diff flow `current` already exists with
        // no hunks yet (just created by `diff --git`), so this never re-fires.
        const boundary =
          (current === null || current.hunks.length > 0) &&
          rawLines[i + 1] !== undefined &&
          rawLines[i + 1]!.startsWith('+++ ');
        if (boundary) {
          if (current) {
            current.end = i;
            if (current.path !== '') files.push(current);
          }
          current = newFile(i);
          oldPathForCurrent = null;
          hadOldPath = false;
          lines.push({ text: line, kind: 'meta', newLine: null });
          continue;
        }
        // Not the two-line plain-diff boundary. In the header section (no
        // hunk of `current` has closed yet) this still sets the old path, as
        // before. Once a hunk of `current` HAS closed, a `--- ` here is not a
        // header — it's stray content that happens to start with those three
        // characters (F1).
        if (current === null || current.hunks.length === 0) {
          if (current) {
            oldPathForCurrent = parseHeaderPath(text, 'old');
            hadOldPath = true;
          }
        } else {
          lines.push({ text: line, kind: 'stray', newLine: null });
          if (lastClosedHunk) lastClosedHunk.countMismatch = true;
          continue;
        }
      } else {
        // Same rule for `+++ `: only a header before `current`'s first hunk
        // closes. After that it's stray (F1) — the one exception (the
        // boundary pair right after a plain-diff `--- `) is handled above and
        // never reaches here, because it `continue`s before this branch runs
        // and leaves `current` freshly created with no hunks yet.
        if (current !== null && current.hunks.length > 0) {
          lines.push({ text: line, kind: 'stray', newLine: null });
          if (lastClosedHunk) lastClosedHunk.countMismatch = true;
          continue;
        }
        if (!current) current = newFile(i); // defensive: a lone `+++ ` with no file yet
        const path = parseHeaderPath(text, 'new');
        if (path !== null) current!.path = path;
        else if (hadOldPath && oldPathForCurrent !== null) current!.path = oldPathForCurrent;
      }
      lines.push({ text: line, kind: 'meta', newLine: null });
      continue;
    }

    if (line.startsWith('\\')) {
      // A `\` line (e.g. `\ No newline at end of file`) is only a `marker`
      // when it directly follows a hunk's close — everywhere else outside a
      // hunk it's unrelated prose that happens to start with a backslash (F1).
      lines.push({ text: line, kind: afterHunkClose ? 'marker' : 'meta', newLine: null });
      continue;
    }

    if (line === '') {
      lines.push({ text: line, kind: 'meta', newLine: null });
      continue;
    }

    const c0 = line[0]!;
    if ((c0 === '+' || c0 === '-' || c0 === ' ') && lastClosedHunk) {
      lines.push({ text: line, kind: 'stray', newLine: null });
      lastClosedHunk.countMismatch = true;
      continue;
    }

    lines.push({ text: line, kind: 'meta', newLine: null });
  }

  if (openHunk) {
    lastClosedHunk = finalizeHunk(openHunk, true, current);
    openHunk = null;
  }
  if (current) {
    current.end = rawLines.length;
    if (current.path !== '') files.push(current);
    current = null;
  }

  return { raw, lines, files };
}

/** `parseDiff`, mapped to the `@devdigest/shared` wire contract: files with
 *  an empty path or no hunks are dropped, and each hunk keeps only its six
 *  contract keys (no `countMismatch` — see `modules/reviews/helpers.ts` on
 *  the server for how that reaches the caller instead). */
export function parseUnifiedDiff(raw: string): UnifiedDiff {
  const { files } = parseDiff(raw);
  return {
    raw,
    files: files
      .filter((f) => f.path !== '' && f.hunks.length > 0)
      .map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        hunks: f.hunks.map(
          (h): DiffHunk => ({
            file: h.file,
            oldStart: h.oldStart,
            oldLines: h.oldLines,
            newStart: h.newStart,
            newLines: h.newLines,
            newLineNumbers: h.newLineNumbers,
          }),
        ),
      })),
  };
}
