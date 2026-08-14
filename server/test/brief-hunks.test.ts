import { describe, it, expect } from 'vitest';
import { hunkRangesFor, lineInRanges } from '../src/modules/brief/hunks.js';

/**
 * plans/11-why-risk-brief.md Q2 — hunk-range extraction. AC-2/N2: never reads
 * a hunk BODY line, only `@@ ... @@` header lines.
 */

describe('hunkRangesFor', () => {
  it('null patch → zero ranges (Q2: the seeded PR #482 case)', () => {
    expect(hunkRangesFor(null)).toEqual([]);
  });

  it('a header-less string → zero ranges', () => {
    expect(hunkRangesFor('+just some body text\n-and more')).toEqual([]);
  });

  it('parses a single multi-line hunk header', () => {
    const patch = '@@ -10,3 +12,5 @@\n context\n+added\n+added\n context';
    expect(hunkRangesFor(patch)).toEqual([{ start: 12, end: 16 }]);
  });

  it('a header with no new-count defaults to exactly 1 line', () => {
    const patch = '@@ -1 +1 @@\n-old\n+new';
    expect(hunkRangesFor(patch)).toEqual([{ start: 1, end: 1 }]);
  });

  it('multiple hunks in one patch — one range each, in order', () => {
    const patch = ['@@ -1,2 +1,2 @@', ' a', ' b', '@@ -50,1 +52,3 @@', '+c', '+d', '+e'].join('\n');
    expect(hunkRangesFor(patch)).toEqual([
      { start: 1, end: 2 },
      { start: 52, end: 54 },
    ]);
  });

  it('AC-2/N2: a unique sentinel string in the hunk BODY never appears in an extracted range', () => {
    const sentinel = 'SENTINEL_LINE_5551234';
    const patch = `@@ -1,2 +1,2 @@\n-old\n+${sentinel}`;
    const ranges = hunkRangesFor(patch);
    expect(ranges).toEqual([{ start: 1, end: 2 }]);
    expect(JSON.stringify(ranges)).not.toContain(sentinel);
  });
});

describe('lineInRanges', () => {
  const ranges = [
    { start: 10, end: 12 },
    { start: 40, end: 40 },
  ];

  it('a line inside a range is true', () => {
    expect(lineInRanges(11, ranges)).toBe(true);
    expect(lineInRanges(40, ranges)).toBe(true);
  });

  it('a line outside every range is false', () => {
    expect(lineInRanges(9, ranges)).toBe(false);
    expect(lineInRanges(13, ranges)).toBe(false);
    expect(lineInRanges(41, ranges)).toBe(false);
  });

  it('an empty range list is always false', () => {
    expect(lineInRanges(1, [])).toBe(false);
  });
});
