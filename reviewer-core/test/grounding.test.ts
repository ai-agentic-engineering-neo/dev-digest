import { describe, it, expect } from 'vitest';
import type { DiffHunk, Finding, UnifiedDiff } from '@devdigest/shared';
import { buildLineIndex, groundFindings, groundingSummary } from '../src/grounding.js';

/**
 * Spec for src/grounding.ts — the citation-grounding gate.
 *
 * Rules pinned here:
 * - A finding whose `file` is not a diff file path (exact string match, no
 *   normalisation) is dropped.
 * - Full-file kinds (secret_leak, lethal_trifecta, phantom, hook) only need the file.
 * - Every other finding (kind 'finding', null or absent) is kept iff
 *   [start_line, end_line] (order-insensitive, inclusive) hits a new-side line
 *   covered by a hunk of that file.
 * - Covered lines = hunk.newLineNumbers; the server's diff parser puts ADDED and
 *   CONTEXT lines there and never DELETED lines (they have no new-side number).
 * - If newLineNumbers is empty, the declared range newStart..newStart+max(newLines,1)-1
 *   is used instead.
 */

function hunk(newStart: number, newLines: number, newLineNumbers: number[], file = 'src/a.ts'): DiffHunk {
  return { file, oldStart: newStart, oldLines: newLines, newStart, newLines, newLineNumbers };
}

/**
 * Hand-built equivalent of what server/src/adapters/git/diff-parser.ts produces for
 *
 *   @@ -10,4 +10,4 @@
 *    ctx            ← new line 10 (context)
 *   -gone           ← deleted, old line 11, no new-side number
 *   +added1         ← new line 11
 *   +added2         ← new line 12
 *    ctx            ← new line 13 (context)
 *   @@ -40,1 +40,1 @@
 *   +only           ← new line 40
 */
const diff: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/a.ts',
      additions: 3,
      deletions: 1,
      hunks: [hunk(10, 4, [10, 11, 12, 13]), hunk(40, 1, [40])],
    },
    { path: 'src/deleted-only.ts', additions: 0, deletions: 2, hunks: [] },
  ],
};

let seq = 0;
function finding(over: Partial<Finding> = {}): Finding {
  seq += 1;
  return {
    id: `f-${seq}`,
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/a.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'r',
    confidence: 0.9,
    ...over,
  } as Finding;
}

type Case = [name: string, over: Partial<Finding>, kept: boolean];

describe('groundFindings — line-anchored findings', () => {
  it.each<Case>([
    ['added line inside a hunk → kept', { start_line: 11, end_line: 11 }, true],
    ['context line inside a hunk → kept', { start_line: 10, end_line: 10 }, true],
    ['trailing context line of a hunk → kept', { start_line: 13, end_line: 13 }, true],
    ['line just past the hunk → dropped', { start_line: 14, end_line: 14 }, false],
    ['line just before the hunk → dropped', { start_line: 9, end_line: 9 }, false],
    ['line between two hunks → dropped', { start_line: 25, end_line: 25 }, false],
    ['second hunk line → kept', { start_line: 40, end_line: 40 }, true],
    ['line far beyond any hunk → dropped', { start_line: 999, end_line: 999 }, false],
    ['range fully inside a hunk → kept', { start_line: 11, end_line: 12 }, true],
    ['range overlapping only the hunk start → kept', { start_line: 5, end_line: 10 }, true],
    ['range overlapping only the hunk end → kept', { start_line: 13, end_line: 20 }, true],
    ['range spanning the gap and touching hunk 2 → kept', { start_line: 20, end_line: 40 }, true],
    ['range entirely in the gap between hunks → dropped', { start_line: 14, end_line: 39 }, false],
    ['range wrapping a whole hunk → kept', { start_line: 1, end_line: 100 }, true],
    ['reversed range (end < start) is normalised → kept', { start_line: 12, end_line: 8 }, true],
    ['reversed range outside hunks → dropped', { start_line: 30, end_line: 20 }, false],
    ['line 0 → dropped', { start_line: 0, end_line: 0 }, false],
    ["kind 'finding' is line-anchored → dropped outside hunks", { kind: 'finding', start_line: 25, end_line: 25 }, false],
    ['kind null is line-anchored → dropped outside hunks', { kind: null, start_line: 25, end_line: 25 }, false],
  ])('%s', (_name, over, kept) => {
    const f = finding(over);
    const r = groundFindings([f], diff);
    expect(r.kept).toEqual(kept ? [f] : []);
    expect(r.dropped.map((d) => d.finding)).toEqual(kept ? [] : [f]);
  });

  it('deleted lines are not indexed: only added + context new-side lines are covered', () => {
    // The "-gone" line was old line 11; old 11 is not addressable on the new side.
    // A finding at new line 11 lands on "+added1" (kept); nothing distinguishes the two.
    const idx = buildLineIndex(diff).get('src/a.ts')!;
    expect([...idx].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 40]);
  });
});

describe('groundFindings — file matching (no path normalisation)', () => {
  it.each<Case>([
    ['exact path → kept', { file: 'src/a.ts' }, true],
    ['file not in diff → dropped', { file: 'src/other.ts' }, false],
    ['leading "./" is not stripped → dropped', { file: './src/a.ts' }, false],
    ['leading "/" is not stripped → dropped', { file: '/src/a.ts' }, false],
    ['"b/" git prefix is not stripped → dropped', { file: 'b/src/a.ts' }, false],
    ['matching is case-sensitive → dropped', { file: 'src/A.ts' }, false],
    ['basename only → dropped', { file: 'a.ts' }, false],
    ['file present but with no hunks → dropped', { file: 'src/deleted-only.ts', start_line: 1, end_line: 1 }, false],
  ])('%s', (_name, over, kept) => {
    expect(groundFindings([finding(over)], diff).kept).toHaveLength(kept ? 1 : 0);
  });
});

