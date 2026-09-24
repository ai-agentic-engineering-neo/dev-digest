/**
 * sliceDiff — per-file slice of the raw unified diff for map chunks. Pins
 * exact path matching (src/a.ts must not also capture src/a.tsx), renames,
 * deletions and the hunk-based fallback.
 */
import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { sliceDiff } from '../src/index.js';

const A_TS = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,1 +1,2 @@',
  ' const a = 1;',
  '+const b = 2;',
].join('\n');
const A_TSX = [
  'diff --git a/src/a.tsx b/src/a.tsx',
  '--- a/src/a.tsx',
  '+++ b/src/a.tsx',
  '@@ -1 +1 @@',
  '-old tsx',
  '+new tsx',
].join('\n');
const RENAME = [
  'diff --git a/src/old.ts b/src/new.ts',
  'similarity index 90%',
  'rename from src/old.ts',
  'rename to src/new.ts',
  '@@ -3 +3 @@',
  '-x',
  '+y',
].join('\n');
const DELETE = [
  'diff --git a/src/gone.ts b/src/gone.ts',
  'deleted file mode 100644',
  '--- a/src/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-line1',
  '-line2',
].join('\n');

function mkDiff(raw: string, files: UnifiedDiff['files'] = []): UnifiedDiff {
  return { raw, files };
}

describe('sliceDiff', () => {
  const full = mkDiff([A_TSX, A_TS, RENAME, DELETE].join('\n'));

  it('matches the exact path — src/a.ts does not capture src/a.tsx', () => {
    expect(sliceDiff(full, 'src/a.ts')).toBe(A_TS);
    expect(sliceDiff(full, 'src/a.tsx')).toBe(A_TSX);
  });

  it('slices a renamed file by its new (b/) path', () => {
    expect(sliceDiff(full, 'src/new.ts')).toBe(RENAME);
  });

  it('slices a renamed file by its old (a/) path as a fallback', () => {
    expect(sliceDiff(full, 'src/old.ts')).toBe(RENAME);
  });

  it('slices a deleted file', () => {
    expect(sliceDiff(full, 'src/gone.ts')).toBe(DELETE);
  });

  it('handles quoted paths with spaces', () => {
    const q = 'diff --git "a/my dir/f.ts" "b/my dir/f.ts"\n@@ -1 +1 @@\n-a\n+b';
    expect(sliceDiff(mkDiff(`${A_TS}\n${q}`), 'my dir/f.ts')).toBe(q);
  });

  it('rebuilds hunk headers from diff.files when the raw diff lacks the file', () => {
    const d = mkDiff(A_TS, [
      {
        path: 'src/z.ts',
        additions: 2,
        deletions: 1,
        hunks: [
          { file: 'src/z.ts', oldStart: 4, oldLines: 1, newStart: 4, newLines: 2, newLineNumbers: [4, 5] },
        ],
      },
    ]);
    const out = sliceDiff(d, 'src/z.ts');
    expect(out).toContain('diff --git a/src/z.ts b/src/z.ts');
    expect(out).toContain('@@ -4,1 +4,2 @@');
    expect(out).not.toContain('src/a.ts');
  });

  it('returns the whole raw diff when the file is unknown', () => {
    expect(sliceDiff(full, 'nope.ts')).toBe(full.raw);
  });
});
