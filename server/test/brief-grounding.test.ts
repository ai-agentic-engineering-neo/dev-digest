import { describe, it, expect } from 'vitest';
import { groundBrief } from '../src/modules/brief/domain/grounding.js';
import { parseHunkRanges } from '../src/modules/brief/domain/hunks.js';
import type { BriefReplyData } from '../src/modules/brief/domain/types.js';

const changed = new Map([
  ['src/a.ts', parseHunkRanges('@@ -1,5 +10,5 @@\n@@ -20,2 +30,2 @@')],
  ['src/gone.ts', parseHunkRanges('@@ -1,3 +0,0 @@')],
  ['src/nopatch.ts', parseHunkRanges(null)],
]);
const ctx = { changed, blastFiles: new Set(['src/caller.ts']) as ReadonlySet<string> };

type Sev = 'low' | 'medium' | 'high';
const risk = (severity: Sev, file = 'src/a.ts', title: string = severity) => ({
  kind: 'Other',
  title,
  explanation: 'x',
  severity,
  file_refs: [file],
});
const reply = (over: Partial<BriefReplyData>): BriefReplyData => ({
  summary: 's',
  risks: [],
  review_focus: [],
  ...over,
});

describe('groundBrief', () => {
  it('drops ungrounded refs/focus; blast paths need blastFiles', () => {
    const r = reply({
      risks: [risk('high', 'src/x.ts'), risk('low', 'src/caller.ts')],
      review_focus: [
        { file: 'src/x.ts', line: 1, reason: 'a' },
        { file: 'src/caller.ts', line: 77, reason: 'b' },
        { file: 'src/caller.ts', line: 0, reason: 'c' },
      ],
    });
    const g = groundBrief(r, ctx);
    expect(g.risks).toHaveLength(1);
    expect(g.risks[0]?.refs[0]).toMatchObject({ path: 'src/caller.ts', in_diff: false });
    expect(g.review_focus).toEqual([
      { file: 'src/caller.ts', line: 77, file_level: false, in_diff: false, reason: 'b' },
    ]);
    const none = groundBrief(r, { changed, blastFiles: null });
    expect(none.risks).toEqual([]);
    expect(none.review_focus).toEqual([]);
  });

  it('parses ranged refs', () => {
    const g = groundBrief(reply({ risks: [risk('low', 'src/a.ts:12-18')] }), ctx);
    expect(g.risks[0]?.refs[0]).toMatchObject({
      ref: 'src/a.ts:12-18',
      start_line: 12,
      end_line: 18,
      in_diff: true,
    });
    expect(g.risks[0]?.file_refs).toEqual(['src/a.ts:12-18']);
  });

  it('snaps focus lines and flags file-level', () => {
    const g = groundBrief(
      reply({
        review_focus: [
          { file: 'src/a.ts', line: 12, reason: 'in' },
          { file: 'src/a.ts', line: 22, reason: 'tie goes to the earlier range' },
          { file: 'src/gone.ts', line: 5, reason: 'g' },
          { file: 'src/nopatch.ts', line: 9, reason: 'n' },
        ],
      }),
      ctx,
    );
    expect(g.review_focus.map((f) => [f.file, f.line, f.file_level])).toEqual([
      ['src/a.ts', 12, false],
      ['src/a.ts', 10, false],
      ['src/gone.ts', 1, true],
      ['src/nopatch.ts', 1, true],
    ]);
  });

  it('keeps the first of two items ending on the same file+line', () => {
    const g = groundBrief(
      reply({
        review_focus: [
          { file: 'src/a.ts', line: 0, reason: 'first' },
          { file: 'src/a.ts', line: 10, reason: 'second' },
        ],
      }),
      ctx,
    );
    expect(g.review_focus).toHaveLength(1);
    expect(g.review_focus[0]?.reason).toBe('first');
  });

  it('caps risks by severity, in model order', () => {
    const sev: Sev[] = ['low', 'high', 'medium', 'high', 'low', 'medium', 'high', 'low'];
    const g = groundBrief(reply({ risks: sev.map((s, i) => risk(s, 'src/a.ts', `r${i}`)) }), ctx);
    expect(g.risks.map((r) => r.title)).toEqual(['r0', 'r1', 'r2', 'r3', 'r5', 'r6']);
  });

  it('caps focus after grounding', () => {
    const items = [
      { file: 'src/invented.ts', line: 1, reason: 'x' },
      ...Array.from({ length: 9 }, (_, i) => ({ file: 'src/caller.ts', line: i + 1, reason: `r${i}` })),
    ];
    const g = groundBrief(reply({ review_focus: items }), ctx);
    expect(g.review_focus).toHaveLength(7);
    expect(g.review_focus[0]?.reason).toBe('r0');
  });

  it('returns empty lists when every path is invented', () => {
    const g = groundBrief(
      reply({ risks: [risk('high', 'nope.ts')], review_focus: [{ file: 'nope.ts', line: 1, reason: 'x' }] }),
      ctx,
    );
    expect(g.risks).toEqual([]);
    expect(g.review_focus).toEqual([]);
  });

  it('clamps text and keeps markup literal', () => {
    const g = groundBrief(
      reply({ summary: '<script>' + 'a'.repeat(5000), risks: [{ ...risk('low'), kind: '' }] }),
      ctx,
    );
    expect(g.summary).toHaveLength(1200);
    expect(g.summary.startsWith('<script>')).toBe(true);
    expect(g.risks[0]?.kind).toBe('other');
  });
});
