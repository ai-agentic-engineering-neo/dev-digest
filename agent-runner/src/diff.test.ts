import { describe, it, expect } from 'vitest';
import { buildLineIndex, numberDiffLines } from '@devdigest/reviewer-core';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';

/**
 * Sanity test for the self-authored unified-diff parser (agent-runner cannot
 * import the server's `git/diff-parser.ts` — outside owned paths and would
 * break the ncc bundle's self-containment). Must produce the exact
 * `UnifiedDiff`/`DiffHunk` shape the citation-grounding gate needs: per-file
 * hunks with the set of new-side line numbers they cover.
 */
export const FIXTURE_DIFF_RAW = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -9,3 +9,4 @@
 host: 'localhost',
+apiKey: 'sk_live_abcdef123456',
 port: 3000,
 timeout: 30,
`;

describe('parseUnifiedDiff', () => {
  it('parses a single-file, single-hunk diff into files + hunks + new-side line numbers', () => {
    const diff = parseUnifiedDiff(FIXTURE_DIFF_RAW);

    expect(diff.raw).toBe(FIXTURE_DIFF_RAW);
    expect(diff.files).toHaveLength(1);
    const file = diff.files[0]!;
    expect(file.path).toBe('src/config.ts');
    expect(file.additions).toBe(1);
    expect(file.deletions).toBe(0);
    expect(file.hunks).toHaveLength(1);

    const hunk = file.hunks[0]!;
    expect(hunk.oldStart).toBe(9);
    expect(hunk.oldLines).toBe(3);
    expect(hunk.newStart).toBe(9);
    expect(hunk.newLines).toBe(4);
    // context(9), added(10), context(11), context(12)
    expect(hunk.newLineNumbers).toEqual([9, 10, 11, 12]);
  });

  it('a line NOT covered by any hunk (e.g. 999) is absent from new-side line numbers', () => {
    const diff = parseUnifiedDiff(FIXTURE_DIFF_RAW);
    const covered = new Set(diff.files[0]!.hunks.flatMap((h) => h.newLineNumbers));
    expect(covered.has(999)).toBe(false);
  });

  it('handles multiple files', () => {
    const raw = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,2 @@
 line one
+line two
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -5,2 +5,2 @@
-old line
+new line
 unchanged
`;
    const diff = parseUnifiedDiff(raw);
    expect(diff.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(diff.files[1]!.deletions).toBe(1);
    expect(diff.files[1]!.additions).toBe(1);
  });
});

