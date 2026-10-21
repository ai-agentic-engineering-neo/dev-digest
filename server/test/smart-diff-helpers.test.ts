import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { ROLE_ORDER } from '../src/modules/smart-diff/constants.js';
import { buildSmartDiff, classifyPath } from '../src/modules/smart-diff/helpers.js';
import type { SmartDiffInputs } from '../src/modules/smart-diff/ports.js';

describe('classifyPath', () => {
  it.each([
    ['package-lock.json', 'boilerplate'],
    ['pnpm-lock.yaml', 'boilerplate'],
    ['client/yarn.lock', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['go.sum', 'boilerplate'],
    ['public/app.min.js', 'boilerplate'],
    ['src/api.generated.ts', 'boilerplate'],
    ['src/__snapshots__/a.snap', 'boilerplate'],
    ['dist/index.js', 'boilerplate'],
    ['server/src/db/migrations/meta/_journal.json', 'boilerplate'],
    ['src/foo/__fixtures__/user.json', 'tests'],
    ['src/__tests__/a.ts', 'tests'],
    ['src/__mocks__/a.ts', 'tests'],
    ['test/ratelimit.test.ts', 'tests'],
    ['src/a.spec.tsx', 'tests'],
    ['server/test/a.it.test.ts', 'tests'],
    ['e2e/specs/05-pr-diff.flow.json', 'tests'],
    ['src/middleware/README.md', 'docs'],
    ['docs/rate-limiting.md', 'docs'],
    ['docs/notes.txt', 'docs'],
    ['CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    ['package.json', 'wiring'],
    ['server/package.json', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['vite.config.ts', 'wiring'],
    ['Dockerfile', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['src/config.ts', 'wiring'],
    ['src/server.ts', 'wiring'],
    ['src/modules/index.ts', 'wiring'],
    ['pnpm-workspace.yaml', 'wiring'],
    ['src/middleware/ratelimit.ts', 'core'],
    ['src/api/users.ts', 'core'],
    ['server/src/vendor/shared/contracts/brief.ts', 'core'],
    ['client/src/vendor/shared/contracts/brief.ts', 'core'],
  ] as const)('%s -> %s', (path, role) => {
    expect(classifyPath(path)).toBe(role);
  });
});

const inputs = (over: Partial<SmartDiffInputs> = {}): SmartDiffInputs => ({
  files: [],
  findings: [],
  hasReview: false,
  ...over,
});

describe('buildSmartDiff', () => {
  it('always returns five groups in fixed order, even when empty', () => {
    const d = buildSmartDiff(inputs());
    expect(d.groups.map((g) => g.role)).toEqual([...ROLE_ORDER]);
    expect(d.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(d.has_review).toBe(false);
    SmartDiff.parse(d);
  });

  it('dedupes and sorts finding_lines, excludes dismissed lines but keeps their ids', () => {
    const d = buildSmartDiff(
      inputs({
        hasReview: true,
        files: [{ path: 'src/a.ts', additions: 1, deletions: 0 }],
        findings: [
          { id: 'f1', file: 'src/a.ts', startLine: 9, dismissed: false },
          { id: 'f2', file: 'src/a.ts', startLine: 3, dismissed: false },
          { id: 'f3', file: 'src/a.ts', startLine: 9, dismissed: false },
          { id: 'f4', file: 'src/a.ts', startLine: 20, dismissed: true },
          { id: 'f5', file: 'unknown.ts', startLine: 1, dismissed: false },
        ],
      }),
    );
    const file = d.groups[0]!.files[0]!;
    expect(file.finding_lines).toEqual([3, 9]);
    expect(file.finding_ids).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(d.has_review).toBe(true);
  });

  it('orders files by open findings, then churn, then path', () => {
    const d = buildSmartDiff(
      inputs({
        files: [
          { path: 'src/b.ts', additions: 1, deletions: 0 },
          { path: 'src/a.ts', additions: 1, deletions: 0 },
          { path: 'src/c.ts', additions: 50, deletions: 0 },
          { path: 'src/d.ts', additions: 1, deletions: 0 },
        ],
        findings: [{ id: 'f', file: 'src/d.ts', startLine: 1, dismissed: false }],
      }),
    );
    expect(d.groups[0]!.files.map((f) => f.path)).toEqual(['src/d.ts', 'src/c.ts', 'src/a.ts', 'src/b.ts']);
  });

  it('suggests a split only above the threshold, one per non-empty non-boilerplate role', () => {
    const small = buildSmartDiff(inputs({ files: [{ path: 'src/a.ts', additions: 400, deletions: 0 }] }));
    expect(small.split_suggestion).toEqual({ too_big: false, total_lines: 400, proposed_splits: [] });
    const big = buildSmartDiff(
      inputs({
        files: [
          { path: 'src/a.ts', additions: 300, deletions: 1 },
          { path: 'test/a.test.ts', additions: 100, deletions: 0 },
          { path: 'package-lock.json', additions: 100, deletions: 0 },
        ],
      }),
    );
    expect(big.split_suggestion.too_big).toBe(true);
    expect(big.split_suggestion.total_lines).toBe(501);
    expect(big.split_suggestion.proposed_splits).toEqual([
      { name: 'core', files: ['src/a.ts'] },
      { name: 'tests', files: ['test/a.test.ts'] },
    ]);
  });
});
