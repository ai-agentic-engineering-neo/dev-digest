import { describe, it, expect } from 'vitest';
import { numberDiff } from '../src/index.js';

/**
 * numberDiff — prints each diff line's new-file line number in a fixed 6-column
 * + space gutter (blank = 7 spaces), so the model can cite a real line instead
 * of counting down from the `@@` header (spec: L03-numbered-diff.md § Contract).
 * Oracles come straight from that table + the PR #5 worked example.
 */

const B = ' '.repeat(7); // blank gutter
const G = (n: number) => String(n).padStart(6) + ' '; // numbered gutter, e.g. G(445) === '   445 '

describe('numberDiff', () => {
  it('AC-1: PR #5 hunk — blank on the context line above, numbered on the added line', () => {
    const raw = [
      '@@ -443,6 +443,8 @@ export class EventsMapComponent',
      '      */',
      '     private eventNamesMapping: EventNamesMap | null = null;',
      ' ',
      "+    private gmapApiKey = 'PLACEHOLDER'; // test issue 1",
      '+',
      '     get eventsSearchControl() {',
    ].join('\n');

    const out = numberDiff(raw).split('\n');
    expect(out[0]).toBe(B + '@@ -443,6 +443,8 @@ export class EventsMapComponent');
    expect(out[3]).toBe('   445  '); // gutter(445) + the single-space context line
    expect(out[4]!.startsWith("   446 +    private gmapApiKey")).toBe(true);
    expect(out[5]).toBe('   447 +');
    expect(out[6]!.startsWith('   448 ')).toBe(true);
  });

  it('AC-2: a deleted line gets a blank gutter; the next context line keeps the new-side count', () => {
    const raw = '@@ -1,3 +1,2 @@\n a\n-b\n c';
    expect(numberDiff(raw).split('\n')).toEqual([
      B + '@@ -1,3 +1,2 @@',
      G(1) + ' a',
      B + '-b',
      G(2) + ' c',
    ]);
  });

  it('AC-3: the counter restarts at every @@ header and every new file', () => {
    const raw = [
      'diff --git a/x.ts b/x.ts',
      'index 111..222 100644',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,2 +1,2 @@',
      ' a',
      '+b',
      '@@ -10,2 +20,2 @@',
      ' c',
      '+d',
      'diff --git a/y.ts b/y.ts',
      '--- a/y.ts',
      '+++ b/y.ts',
      '@@ -5 +7 @@',
      '+e',
    ].join('\n');

    const out = numberDiff(raw).split('\n');
    expect(out[0]!.startsWith(B)).toBe(true); // diff --git
    expect(out[1]!.startsWith(B)).toBe(true); // index line
    expect(out[2]!.startsWith(B)).toBe(true); // --- header
    expect(out[3]!.startsWith(B)).toBe(true); // +++ header
    expect(out[4]!.startsWith(B)).toBe(true); // @@ -1,2 +1,2 @@
    expect(out[5]).toBe(G(1) + ' a');
    expect(out[6]).toBe(G(2) + '+b');
    expect(out[7]!.startsWith(B)).toBe(true); // @@ -10,2 +20,2 @@
    expect(out[8]).toBe(G(20) + ' c');
    expect(out[9]).toBe(G(21) + '+d');
    expect(out[10]!.startsWith(B)).toBe(true); // diff --git (file 2)
    expect(out[13]!.startsWith(B)).toBe(true); // @@ -5 +7 @@
    expect(out[14]).toBe(G(7) + '+e');
  });

  it('AC-4: "\\ No newline at end of file" gets a blank gutter and does not advance the counter', () => {
    const raw =
      '@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n';
    expect(numberDiff(raw).split('\n')).toEqual([
      B + '@@ -1 +1 @@',
      B + '-a',
      B + '\\ No newline at end of file',
      G(1) + '+b',
      B + '\\ No newline at end of file',
    ]);
  });

  it('AC-4: the empty string produced by a trailing "\\n" is not emitted', () => {
    const raw = '@@ -1 +1 @@\n a\n';
    expect(numberDiff(raw)).toBe(B + '@@ -1 +1 @@\n' + G(1) + ' a');
  });

  it('an empty context line still gets numbered', () => {
    const raw = '@@ -1,3 +1,3 @@\n a\n\n c';
    const out = numberDiff(raw).split('\n');
    expect(out[1]).toBe(G(1) + ' a');
    expect(out[2]).toBe(G(2));
    expect(out[3]).toBe(G(3) + ' c');
  });

  it('numberDiff("") is ""', () => {
    expect(numberDiff('')).toBe('');
  });
});

/**
 * L03 — WP2.tests: numberDiff on the WP1 golden fixture (see
 * `diff-parse.test.ts` for the full parse-level assertions on this same raw
 * text). A `+++`/`---` line INSIDE an open hunk is content, not a header, so
 * it gets a real gutter number; a header line and a deleted line stay blank.
 */
describe('numberDiff — WP1 golden fixture (a "+++"/"--- " content line inside a hunk)', () => {
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
  ].join('\n');

  it('numbers the "+++ i" and "+b" content lines with their real new-file line numbers', () => {
    const out = numberDiff(GOLDEN_DIFF).split('\n');
    expect(out).toContain(G(2) + '+++ i');
    expect(out).toContain(G(3) + '+b');
  });

  it('blanks the gutter for a deleted "--- old comment" line and for the "--- a/x.ts" header', () => {
    const out = numberDiff(GOLDEN_DIFF).split('\n');
    expect(out).toContain(B + '--- old comment');
    const headerLine = out.find((l) => l.endsWith('--- a/x.ts'))!;
    expect(headerLine.startsWith(B)).toBe(true);
  });
});
