import { describe, it, expect } from 'vitest';
import {
  classifyPath,
  latestReviewPerAgent,
  buildSmartDiff,
  type SmartDiffSourceFile,
  type SmartDiffSourceReview,
} from '../src/modules/smart-diff/helpers.js';

/**
 * `classifyPath` — one case per row of the classifier table in
 * `server/specs/L03-smart-diff.md` § Contract (and the plan's Test brief
 * WP3.tests). First match wins, checked boilerplate → tests → wiring → docs,
 * else core.
 */
describe('classifyPath', () => {
  it.each([
    'pnpm-lock.yaml',
    'client/pnpm-lock.yaml',
    'e2e/package-lock.json',
    'yarn.lock',
    'Cargo.lock',
    'client/dist/app.js',
    'build/index.js',
    'src/__snapshots__/a.test.ts.snap',
    'x.snap',
    'src/foo.generated.ts',
    'vendor.min.js',
  ])('%s -> boilerplate', (path) => {
    expect(classifyPath(path)).toBe('boilerplate');
  });

  it.each([
    'src/a.test.ts',
    'src/A.test.tsx',
    'server/test/x.it.test.ts',
    'src/a.spec.ts',
    'server/test/helpers/pg.ts',
    'pkg/tests/x.ts',
    'src/__tests__/x.ts',
    'e2e/run.ts',
    'e2e/README.md',
    'docs/foo.test.ts',
  ])('%s -> tests', (path) => {
    expect(classifyPath(path)).toBe('tests');
  });

  it.each([
    'client/src/index.ts',
    'lib/index.js',
    'vitest.config.ts',
    'next.config.mjs',
    'tsconfig.json',
    'tsconfig.build.json',
    '.eslintrc.json',
    '.env',
    '.env.example',
    'docker-compose.test.yml',
    '.github/workflows/ci.yml',
    '.claude/skills/x/SKILL.md',
  ])('%s -> wiring', (path) => {
    expect(classifyPath(path)).toBe('wiring');
  });

  it.each([
    'README.md',
    'server/README.md',
    'docs/guide.txt',
    'server/docs/notes.ts',
    'CHANGELOG',
    'LICENSE',
    'a/b.md',
  ])('%s -> docs', (path) => {
    expect(classifyPath(path)).toBe('docs');
  });

  it.each([
    'src/config.ts',
    'src/latest.ts',
    'src/testing/x.ts',
    'src/contest/x.ts',
    'src/rebuild/x.ts',
    'src/docs.ts',
    'server/src/vendor/shared/contracts/brief.ts',
    'LICENSE.txt',
    'src/Index.ts',
  ])('%s -> core', (path) => {
    expect(classifyPath(path)).toBe('core');
  });
});

/**
 * TP-1 — the "latest review per agent" fixture shared with the client's
 * `DiffTab/helpers.test.ts` (parity pinned by Test brief TP-1). See
 * `server/specs/L03-smart-diff.md` § "Latest review per agent".
 */
function tp1Reviews(): SmartDiffSourceReview[] {
  return [
    {
      id: 'r1',
      agentId: 'agent-a',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      findings: [{ file: 'a.ts', startLine: 10, dismissedAt: null }],
    },
    {
      id: 'r2',
      agentId: 'agent-a',
      createdAt: new Date('2026-09-02T10:00:00Z'),
      findings: [{ file: 'a.ts', startLine: 20, dismissedAt: null }],
    },
    {
      id: 'r3',
      agentId: 'agent-b',
      createdAt: new Date('2026-09-01T12:00:00Z'),
      findings: [
        { file: 'a.ts', startLine: 30, dismissedAt: new Date('2026-09-03T00:00:00Z') },
        { file: 'b.md', startLine: 5, dismissedAt: null }, // accepted findings still count
      ],
    },
    {
      id: 'r4',
      agentId: null,
      createdAt: new Date('2026-08-30T00:00:00Z'),
      findings: [{ file: 'a.ts', startLine: 40, dismissedAt: null }],
    },
    {
      id: 'r5',
      agentId: null,
      createdAt: new Date('2026-08-31T00:00:00Z'),
      findings: [{ file: 'a.ts', startLine: 50, dismissedAt: null }],
    },
  ];
}

describe('TP-1 — latest review per agent (shared fixture)', () => {
  it('latestReviewPerAgent keeps r2 (agent A latest), r3 (agent B only), r5 (null-agent latest)', () => {
    const kept = latestReviewPerAgent(tp1Reviews()).map((r) => r.id);
    expect(new Set(kept)).toEqual(new Set(['r2', 'r3', 'r5']));
    expect(kept).toHaveLength(3);
  });

  it('buildSmartDiff: finding_lines for a.ts is [20, 50], for b.md is [5]', () => {
    const files: SmartDiffSourceFile[] = [
      { path: 'a.ts', additions: 1, deletions: 0 },
      { path: 'b.md', additions: 1, deletions: 0 },
    ];
    const result = buildSmartDiff(files, tp1Reviews());
    const byPath = new Map(result.groups.flatMap((g) => g.files).map((f) => [f.path, f]));
    expect(byPath.get('a.ts')!.finding_lines).toEqual([20, 50]);
    expect(byPath.get('b.md')!.finding_lines).toEqual([5]);
  });
});

describe('buildSmartDiff', () => {
  it('sorts files within a group by path (code-unit order) and drops empty groups', () => {
    const files: SmartDiffSourceFile[] = [
      { path: 'src/b.ts', additions: 1, deletions: 0 },
      { path: 'src/a.ts', additions: 1, deletions: 0 },
    ];
    const result = buildSmartDiff(files, []);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.role).toBe('core');
    expect(result.groups[0]!.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('too_big is false at 399 total lines and true at 400; proposed_splits/pseudocode_summary are always empty/null', () => {
    const under: SmartDiffSourceFile[] = [{ path: 'a.ts', additions: 300, deletions: 99 }];
    const at: SmartDiffSourceFile[] = [{ path: 'a.ts', additions: 300, deletions: 100 }];

    const underResult = buildSmartDiff(under, []);
    expect(underResult.split_suggestion.total_lines).toBe(399);
    expect(underResult.split_suggestion.too_big).toBe(false);

    const atResult = buildSmartDiff(at, []);
    expect(atResult.split_suggestion.total_lines).toBe(400);
    expect(atResult.split_suggestion.too_big).toBe(true);

    for (const result of [underResult, atResult]) {
      expect(result.split_suggestion.proposed_splits).toEqual([]);
      for (const group of result.groups) {
        for (const file of group.files) expect(file.pseudocode_summary).toBeNull();
      }
    }
  });
});
