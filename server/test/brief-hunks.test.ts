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

  it('an empty string patch → zero ranges (same falsy path as null)', () => {
    expect(hunkRangesFor('')).toEqual([]);
  });

  it('a header line at the very start of the patch, with no preceding text, still parses', () => {
    const patch = '@@ -1,1 +1,1 @@\n-a\n+b';
    expect(hunkRangesFor(patch)).toEqual([{ start: 1, end: 1 }]);
  });

  it('a header line as the last line of the patch, with no trailing newline, still parses', () => {
    const patch = 'diff --git a/x b/x\n@@ -5,2 +7,2 @@';
    expect(hunkRangesFor(patch)).toEqual([{ start: 7, end: 8 }]);
  });

  describe('malformed headers — none of these match, so they contribute zero ranges', () => {
    it('missing the "+" (new-file) half entirely', () => {
      expect(hunkRangesFor('@@ -1,2 @@\n context')).toEqual([]);
    });

    it('missing both count numbers and the leading "@@"', () => {
      expect(hunkRangesFor('-1,2 +1,2 @@\n context')).toEqual([]);
    });

    it('missing the closing "@@"', () => {
      expect(hunkRangesFor('@@ -1,2 +1,2\n context')).toEqual([]);
    });

    it('a "@@" that appears mid-line, not at line start, is not a header', () => {
      expect(hunkRangesFor('some text @@ -1,2 +1,2 @@ trailing')).toEqual([]);
    });

    it('non-numeric counts', () => {
      expect(hunkRangesFor('@@ -a,b +c,d @@\n context')).toEqual([]);
    });

    it('a well-formed header elsewhere in the same malformed patch is still found', () => {
      const patch = ['@@ -1,2 @@', ' junk', '@@ -10,1 +12,1 @@', '+real'].join('\n');
      expect(hunkRangesFor(patch)).toEqual([{ start: 12, end: 12 }]);
    });
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