describe('stripIgnoredFiles', () => {
  const raw = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,1 +1,2 @@
 keep me
+real change
diff --git a/.devdigest/runner/index.js b/.devdigest/runner/index.js
--- a/.devdigest/runner/index.js
+++ b/.devdigest/runner/index.js
@@ -1,1 +1,1 @@
-old bundle
+new bundle
diff --git a/.github/workflows/devdigest-review.yml b/.github/workflows/devdigest-review.yml
--- a/.github/workflows/devdigest-review.yml
+++ b/.github/workflows/devdigest-review.yml
@@ -1,1 +1,2 @@
 name: DevDigest Review
+on: pull_request
`;

  it('drops the .devdigest/ runner bundle (the source of the GitHub 422)', () => {
    const files = parseUnifiedDiff(stripIgnoredFiles(raw)).files.map((f) => f.path);
    expect(files).not.toContain('.devdigest/runner/index.js');
  });

  it('drops the generated .github/workflows/ file', () => {
    const files = parseUnifiedDiff(stripIgnoredFiles(raw)).files.map((f) => f.path);
    expect(files).not.toContain('.github/workflows/devdigest-review.yml');
  });

  it('keeps the target repo files untouched', () => {
    const diff = parseUnifiedDiff(stripIgnoredFiles(raw));
    expect(diff.files.map((f) => f.path)).toEqual(['src/config.ts']);
    expect(diff.files[0]!.additions).toBe(1);
    // the kept section's content survives verbatim
    expect(diff.raw).toContain('+real change');
    expect(diff.raw).not.toContain('new bundle');
  });

  it('is a no-op when nothing is ignored', () => {
    expect(stripIgnoredFiles(FIXTURE_DIFF_RAW)).toBe(FIXTURE_DIFF_RAW);
  });
});

/**
 * The prompt advertises line numbers (`numberDiffLines`, reviewer-core) and the
 * citation gate then judges the numbers the model cites (`buildLineIndex`). Those two
 * derive the numbering independently — reviewer-core is a pure engine and cannot
 * import this package's parser — so a drift in either line-classification rule would
 * silently make the prompt promise citations the gate rejects. This test is the
 * mechanical link between them: every number the renderer prints must be a number the
 * gate accepts, and every line the gate covers must be printed with that same number.
 */
describe('numberDiffLines ↔ buildLineIndex', () => {
  const MIXED_DIFF_RAW = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -9,3 +9,4 @@
 host: 'localhost',
-apiKey: 'old',
+apiKey: 'sk_live_abcdef123456',
 port: 3000,
@@ -40,2 +41,2 @@
 timeout: 30,
+retries: 3,
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+one
+two
+three
`;

  /** A hunk whose lines are ALL deletions has no new-side line to number. */
  const DELETION_ONLY_RAW = `diff --git a/src/gone.ts b/src/gone.ts
--- a/src/gone.ts
+++ b/src/gone.ts
@@ -5,3 +4,0 @@
-one
-two
-three
`;

  /** The `\\ No newline at end of file` marker is not a source line, but both
   *  sides must still agree on whether it consumes a number. */
  const NO_NEWLINE_RAW = `diff --git a/src/eof.ts b/src/eof.ts
--- a/src/eof.ts
+++ b/src/eof.ts
@@ -1,2 +1,2 @@
 keep
-old
+new
\\ No newline at end of file
`;

  /** Every `<number> <rest>` the renderer emitted, as {path, line} pairs. The rest of
   *  the line is deliberately unconstrained — a marker line (`\\ …`) is numbered too. */
  function renderedNumbers(raw: string): { path: string; line: number }[] {
    const out: { path: string; line: number }[] = [];
    let path = '';
    for (const line of numberDiffLines(raw).split('\n')) {
      const file = line.match(/^diff --git a\/.* b\/(.*)$/);
      if (file) {
        path = file[1]!;
        continue;
      }
      const numbered = line.match(/^ *(\d+) /);
      if (numbered) out.push({ path, line: Number(numbered[1]) });
    }
    return out;
  }

  /** The new-side lines that really exist, straight from the parser — NOT via
   *  `buildLineIndex`, which additionally expands a hunk with no new-side lines to its
   *  declared range (leniency the renderer cannot mirror: there is no line to print). */
  function parsedNewLines(raw: string): Set<string> {
    const out = new Set<string>();
    for (const f of parseUnifiedDiff(raw).files)
      for (const h of f.hunks) for (const n of h.newLineNumbers) out.add(`${f.path}:${n}`);
    return out;
  }

  const CASES: [string, string][] = [
    ['a mixed add/remove/context diff', MIXED_DIFF_RAW],
    ['a deletion-only hunk', DELETION_ONLY_RAW],
    ['a hunk ending in the no-newline marker', NO_NEWLINE_RAW],
  ];

  it.each(CASES)('%s: every rendered number is one the gate accepts', (_name, raw) => {
    const index = buildLineIndex(parseUnifiedDiff(raw));
    for (const { path, line } of renderedNumbers(raw)) {
      expect(index.get(path)?.has(line), `${path}:${line} rendered but not grounded`).toBe(true);
    }
  });

  it.each(CASES)('%s: every real new-side line is rendered with that number', (_name, raw) => {
    const rendered = new Set(renderedNumbers(raw).map((r) => `${r.path}:${r.line}`));
    for (const key of parsedNewLines(raw)) {
      expect(rendered.has(key), `${key} parsed but not rendered`).toBe(true);
    }
    // …and nothing extra: the renderer must not invent a line the parser never saw.
    expect(rendered).toEqual(parsedNewLines(raw));
  });

  it('renders nothing numbered for a deletion-only hunk, though the gate still covers its declared range', () => {
    expect(renderedNumbers(DELETION_ONLY_RAW)).toEqual([]);
    // Pre-existing `buildLineIndex` leniency, pinned here so the asymmetry is deliberate
    // rather than a surprise the next person debugs from a failing cross-check.
    expect([...(buildLineIndex(parseUnifiedDiff(DELETION_ONLY_RAW)).get('src/gone.ts') ?? [])]).toEqual([4]);
  });

  it('agrees with the gate on a whole-file addition, where every line is one hunk', () => {
    const body = Array.from({ length: 300 }, (_, i) => `+line ${i + 1}`).join('\n');
    const raw = `diff --git a/src/big.ts b/src/big.ts\n--- /dev/null\n+++ b/src/big.ts\n@@ -0,0 +1,300 @@\n${body}\n`;
    const index = buildLineIndex(parseUnifiedDiff(raw));
    const rendered = renderedNumbers(raw);

    expect(rendered).toHaveLength(300);
    // The 300th body line really is line 300 — the counting drift this rendering exists
    // to remove would show up here as an off-by-N.
    expect(rendered[299]).toEqual({ path: 'src/big.ts', line: 300 });
    expect(numberDiffLines(raw)).toContain('300 +line 300');
    for (const { path, line } of rendered) expect(index.get(path)?.has(line)).toBe(true);
  });
});
