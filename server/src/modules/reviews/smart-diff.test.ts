import { describe, expect, it } from 'vitest';
import { classifyFile, buildSmartDiff } from './smart-diff.js';
import { SPLIT_SUGGESTION_LINE_THRESHOLD } from './smart-diff-constants.js';

describe('classifyFile', () => {
  it('classifies lock files as boilerplate, including nested paths', () => {
    expect(classifyFile('package-lock.json')).toBe('boilerplate');
    expect(classifyFile('packages/api/package-lock.json')).toBe('boilerplate');
    expect(classifyFile('pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('yarn.lock')).toBe('boilerplate');
    expect(classifyFile('go.sum')).toBe('boilerplate');
  });

  it('classifies package.json, build output, and snapshots as boilerplate', () => {
    expect(classifyFile('package.json')).toBe('boilerplate');
    expect(classifyFile('dist/index.js')).toBe('boilerplate');
    expect(classifyFile('src/__snapshots__/Foo.test.tsx.snap')).toBe('boilerplate');
    expect(classifyFile('public/bundle.min.js')).toBe('boilerplate');
  });

  it('classifies bootstrap/config/index files as wiring', () => {
    expect(classifyFile('src/index.ts')).toBe('wiring');
    expect(classifyFile('src/server.ts')).toBe('wiring');
    expect(classifyFile('src/config.ts')).toBe('wiring');
    expect(classifyFile('vitest.config.ts')).toBe('wiring');
    expect(classifyFile('tsconfig.json')).toBe('wiring');
    expect(classifyFile('.github/workflows/ci.yml')).toBe('wiring');
  });

  it('falls back to core for everything else', () => {
    expect(classifyFile('src/middleware/ratelimit.ts')).toBe('core');
    expect(classifyFile('src/api/public/webhooks.ts')).toBe('core');
  });
});

describe('buildSmartDiff', () => {
  it('groups files in core, wiring, boilerplate order, omitting empty groups', () => {
    const result = buildSmartDiff(
      [
        { path: 'src/foo.ts', additions: 5, deletions: 1 },
        { path: 'package-lock.json', additions: 20, deletions: 0 },
      ],
      [],
    );
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'boilerplate']);
  });

  it('expands and dedupes finding_lines only for the matching file', () => {
    const result = buildSmartDiff(
      [
        { path: 'src/foo.ts', additions: 5, deletions: 1 },
        { path: 'src/bar.ts', additions: 2, deletions: 0 },
      ],
      [
        { file: 'src/foo.ts', startLine: 10, endLine: 12 },
        { file: 'src/foo.ts', startLine: 11, endLine: 11 },
      ],
    );
    const foo = result.groups[0]!.files.find((f) => f.path === 'src/foo.ts')!;
    const bar = result.groups[0]!.files.find((f) => f.path === 'src/bar.ts')!;
    expect(foo.finding_lines).toEqual([10, 11, 12]);
    expect(bar.finding_lines).toEqual([]);
  });

  it('flips too_big at the threshold', () => {
    const under = buildSmartDiff(
      [{ path: 'src/foo.ts', additions: SPLIT_SUGGESTION_LINE_THRESHOLD, deletions: 0 }],
      [],
    );
    expect(under.split_suggestion.too_big).toBe(false);
    expect(under.split_suggestion.total_lines).toBe(SPLIT_SUGGESTION_LINE_THRESHOLD);

    const over = buildSmartDiff(
      [{ path: 'src/foo.ts', additions: SPLIT_SUGGESTION_LINE_THRESHOLD + 1, deletions: 0 }],
      [],
    );
    expect(over.split_suggestion.too_big).toBe(true);
    expect(over.split_suggestion.proposed_splits.length).toBeGreaterThan(0);
  });

  it('never sets pseudocode_summary (no LLM call)', () => {
    const result = buildSmartDiff([{ path: 'src/foo.ts', additions: 1, deletions: 0 }], []);
    expect(result.groups[0]!.files[0]!.pseudocode_summary).toBeNull();
  });
});
