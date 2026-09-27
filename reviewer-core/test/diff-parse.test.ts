import { describe, it, expect } from 'vitest';
import { parseDiff, parseUnifiedDiff, groundFindings, numberDiff } from '../src/index.js';
import { sliceDiff } from '../src/review/reduce.js';
import { renderNumberedLines } from '../src/review/numbered-diff.js';

/**
 * `parseDiff` / `parseUnifiedDiff` — the count-driven unified-diff parser
 * (spec: `specs/L03-diff-parser.md` § Contract; plan Test brief WP1.tests /
 * WP2.tests). Every expected value below is taken from that Contract and its
 * worked golden fixture, never from running the parser and reading back its
 * own output.
 */

// The plan's WP1 golden fixture: five files exercising a plain path, a
// deletion-inside-a-hunk, a C-quoted non-ASCII path, a nested path that must
// not substring-match a shorter one, and a deleted file.
const GOLDEN_DIFF = [
  'diff --git a/x.ts b/x.ts',
  'index 1111111..2222222 100644',
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -1 +1,3 @@',
  ' a',
  '+++ i',
  '+b',
  'diff --git a/y.ts b/y.ts',
  'index 3333333..4444444 100644',
  '--- a/y.ts',
  '+++ b/y.ts',
  '@@ -1,2 +1 @@',
  '--- old comment',
  ' keep',
  'diff --git "a/\\321\\204.ts" "b/\\321\\204.ts"',
  'index 5555555..6666666 100644',
  '--- "a/\\321\\204.ts"',
  '+++ "b/\\321\\204.ts"',
  '@@ -1 +1,2 @@',
  ' z',
  '+w',
  'diff --git a/sub/b/x.ts b/sub/b/x.ts',
  'index 7777777..8888888 100644',
  '--- a/sub/b/x.ts',
  '+++ b/sub/b/x.ts',
  '@@ -1 +1,2 @@',
  ' s',
  '+t',
  'diff --git a/gone.ts b/gone.ts',
  'deleted file mode 100644',
  'index 9999999..0000000 100644',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-g1',
  '-g2',
].join('\n');

function fileOf(diff: ReturnType<typeof parseUnifiedDiff>, path: string) {
  return diff.files.find((f) => f.path === path)!;
}

describe('parseUnifiedDiff — WP1 golden fixture', () => {
  it('lists every file under its real path, sorted', () => {
    const diff = parseUnifiedDiff(GOLDEN_DIFF);
    expect(diff.files.map((f) => f.path).sort()).toEqual([
      'gone.ts',
      'sub/b/x.ts',
      'x.ts',
      'y.ts',
      'ф.ts',
    ]);
  });

  it('x.ts: a "+++ i" content line is an addition, not mistaken for a header', () => {
    const diff = parseUnifiedDiff(GOLDEN_DIFF);
    const x = fileOf(diff, 'x.ts');
    expect(x.additions).toBe(2);
    expect(x.deletions).toBe(0);
    expect(x.hunks[0]!.newLineNumbers).toEqual([1, 2, 3]);
  });

  it('y.ts: a "--- old comment" content line is a deletion, not mistaken for a header', () => {
    const diff = parseUnifiedDiff(GOLDEN_DIFF);
    const y = fileOf(diff, 'y.ts');
    expect(y.additions).toBe(0);
    expect(y.deletions).toBe(1);
    expect(y.hunks[0]!.newLineNumbers).toEqual([1]);
  });

  it('ф.ts: the C-quoted octal-escaped path decodes to the real UTF-8 name', () => {
    const diff = parseUnifiedDiff(GOLDEN_DIFF);
    const f = fileOf(diff, 'ф.ts');
    expect(f.hunks[0]!.newLineNumbers).toEqual([1, 2]);
  });

  it('gone.ts: a deleted file keeps its old path with only deletions and no citable line', () => {
    const diff = parseUnifiedDiff(GOLDEN_DIFF);
    const g = fileOf(diff, 'gone.ts');
    expect(g.deletions).toBe(2);
    expect(g.hunks[0]!.newLineNumbers).toEqual([]);
  });

  it('every hunk is well-formed: no countMismatch', () => {
    const parsed = parseDiff(GOLDEN_DIFF);
    const allHunks = parsed.files.flatMap((f) => f.hunks);
    expect(allHunks.length).toBeGreaterThan(0);
    expect(allHunks.every((h) => h.countMismatch === false)).toBe(true);
  });

  it('parseUnifiedDiff hunks carry exactly the six DiffHunk contract keys', () => {
    const diff = parseUnifiedDiff(GOLDEN_DIFF);
    for (const file of diff.files) {
      for (const hunk of file.hunks) {
        expect(Object.keys(hunk).sort()).toEqual([
          'file',
          'newLineNumbers',
          'newLines',
          'newStart',
          'oldLines',
          'oldStart',
        ]);
      }
    }
  });
});

