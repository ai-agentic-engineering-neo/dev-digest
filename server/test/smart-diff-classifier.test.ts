import { describe, it, expect } from 'vitest';
import { classifyFile, buildSplitSuggestion } from '../src/modules/reviews/smart-diff-classifier.js';
import {
  SMART_DIFF_TOO_BIG_LINE_THRESHOLD,
  SMART_DIFF_MIN_SPLIT_GROUP_LINES,
  SMART_DIFF_MAX_PROPOSED_SPLITS,
} from '../src/modules/reviews/smart-diff-constants.js';

describe('classifyFile', () => {
  it('classifies lockfiles as boilerplate regardless of directory', () => {
    expect(classifyFile('package-lock.json')).toBe('boilerplate');
    expect(classifyFile('server/pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('yarn.lock')).toBe('boilerplate');
    expect(classifyFile('Cargo.lock')).toBe('boilerplate');
  });

  it('classifies generated/build/vendored paths as boilerplate', () => {
    expect(classifyFile('client/dist/bundle.js')).toBe('boilerplate');
    expect(classifyFile('src/components/__snapshots__/Foo.test.tsx.snap')).toBe('boilerplate');
    expect(classifyFile('client/src/vendor/ui/Button.tsx')).toBe('boilerplate');
    expect(classifyFile('coverage/lcov-report/index.html')).toBe('boilerplate');
  });

  it('classifies boilerplate suffixes regardless of directory', () => {
    expect(classifyFile('assets/app.min.js')).toBe('boilerplate');
    expect(classifyFile('src/components/Foo.test.tsx.snap')).toBe('boilerplate');
  });

  it('classifies index/config/DI/registration files as wiring', () => {
    expect(classifyFile('src/api/public/index.ts')).toBe('wiring');
    expect(classifyFile('src/server.ts')).toBe('wiring');
    expect(classifyFile('client/src/index.tsx')).toBe('wiring');
    expect(classifyFile('vite.config.ts')).toBe('wiring');
    expect(classifyFile('src/modules/reviews/routes.ts')).toBe('wiring');
    expect(classifyFile('src/platform/container.ts')).toBe('wiring');
    expect(classifyFile('src/server.ts')).toBe('wiring');
    expect(classifyFile('src/config.ts')).toBe('wiring');
  });

  it('classifies migration files as wiring', () => {
    expect(classifyFile('server/src/db/migrations/0007_add_column.sql')).toBe('wiring');
  });

  it('classifies ordinary business-logic files as core', () => {
    expect(classifyFile('src/middleware/ratelimit.ts')).toBe('core');
    expect(classifyFile('src/api/public/webhooks.ts')).toBe('core');
    expect(classifyFile('client/src/components/FileCard/FileCard.tsx')).toBe('core');
  });

  it('boilerplate wins over wiring when a path matches both (e.g. a lockfile-shaped index)', () => {
    expect(classifyFile('client/src/vendor/index.ts')).toBe('boilerplate');
  });
});

describe('buildSplitSuggestion', () => {
  it('is not too_big for a small diff', () => {
    const result = buildSplitSuggestion([
      { path: 'src/foo.ts', additions: 10, deletions: 2, role: 'core' },
      { path: 'src/bar.ts', additions: 5, deletions: 1, role: 'wiring' },
    ]);
    expect(result.too_big).toBe(false);
    expect(result.proposed_splits).toEqual([]);
  });

  it('is too_big once core+wiring lines exceed the threshold, and proposes directory splits', () => {
    const half = Math.ceil(SMART_DIFF_TOO_BIG_LINE_THRESHOLD / 2) + 10;
    const result = buildSplitSuggestion([
      { path: 'src/modules/reviews/service.ts', additions: half, deletions: 0, role: 'core' },
      { path: 'src/modules/pulls/service.ts', additions: half, deletions: 0, role: 'core' },
    ]);
    expect(result.too_big).toBe(true);
    expect(result.total_lines).toBe(half * 2);
    expect(result.proposed_splits.length).toBeGreaterThan(0);
    expect(result.proposed_splits[0]!.files.length).toBeGreaterThan(0);
  });

  it('excludes boilerplate churn from total_lines, so a huge lockfile bump alone is not too_big', () => {
    const result = buildSplitSuggestion([
      {
        path: 'pnpm-lock.yaml',
        additions: SMART_DIFF_TOO_BIG_LINE_THRESHOLD * 5,
        deletions: SMART_DIFF_TOO_BIG_LINE_THRESHOLD * 5,
        role: 'boilerplate',
      },
      { path: 'src/foo.ts', additions: 3, deletions: 1, role: 'core' },
    ]);
    expect(result.too_big).toBe(false);
    expect(result.total_lines).toBe(4);
  });

  it('is too_big but proposes no splits when every group falls below the min-group-lines threshold', () => {
    // Grouping is by the path's first 2 segments, so `mod{i}/sub/file.ts`
    // gives each i its own group ('mod0/sub', 'mod1/sub', ...). Many small,
    // scattered groups: the total exceeds the too_big threshold, but no
    // single group reaches SMART_DIFF_MIN_SPLIT_GROUP_LINES on its own, so
    // none qualifies as a proposed split.
    const perGroupLines = SMART_DIFF_MIN_SPLIT_GROUP_LINES - 1;
    const groupCount = Math.ceil((SMART_DIFF_TOO_BIG_LINE_THRESHOLD + 1) / perGroupLines);
    const files = Array.from({ length: groupCount }, (_, i) => ({
      path: `mod${i}/sub/file.ts`,
      additions: perGroupLines,
      deletions: 0,
      role: 'core' as const,
    }));
    const result = buildSplitSuggestion(files);
    expect(result.too_big).toBe(true);
    expect(result.proposed_splits).toEqual([]);
  });

  it('caps proposed splits at SMART_DIFF_MAX_PROPOSED_SPLITS, largest groups first', () => {
    // More distinct groups than the cap allows, each above the min-group-
    // lines threshold and each a different size — only the largest
    // SMART_DIFF_MAX_PROPOSED_SPLITS are proposed, sorted descending.
    const groupCount = SMART_DIFF_MAX_PROPOSED_SPLITS + 2;
    const files = Array.from({ length: groupCount }, (_, i) => ({
      path: `mod${i}/sub/file.ts`,
      // Distinct sizes (largest = mod0) so sort order is unambiguous.
      additions: SMART_DIFF_MIN_SPLIT_GROUP_LINES + (groupCount - i) * 10,
      deletions: 0,
      role: 'core' as const,
    }));
    const result = buildSplitSuggestion(files);
    expect(result.too_big).toBe(true);
    expect(result.proposed_splits).toHaveLength(SMART_DIFF_MAX_PROPOSED_SPLITS);
    expect(result.proposed_splits[0]!.name).toBe('mod0/sub');
    expect(result.proposed_splits.at(-1)!.name).toBe(`mod${SMART_DIFF_MAX_PROPOSED_SPLITS - 1}/sub`);
  });
});
