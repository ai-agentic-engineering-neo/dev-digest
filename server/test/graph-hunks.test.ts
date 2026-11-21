import { describe, expect, it } from 'vitest';
import { parsePatchRanges, rangesIntersect } from '../src/modules/repo-intel/graph/hunks.js';

describe('parsePatchRanges', () => {
  it('returns empty ranges for a missing patch', () => {
    expect(parsePatchRanges(undefined)).toEqual({ removed: [], added: [] });
    expect(parsePatchRanges(null)).toEqual({ removed: [], added: [] });
    expect(parsePatchRanges('')).toEqual({ removed: [], added: [] });
  });

  it('maps a replacement to a removed (old coords) and an added (new coords) range', () => {
    const patch = '--- a/x.ts\n+++ b/x.ts\n@@ -6 +6 @@ fn\n-  return text.trim();\n+  return text.trim().toLowerCase();\n';
    expect(parsePatchRanges(patch)).toEqual({ removed: [{ start: 6, end: 6 }], added: [{ start: 6, end: 6 }] });
  });

  it('excludes the context lines GitHub wraps around a change and keeps old/new coordinates apart', () => {
    const patch = ['@@ -10,7 +10,8 @@', ' a', ' b', ' c', '-old1', '-old2', '+new1', '+new2', '+new3', ' d', ' e', ' f'].join('\n');
    expect(parsePatchRanges(patch)).toEqual({
      removed: [{ start: 13, end: 14 }],
      added: [{ start: 13, end: 15 }],
    });
  });

  it('a pure deletion yields only a removed range, a pure addition only an added one', () => {
    expect(parsePatchRanges('@@ -4,4 +3,0 @@\n-\n-export function a() {\n-  return 1;\n-}\n')).toEqual({
      removed: [{ start: 4, end: 7 }],
      added: [],
    });
    expect(parsePatchRanges('@@ -8,0 +9,2 @@\n+\n+export const x = 1;\n')).toEqual({ removed: [], added: [{ start: 9, end: 10 }] });
  });

  it('handles several hunks and the "no newline" marker', () => {
    const patch = ['@@ -1,2 +1,2 @@', '-a', '+b', ' c', '@@ -20 +20,2 @@', '-x', '+y', '+z', '\\ No newline at end of file'].join('\n');
    expect(parsePatchRanges(patch)).toEqual({
      removed: [{ start: 1, end: 1 }, { start: 20, end: 20 }],
      added: [{ start: 1, end: 1 }, { start: 20, end: 21 }],
    });
  });

  it('rangesIntersect is inclusive on both ends', () => {
    expect(rangesIntersect({ start: 1, end: 3 }, { start: 3, end: 5 })).toBe(true);
    expect(rangesIntersect({ start: 1, end: 3 }, { start: 4, end: 5 })).toBe(false);
  });
});
