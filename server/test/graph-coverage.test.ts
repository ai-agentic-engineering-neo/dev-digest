import { describe, expect, it } from 'vitest';
import { IndexCoverage } from '../src/vendor/shared/index.js';
import { build, fakeResolver } from './graph-test-utils.js';

describe('coverage (AC-14)', () => {
  it('splits value/type shares, excludes external/builtin, reports reasons, tsconfig failures and inferred share', () => {
    const sources = {
      'lib.ts': `export function f() {}\nexport interface T {}\nexport class K { m() {} }`,
      'u.ts': `import { f } from './lib';\nimport type { T } from './lib';\nimport { K } from './lib';\nimport { gone } from './lib';\nimport { x } from './nope';\nimport z from 'zod';\nimport fs from 'node:fs';\nexport function r(k: K, t: T) { f(); k.m(); }`,
    };
    const failures = [{ path: 'pkg/tsconfig.json', message: 'bad json' }];
    const { graph } = build(sources, fakeResolver(new Set(Object.keys(sources)), failures));
    const c = graph.coverage;
    expect(() => IndexCoverage.parse(c)).not.toThrow();
    // value: f, K resolved; gone (missing name), x (missing file) unresolved; zod/fs not counted
    expect(c.value).toEqual({ resolved: 2, total: 4 });
    expect(c.type).toEqual({ resolved: 1, total: 1 });
    expect(c.unresolvedBySpecifier).toBe(1);
    expect(c.unresolvedByReason).toEqual({ missing: 2 });
    expect(c.tsconfigFailures).toEqual(failures);
    // edges: f (call exact), K (type exact), T (type exact), k.m inferred
    expect(c.inferredShare).toBeCloseTo(1 / 4);
  });

  it('is zeroed (not NaN) for an empty graph, and counts unresolved re-export specifiers', () => {
    const empty = build({});
    expect(empty.graph.coverage).toMatchObject({ value: { resolved: 0, total: 0 }, inferredShare: 0, unresolvedBySpecifier: 0 });
    const { graph } = build({ 'b.ts': `export * from './missing';` });
    expect(graph.coverage.unresolvedBySpecifier).toBe(1);
  });

  it('opaque (unparsed in-repo file) targets are not counted', () => {
    const src = { 'a.ts': `import data from './d.json';` };
    const files = new Set(['a.ts', 'd.json']);
    const resolver = { resolve: () => ({ kind: 'file' as const, path: 'd.json' }), tsconfigFailures: () => [] };
    void files;
    const { graph } = build(src, resolver);
    expect(graph.coverage.value).toEqual({ resolved: 0, total: 0 });
    expect(graph.fileEdges).toEqual([{ from: 'a.ts', to: 'd.json' }]);
  });
});
