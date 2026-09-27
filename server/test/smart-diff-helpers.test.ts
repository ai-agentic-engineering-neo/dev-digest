import { describe, it, expect } from 'vitest';
import {
  buildSmartDiff,
  classifyFile,
  findingLinesByPath,
  pickLatestReviewPerAgent,
} from '../src/modules/reviews/smart-diff/helpers.js';

describe('classifyFile', () => {
  it.each([
    ['__tests__/__snapshots__/x.snap', 'boilerplate'],
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['e2e/README.md', 'tests'],
    ['src/modules/reviews/service.ts', 'core'],
    ['pnpm-lock.yaml', 'boilerplate'],
    ['package-lock.json', 'boilerplate'],
    ['client/pnpm-lock.yaml', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['dist/a.js', 'boilerplate'],
    ['packages/x/dist/a.js', 'core'],
    ['src/api.generated.ts', 'boilerplate'],
    ['vendor/x.min.js', 'boilerplate'],
    ['server/test/a.ts', 'tests'],
    ['src/a.test.tsx', 'tests'],
    ['src/a.it.test.ts', 'tests'],
    ['src/index.ts', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['.env.example', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['docs/specs/x.md', 'docs'],
    ['README.md', 'docs'],
    ['server/README.md', 'docs'],
    ['CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    ['src/components/Button/index.tsx', 'core'],
  ])('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

describe('buildSmartDiff', () => {
  const f = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

  it('orders groups by role, omits empty ones, keeps input order in a group', () => {
    const out = buildSmartDiff(
      [f('pnpm-lock.yaml'), f('README.md'), f('src/b.ts'), f('src/a.test.ts'), f('src/a.ts')],
      new Map([['src/a.ts', [3]]]),
    );
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    expect(out.groups[0]!.files.map((x) => x.path)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(out.groups[0]!.files[1]!.finding_lines).toEqual([3]);
    expect(out.groups[0]!.files[0]!.finding_lines).toEqual([]);
    expect(out.groups[0]!.files[0]!.pseudocode_summary).toBeNull();
    expect(out.split_suggestion.proposed_splits).toEqual([]);
  });

  it('ignores duplicate pr_files rows for the same path', () => {
    const out = buildSmartDiff([f('a.ts', 1, 1), f('a.ts', 1, 1)], new Map());
    expect(out.groups[0]!.files).toHaveLength(1);
    expect(out.split_suggestion.total_lines).toBe(2);
  });

  it('keeps split_suggestion minimal: total_lines is summed, too_big stays false', () => {
    expect(buildSmartDiff([f('a.ts', 900, 900)], new Map()).split_suggestion).toEqual({
      total_lines: 1800,
      too_big: false,
      proposed_splits: [],
    });
  });
});

describe('pickLatestReviewPerAgent', () => {
  it('keeps the newest review per agent, unions agents, ignores summaries', () => {
    const rows = [
      { id: 'sum', kind: 'summary', agentId: 'a1' },
      { id: 'a1-new', kind: 'review', agentId: 'a1' },
      { id: 'b-new', kind: 'review', agentId: 'b' },
      { id: 'a1-old', kind: 'review', agentId: 'a1' },
      { id: 'none', kind: 'review', agentId: null },
    ];
    expect(pickLatestReviewPerAgent(rows).map((r) => r.id)).toEqual(['a1-new', 'b-new', 'none']);
  });
});

describe('findingLinesByPath', () => {
  it('excludes dismissed, dedupes and sorts', () => {
    const m = findingLinesByPath([
      { file: 'a.ts', startLine: 9, dismissedAt: null },
      { file: 'a.ts', startLine: 2, dismissedAt: null },
      { file: 'a.ts', startLine: 9, dismissedAt: null },
      { file: 'a.ts', startLine: 20, dismissedAt: new Date() },
      { file: 'b.ts', startLine: 1, dismissedAt: new Date() },
    ]);
    expect(m.get('a.ts')).toEqual([2, 9]);
    expect(m.has('b.ts')).toBe(false);
  });
});
