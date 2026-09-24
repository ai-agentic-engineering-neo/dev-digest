import { describe, it, expect } from 'vitest';
import { buildSmartDiff } from '../src/modules/smart-diff/domain/smart-diff.js';

describe('buildSmartDiff', () => {
  it('groups files into the fixed role order, one group per role even when empty', () => {
    const result = buildSmartDiff(
      [
        { path: 'pnpm-lock.yaml', additions: 10, deletions: 0 },
        { path: 'src/config.ts', additions: 3, deletions: 1 },
        { path: 'src/config.test.ts', additions: 5, deletions: 0 },
      ],
      [],
    );
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const byRole = Object.fromEntries(result.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(byRole.core).toEqual(['src/config.ts']);
    expect(byRole.tests).toEqual(['src/config.test.ts']);
    expect(byRole.wiring).toEqual([]);
    expect(byRole.docs).toEqual([]);
    expect(byRole.boilerplate).toEqual(['pnpm-lock.yaml']);
  });

  it('sorts each group by path', () => {
    const result = buildSmartDiff(
      [
        { path: 'src/b.ts', additions: 1, deletions: 0 },
        { path: 'src/a.ts', additions: 1, deletions: 0 },
      ],
      [],
    );
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('dedupes and sorts finding_lines ascending, per file', () => {
    const result = buildSmartDiff(
      [{ path: 'src/config.ts', additions: 3, deletions: 1 }],
      [
        { file: 'src/config.ts', start_line: 12 },
        { file: 'src/config.ts', start_line: 5 },
        { file: 'src/config.ts', start_line: 12 },
      ],
    );
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([5, 12]);
  });

  it('ignores a finding whose file is not one of the PR files', () => {
    const result = buildSmartDiff(
      [{ path: 'src/config.ts', additions: 1, deletions: 0 }],
      [{ file: 'src/other-not-in-pr.ts', start_line: 1 }],
    );
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([]);
  });

  it('total_lines sums additions+deletions of every file', () => {
    const result = buildSmartDiff(
      [
        { path: 'a.ts', additions: 10, deletions: 2 },
        { path: 'b.ts', additions: 3, deletions: 1 },
      ],
      [],
    );
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 16, proposed_splits: [] });
  });
});
