/**
 * adapters/tsresolve — ModuleResolver over a contained, file-set-backed host.
 * Hermetic: in-memory files, no real filesystem access.
 */
import { describe, expect, it } from 'vitest';
import { TsModuleResolverFactory } from '../src/adapters/tsresolve/index.js';
import type { ModuleResolverInstance } from '../src/domain/ports/module-resolver.js';

const ROOT = '/clone';

function make(tree: Record<string, string>): { r: ModuleResolverInstance; reads: string[] } {
  const reads: string[] = [];
  const r = new TsModuleResolverFactory().create({
    root: ROOT,
    files: new Set(Object.keys(tree)),
    readText: (rel) => {
      reads.push(rel);
      return tree[rel] ?? null;
    },
  });
  return { r, reads };
}

const BASE: Record<string, string> = {
  'src/a.ts': '',
  'src/b.ts': '',
  'src/util/index.ts': '',
  'src/legacy.js': '',
  'src/x.ts': '',
  'src/types.d.ts': '',
};

describe('tsresolve — relative resolution', () => {
  const { r } = make(BASE);

  it('resolves an extensionless relative import', () => {
    expect(r.resolve('src/a.ts', './b')).toEqual({ kind: 'file', path: 'src/b.ts' });
  });
  it('resolves a directory to its index file', () => {
    expect(r.resolve('src/a.ts', './util')).toEqual({ kind: 'file', path: 'src/util/index.ts' });
  });
  it('maps a .js specifier to the .ts source', () => {
    expect(r.resolve('src/a.ts', './x.js')).toEqual({ kind: 'file', path: 'src/x.ts' });
  });
  it('resolves a real .js file with allowJs', () => {
    expect(r.resolve('src/a.ts', './legacy')).toEqual({ kind: 'file', path: 'src/legacy.js' });
  });
  it('reports a missing relative file as unresolved:missing', () => {
    expect(r.resolve('src/a.ts', './nope')).toEqual({ kind: 'unresolved', reason: 'missing' });
  });
  // Regression: TS hands the host `<dir>/` for '.' and './'; the trailing
  // slash used to miss the directory set (found re-indexing a real JS repo).
  it("resolves '.', './' and '..' to the directory index file", () => {
    expect(r.resolve('src/util/index.ts', '.')).toEqual({ kind: 'file', path: 'src/util/index.ts' });
    expect(r.resolve('src/util/index.ts', './')).toEqual({ kind: 'file', path: 'src/util/index.ts' });
    const { r: r2 } = make({ 'src/Foo/index.jsx': '', 'src/Foo/Foo.test.jsx': '', 'src/Foo/sub/x.js': '' });
    expect(r2.resolve('src/Foo/Foo.test.jsx', '.')).toEqual({ kind: 'file', path: 'src/Foo/index.jsx' });
    expect(r2.resolve('src/Foo/sub/x.js', '..')).toEqual({ kind: 'file', path: 'src/Foo/index.jsx' });
  });
  it('treats unwalked relative assets (css/svg/png) as external, not missing code', () => {
    expect(r.resolve('src/a.ts', './logo.svg')).toEqual({ kind: 'external' });
    expect(r.resolve('src/a.ts', './index.css')).toEqual({ kind: 'external' });
    expect(r.resolve('src/a.ts', './pic.png?inline')).toEqual({ kind: 'external' });
    expect(r.resolve('src/a.ts', './gone.js')).toEqual({ kind: 'unresolved', reason: 'missing' });
  });
});

describe('tsresolve — builtin / external', () => {
  const { r } = make(BASE);
  it('node: prefix and bare builtins are builtin', () => {
    expect(r.resolve('src/a.ts', 'node:fs')).toEqual({ kind: 'builtin' });
    expect(r.resolve('src/a.ts', 'fs/promises')).toEqual({ kind: 'builtin' });
  });
  it('an npm package is external (node_modules is never walked)', () => {
    expect(r.resolve('src/a.ts', 'react')).toEqual({ kind: 'external' });
    expect(r.resolve('src/a.ts', '@scope/pkg/sub')).toEqual({ kind: 'external' });
  });
});

