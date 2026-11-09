import { describe, it, expect } from 'vitest';
import { newSideRanges, parseFileRef, parseHunkRanges, snapLine } from '../src/modules/brief/domain/hunks.js';

describe('parseHunkRanges', () => {
  it('keeps only the header, never the code after the second @@', () => {
    const hunks = parseHunkRanges("@@ -38,9 +40,13 @@ function pay() {\n+const k = 'sk_live_x'");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.header).toBe('@@ -38,9 +40,13 @@');
    expect(hunks[0]?.header).not.toContain('function pay');
    expect(newSideRanges(hunks)).toEqual([{ start: 40, end: 52 }]);
  });
  it('treats an omitted count as 1', () => {
    const [h] = parseHunkRanges('@@ -1 +1 @@');
    expect(h).toMatchObject({ oldLines: 1, newLines: 1 });
  });
  it('has no new-side range for a deleted file', () => {
    expect(newSideRanges(parseHunkRanges('@@ -1,10 +0,0 @@'))).toEqual([]);
  });
  it('returns [] for null / empty', () => {
    expect(parseHunkRanges(null)).toEqual([]);
    expect(parseHunkRanges('')).toEqual([]);
  });
});

describe('snapLine', () => {
  const ranges = [
    { start: 10, end: 14 },
    { start: 30, end: 31 },
  ];
  it.each([
    [12, 12],
    [20, 10],
    [22, 10],
    [40, 30],
    [0, 10],
  ])('line %i -> %i', (line, expected) => {
    expect(snapLine(line, ranges)).toEqual({ line: expected, fileLevel: false });
  });
  it('is file-level without ranges', () => {
    expect(snapLine(5, [])).toEqual({ line: 1, fileLevel: true });
  });
});

describe('parseFileRef', () => {
  it.each([
    ['src/a.ts:12-18', { path: 'src/a.ts', start: 12, end: 18 }],
    ['src/a.ts:12', { path: 'src/a.ts', start: 12, end: null }],
    [' src/a.ts ', { path: 'src/a.ts', start: null, end: null }],
    ['src/a.ts:0', { path: 'src/a.ts', start: null, end: null }],
  ])('%s', (ref, expected) => {
    expect(parseFileRef(ref)).toEqual(expected);
  });
});