describe('groundFindings — full-file kinds only need the file in the diff', () => {
  it.each<[Finding['kind'], string, boolean]>([
    ['secret_leak', 'src/a.ts', true],
    ['lethal_trifecta', 'src/a.ts', true],
    ['phantom', 'src/a.ts', true],
    ['hook', 'src/a.ts', true],
    ['secret_leak', 'src/deleted-only.ts', true],
    ['secret_leak', 'src/other.ts', false],
    ['hook', './src/a.ts', false],
  ])("kind %s on '%s' (line 999) → kept=%s", (kind, file, kept) => {
    const r = groundFindings([finding({ kind, file, start_line: 999, end_line: 999 })], diff);
    expect(r.kept).toHaveLength(kept ? 1 : 0);
  });
});

describe('groundFindings — drop reasons and bookkeeping', () => {
  it.each<[string, Partial<Finding>, string]>([
    ['missing file', { file: 'src/other.ts' }, "file 'src/other.ts' not present in diff"],
    ['missing lines', { start_line: 25, end_line: 26 }, "lines 25-26 do not intersect any diff hunk in 'src/a.ts'"],
  ])('reason for %s', (_name, over, reason) => {
    expect(groundFindings([finding(over)], diff).dropped[0]?.reason).toBe(reason);
  });

  it('partitions a mixed batch, preserving input order within kept and dropped', () => {
    const a = finding({ start_line: 11, end_line: 11 });
    const b = finding({ start_line: 25, end_line: 25 });
    const c = finding({ kind: 'hook', start_line: 999, end_line: 999 });
    const d = finding({ file: 'nope.ts' });
    const r = groundFindings([a, b, c, d], diff);
    expect(r.kept).toEqual([a, c]);
    expect(r.dropped.map((x) => x.finding)).toEqual([b, d]);
  });

  it('does not mutate or dedupe findings', () => {
    const a = finding();
    const r = groundFindings([a, a], diff);
    expect(r.kept).toEqual([a, a]);
    expect(r.kept[0]).toBe(a);
  });

  it('empty findings → nothing kept or dropped', () => {
    expect(groundFindings([], diff)).toEqual({ kept: [], dropped: [] });
  });

  it('empty diff → every finding dropped, even full-file kinds', () => {
    const r = groundFindings([finding(), finding({ kind: 'secret_leak' })], { raw: '', files: [] });
    expect(r.kept).toEqual([]);
    expect(r.dropped).toHaveLength(2);
  });
});

describe('buildLineIndex — covered new-side lines per file', () => {
  it.each<[string, DiffHunk[], number[]]>([
    ['uses newLineNumbers verbatim when present', [hunk(10, 4, [10, 11, 13])], [10, 11, 13]],
    ['falls back to newStart..newStart+newLines-1 when newLineNumbers is empty', [hunk(5, 3, [])], [5, 6, 7]],
    ['fallback with newLines 0 still covers newStart (max(newLines, 1))', [hunk(8, 0, [])], [8]],
    ['merges several hunks of one file', [hunk(1, 1, [1]), hunk(20, 2, [])], [1, 20, 21]],
    ['no hunks → empty set', [], []],
  ])('%s', (_name, hunks, expected) => {
    const idx = buildLineIndex({ raw: '', files: [{ path: 'f.ts', additions: 0, deletions: 0, hunks }] });
    expect([...idx.get('f.ts')!].sort((a, b) => a - b)).toEqual(expected);
  });

  it('pure-deletion hunk via fallback (newLines 0) grounds the line at newStart', () => {
    // Parser output for "@@ -5,2 +4,0 @@" with only "-" lines: newLineNumbers [], newLines 0.
    const d: UnifiedDiff = { raw: '', files: [{ path: 'f.ts', additions: 0, deletions: 2, hunks: [hunk(4, 0, [])] }] };
    expect(groundFindings([finding({ file: 'f.ts', start_line: 4, end_line: 4 })], d).kept).toHaveLength(1);
  });

  it('same path listed twice: the later entry overwrites the earlier line set', () => {
    const d: UnifiedDiff = {
      raw: '',
      files: [
        { path: 'f.ts', additions: 1, deletions: 0, hunks: [hunk(1, 1, [1])] },
        { path: 'f.ts', additions: 1, deletions: 0, hunks: [hunk(50, 1, [50])] },
      ],
    };
    expect([...buildLineIndex(d).get('f.ts')!]).toEqual([50]);
    expect(groundFindings([finding({ file: 'f.ts', start_line: 1, end_line: 1 })], d).kept).toHaveLength(0);
  });
});

describe('groundingSummary', () => {
  it.each<[number, number, string]>([
    [0, 0, '0/0 passed'],
    [3, 0, '3/3 passed'],
    [2, 1, '2/3 passed'],
    [0, 4, '0/4 passed'],
  ])('%i kept + %i dropped → "%s"', (k, d, expected) => {
    const result = {
      kept: Array.from({ length: k }, () => finding()),
      dropped: Array.from({ length: d }, () => ({ finding: finding(), reason: 'x' })),
    };
    expect(groundingSummary(result)).toBe(expected);
  });
});