describe('tsresolve — tsconfig paths (per-package, no root tsconfig — M7)', () => {
  const tree = {
    'packages/web/tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'], '@missing/*': ['nowhere/*'] } },
    }),
    'packages/web/src/page.ts': '',
    'packages/web/src/lib/format.ts': '',
    'packages/api/src/route.ts': '',
    'packages/api/src/lib/format.ts': '',
  };
  const { r } = make(tree);

  it('resolves an alias through the nearest tsconfig', () => {
    expect(r.resolve('packages/web/src/page.ts', '@/lib/format')).toEqual({
      kind: 'file',
      path: 'packages/web/src/lib/format.ts',
    });
  });
  it('does not apply a sibling package tsconfig', () => {
    expect(r.resolve('packages/api/src/route.ts', '@/lib/format')).toEqual({ kind: 'external' });
  });
  it('an alias that matches but points nowhere is missing', () => {
    expect(r.resolve('packages/web/src/page.ts', '@missing/x')).toEqual({
      kind: 'unresolved',
      reason: 'missing',
    });
  });
});

describe('tsresolve — extends', () => {
  it('follows an extends chain for paths', () => {
    const { r } = make({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '~/*': ['lib/*'] } } }),
      'packages/p/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.base.json' }),
      'packages/p/src/a.ts': '',
      'lib/helper.ts': '',
    });
    expect(r.resolve('packages/p/src/a.ts', '~/helper')).toEqual({ kind: 'file', path: 'lib/helper.ts' });
    expect(r.tsconfigFailures()).toEqual([]);
  });

  it('missing extends target is recorded and resolution falls back to default', () => {
    const { r } = make({
      'tsconfig.json': JSON.stringify({ extends: './gone.json', compilerOptions: { paths: { '@/*': ['src/*'] } } }),
      'src/a.ts': '',
      'src/b.ts': '',
    });
    expect(r.resolve('src/a.ts', './b')).toEqual({ kind: 'file', path: 'src/b.ts' });
    const failures = r.tsconfigFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.path).toBe('tsconfig.json');
  });

  it('extends to an npm package is a recorded failure, never read from disk', () => {
    const { r, reads } = make({
      'tsconfig.json': JSON.stringify({ extends: '@tsconfig/node22/tsconfig.json' }),
      'a.ts': '',
      'b.ts': '',
    });
    expect(r.resolve('a.ts', './b')).toEqual({ kind: 'file', path: 'b.ts' });
    expect(r.tsconfigFailures()).toHaveLength(1);
    expect(reads.every((p) => !p.includes('node_modules'))).toBe(true);
  });

  it('extends pointing outside the clone is a recorded failure', () => {
    const { r, reads } = make({
      'pkg/tsconfig.json': JSON.stringify({ extends: '../../../etc/outside.json' }),
      'pkg/a.ts': '',
      'pkg/b.ts': '',
    });
    expect(r.resolve('pkg/a.ts', './b')).toEqual({ kind: 'file', path: 'pkg/b.ts' });
    expect(r.tsconfigFailures()).toHaveLength(1);
    expect(reads).toEqual(['pkg/tsconfig.json']);
  });

  it('an unparseable tsconfig is recorded, default resolution continues', () => {
    const { r } = make({ 'tsconfig.json': '{ not json', 'a.ts': '', 'b.ts': '' });
    expect(r.resolve('a.ts', './b')).toEqual({ kind: 'file', path: 'b.ts' });
    expect(r.tsconfigFailures()).toHaveLength(1);
  });
});

describe('tsresolve — containment', () => {
  const { r, reads } = make({ ...BASE, 'top.ts': '' });

  it('refuses a ../ escape out of the clone', () => {
    expect(r.resolve('top.ts', '../outside')).toEqual({ kind: 'unresolved', reason: 'outside_clone' });
    expect(r.resolve('src/a.ts', '../../etc/passwd')).toEqual({ kind: 'unresolved', reason: 'outside_clone' });
  });
  it('refuses absolute specifiers', () => {
    expect(r.resolve('src/a.ts', '/etc/passwd')).toEqual({ kind: 'unresolved', reason: 'outside_clone' });
    expect(r.resolve('src/a.ts', 'C:\\x')).toEqual({ kind: 'unresolved', reason: 'outside_clone' });
  });
  it('refuses NUL bytes', () => {
    expect(r.resolve('src/a.ts', './b\0')).toEqual({ kind: 'unresolved', reason: 'outside_clone' });
    expect(r.resolve('src/a\0.ts', './b')).toEqual({ kind: 'unresolved', reason: 'outside_clone' });
  });
  it('only ever reads files from the walked set', () => {
    r.resolve('src/a.ts', '../../../etc/passwd');
    expect(reads.every((p) => p in { ...BASE, 'top.ts': '' })).toBe(true);
  });
  it('never throws on hostile input', () => {
    expect(() => r.resolve('src/a.ts', '')).not.toThrow();
    expect(() => r.resolve('src/a.ts', '....//')).not.toThrow();
  });
});
