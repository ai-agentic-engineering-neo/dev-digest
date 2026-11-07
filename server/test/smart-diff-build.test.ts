import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff } from '../src/modules/smart-diff/build.js';

const f = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

describe('buildSmartDiff', () => {
  it('includes empty groups, always five in fixed order', () => {
    const out = buildSmartDiff([f('src/a.ts'), f('test/a.test.ts')], []);
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    for (const role of ['wiring', 'docs', 'boilerplate']) {
      expect(out.groups.find((g) => g.role === role)?.files).toEqual([]);
    }
  });

  it('keeps input order inside a group', () => {
    const out = buildSmartDiff([f('src/z.ts'), f('src/a.ts')], []);
    expect(out.groups[0]?.files.map((x) => x.path)).toEqual(['src/z.ts', 'src/a.ts']);
  });

  it('computes sorted unique finding_lines per file', () => {
    const out = buildSmartDiff(
      [f('a.ts'), f('b.ts'), f('c.ts')],
      [
        { file: 'a.ts', startLine: 7 },
        { file: 'a.ts', startLine: 3 },
        { file: 'a.ts', startLine: 7 },
        { file: 'b.ts', startLine: 1 },
      ],
    );
    const byPath = new Map(out.groups.flatMap((g) => g.files).map((x) => [x.path, x]));
    expect(byPath.get('a.ts')?.finding_lines).toEqual([3, 7]);
    expect(byPath.get('b.ts')?.finding_lines).toEqual([1]);
    expect(byPath.get('c.ts')?.finding_lines).toEqual([]);
  });

  it('sums total_lines, has no splits and null summaries, and passes the contract', () => {
    const out = buildSmartDiff([f('a.ts', 10, 2), f('b.ts', 3, 5)], []);
    expect(out.split_suggestion.total_lines).toBe(20);
    expect(out.split_suggestion.too_big).toBe(false);
    expect(out.split_suggestion.proposed_splits).toEqual([]);
    expect(out.groups.flatMap((g) => g.files).every((x) => x.pseudocode_summary === null)).toBe(true);
    expect(() => SmartDiff.parse(out)).not.toThrow();
  });

  it('too_big only when total_lines is strictly above 1000', () => {
    const at = buildSmartDiff([f('a.ts', 600, 400)], []).split_suggestion;
    expect(at.total_lines).toBe(1000);
    expect(at.too_big).toBe(false);
    const over = buildSmartDiff([f('a.ts', 600, 401)], []).split_suggestion;
    expect(over.total_lines).toBe(1001);
    expect(over.too_big).toBe(true);
  });
});