describe('parseUnifiedDiff — path rules', () => {
  it('C-unquotes an escaped double-quote inside a quoted path', () => {
    const raw = [
      'diff --git a/x b/x',
      '--- "a/q\\"uote.ts"',
      '+++ "b/q\\"uote.ts"',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('q"uote.ts');
  });

  it('cuts a path at the first tab (git appends one to disambiguate a space)', () => {
    const raw = [
      'diff --git a/x b/x',
      '--- a/my file.ts',
      '+++ b/my file.ts\t',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('my file.ts');
  });
});

describe('parseDiff — countMismatch and stray lines', () => {
  // The two bare-hunk fixtures below are wrapped in a minimal file header
  // (diff --git / --- / +++) so the hunk-level fields (countMismatch,
  // newLineNumbers) are reachable through ParsedFile.hunks — a hunk with no
  // current file is numbered but "belongs to no file" (Contract) and is not
  // retained anywhere in ParsedDiff's return value. The wrapping does not
  // change the counting rules: they classify a line only by whether a hunk is
  // open and by the line's first character, never by the preceding headers.
  it('a hunk that reaches EOF still open gets countMismatch = true, keeping only the lines present', () => {
    const raw = ['diff --git a/f.ts b/f.ts', '--- a/f.ts', '+++ b/f.ts', '@@ -1,3 +1,4 @@', ' a', '+b'].join(
      '\n',
    );
    const parsed = parseDiff(raw);
    const hunk = parsed.files[0]!.hunks[0]!;
    expect(hunk.countMismatch).toBe(true);
    expect(hunk.newLineNumbers).toEqual([1, 2]);
  });

  it('the corrected marker fixture is well-formed: a "\\ No newline" marker does not affect the count', () => {
    // Test brief wrinkle: the brief's original example claimed a hunk of
    // "@@ -1,2 +1,2 @@\n a\n\\ No newline at end of file\n+b" was well-formed,
    // but that hunk is old=1/new=2 against a 2/2 header — actually short. Its
    // own correction is used here instead: "@@ -1 +1,2 @@\n a\n+b\n\\ No
    // newline at end of file", which is genuinely well-formed.
    const raw = [
      'diff --git a/f.ts b/f.ts',
      '--- a/f.ts',
      '+++ b/f.ts',
      '@@ -1 +1,2 @@',
      ' a',
      '+b',
      '\\ No newline at end of file',
    ].join('\n');
    const parsed = parseDiff(raw);
    const hunk = parsed.files[0]!.hunks[0]!;
    expect(hunk.countMismatch).toBe(false);
    expect(hunk.newLineNumbers).toEqual([1, 2]);
  });

  it('a line starting with +/-/space after a closed hunk is a stray line: no number, not counted, flags the previous hunk', () => {
    const raw = ['diff --git a/f.ts b/f.ts', '--- a/f.ts', '+++ b/f.ts', '@@ -1 +1 @@', ' a', '+x'].join(
      '\n',
    );
    const parsed = parseDiff(raw);
    const strayLine = parsed.lines[parsed.lines.length - 1]!;
    expect(strayLine.kind).toBe('stray');
    expect(strayLine.newLine).toBeNull();

    const file = parsed.files[0]!;
    expect(file.additions).toBe(0);
    expect(file.hunks[0]!.newLineNumbers).toEqual([1]);
    expect(file.hunks[0]!.countMismatch).toBe(true);
  });

  it('a header-less "@@" line with no preceding file yields no files at all', () => {
    const diff = parseUnifiedDiff('@@ -1 +1 @@\n a');
    expect(diff.files).toEqual([]);
  });

  it('a plain diff -u pair ("--- "/"+++ " with no "diff --git") still starts a file', () => {
    const raw = '--- a/p.ts\n+++ b/p.ts\n@@ -1 +1 @@\n-a\n+b';
    const diff = parseUnifiedDiff(raw);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('p.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers).toEqual([1]);
  });

  it('the empty string parses to no files', () => {
    expect(parseDiff('')).toMatchObject({ raw: '', files: [] });
  });
});

describe('sliceDiff — exact-path matching on the parsed fixture', () => {
  const diff = parseUnifiedDiff(GOLDEN_DIFF);

  it('slices only the named file, never a nested path with the same basename', () => {
    const slice = sliceDiff(diff, 'x.ts');
    const gitLines = slice.split('\n').filter((l) => l.startsWith('diff --git'));
    expect(gitLines).toEqual(['diff --git a/x.ts b/x.ts']);
    expect(slice).toContain('+b');
    expect(slice).not.toContain('+t');
  });

  it('slices a deleted file (still has content, just no new-side lines)', () => {
    expect(sliceDiff(diff, 'gone.ts')).toContain('-g1');
  });

  it('slices the C-quoted-path file by its decoded path', () => {
    expect(sliceDiff(diff, 'ф.ts')).toContain('+w');
  });
});

describe('groundFindings — a finding on a C-quoted path survives grounding', () => {
  it('keeps findings on both x.ts and ф.ts', () => {
    const diff = parseUnifiedDiff(GOLDEN_DIFF);
    const res = groundFindings(
      [
        {
          id: 'f1',
          severity: 'WARNING',
          category: 'bug',
          title: 't1',
          file: 'x.ts',
          start_line: 3,
          end_line: 3,
          rationale: 'r',
          confidence: 0.8,
        },
        {
          id: 'f2',
          severity: 'WARNING',
          category: 'bug',
          title: 't2',
          file: 'ф.ts',
          start_line: 2,
          end_line: 2,
          rationale: 'r',
          confidence: 0.8,
        },
      ],
      diff,
    );
    expect(res.kept.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
    expect(res.dropped).toHaveLength(0);
  });
});

/**
 * Regressions found in the second self-review round (plan-verifier reading
 * the parser's code, not its tests) and now fixed. Every expected value below
 * is taken from `specs/L03-diff-parser.md` § Contract (parser rules, path
 * rules) and the plan's WP2.tests step-3 invariant — never from running the
 * parser and reading back its own output.
 */
describe('parseDiff — C-4: "+++ "/"--- " after a closed hunk are stray, not headers', () => {
  it('a stray "+++ x" after a closed hunk does not overwrite the file path', () => {
    const raw = 'diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n a\n+++ x\n';
    const parsed = parseDiff(raw);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe('f.ts');
    expect(parsed.files[0]!.additions).toBe(0);

    const strayLine = parsed.lines.find((l) => l.text === '+++ x')!;
    expect(strayLine.kind).toBe('stray');
    expect(strayLine.newLine).toBeNull();
    expect(parsed.files[0]!.hunks[0]!.countMismatch).toBe(true);
  });

  it('a trailing "--- x" not followed by "+++ " after a closed hunk is stray too', () => {
    const raw = 'diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n a\n--- x\n';
    const parsed = parseDiff(raw);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe('f.ts');
    expect(parsed.files[0]!.additions).toBe(0);

    const strayLine = parsed.lines.find((l) => l.text === '--- x')!;
    expect(strayLine.kind).toBe('stray');
    expect(strayLine.newLine).toBeNull();
    expect(parsed.files[0]!.hunks[0]!.countMismatch).toBe(true);
  });

  it('counter-case: "--- " directly followed by "+++ " after a closed hunk still starts a new file (plain diff -u, two files)', () => {
    const raw =
      '--- a/one.ts\n+++ b/one.ts\n@@ -1 +1 @@\n-a\n+b\n--- a/two.ts\n+++ b/two.ts\n@@ -1 +1 @@\n-c\n+d\n';
    const diff = parseUnifiedDiff(raw);
    expect(diff.files.map((f) => f.path).sort()).toEqual(['one.ts', 'two.ts']);
    const two = diff.files.find((f) => f.path === 'two.ts')!;
    expect(two.hunks[0]!.newLineNumbers).toEqual([1]);
  });

  it('a "\\" line directly after a hunk closes is a marker; one that is not is meta', () => {
    // The second file's line ('+++ x') is itself a stray line right after the
    // first hunk closes, so by the time the backslash line is reached it is
    // NOT directly after a hunk close — it must be classified as plain meta,
    // not marker, even though it starts with "\".
    const raw =
      'diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n a\n\\ No newline at end of file\ndiff --git a/g.ts b/g.ts\n--- a/g.ts\n+++ b/g.ts\n@@ -1 +1 @@\n a\n+++ x\n\\ trailer\n';
    const parsed = parseDiff(raw);
    const markerLine = parsed.lines.find((l) => l.text === '\\ No newline at end of file')!;
    expect(markerLine.kind).toBe('marker');

    const metaLine = parsed.lines.find((l) => l.text === '\\ trailer')!;
    expect(metaLine.kind).toBe('meta');
  });
});

describe('parseUnifiedDiff — C-5: an unescaped non-ASCII character next to a C-escape decodes as UTF-8, not a truncated byte', () => {
  it('a raw Cyrillic character sitting right next to an escaped quote', () => {
    const raw = [
      'diff --git a/x b/x',
      '--- "a/ф\\"q.ts"',
      '+++ "b/ф\\"q.ts"',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('ф"q.ts');
  });

  it('a 4-byte code point (emoji, a UTF-16 surrogate pair) sitting right next to an escaped quote', () => {
    const raw = [
      'diff --git a/x b/x',
      '--- "a/😀\\"x.ts"',
      '+++ "b/😀\\"x.ts"',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('😀"x.ts');
  });
});

describe('sliceDiff — WP2 step-3 invariant: numberDiff(sliceDiff(d, path)) === the chunk the engine renders', () => {
  // A non-last file whose own last line is a real, empty CONTEXT line — not
  // the artifact `raw.split('\n')` produces from a trailing "\n". `sliceDiff`
  // must not let that empty line be swallowed on re-parse (F3).
  const raw =
    'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-x\n+y\n\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-p\n+q\n';
  const d = parseUnifiedDiff(raw);

  it('the trailing empty context line of a.ts survives the slice/re-parse round trip', () => {
    const chunk = numberDiff(sliceDiff(d, 'a.ts'));
    expect(chunk).toContain('     2 ');
  });

  it('numberDiff(sliceDiff(d, path)) is byte-identical to rendering the file block out of one whole-diff parse', () => {
    const wholeParse = parseDiff(raw);
    for (const pf of wholeParse.files) {
      const fromWholeParse = renderNumberedLines(wholeParse.lines.slice(pf.start, pf.end));
      const fromSlice = numberDiff(sliceDiff(d, pf.path));
      expect(fromSlice).toBe(fromWholeParse);
    }
  });

  it('the same equality holds for every file of the WP1 golden fixture', () => {
    const golden = parseUnifiedDiff(GOLDEN_DIFF);
    const wholeParse = parseDiff(GOLDEN_DIFF);
    for (const pf of wholeParse.files) {
      const fromWholeParse = renderNumberedLines(wholeParse.lines.slice(pf.start, pf.end));
      const fromSlice = numberDiff(sliceDiff(golden, pf.path));
      expect(fromSlice).toBe(fromWholeParse);
    }
  });
});
