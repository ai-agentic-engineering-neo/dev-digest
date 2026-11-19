import { describe, expect, it } from 'vitest';
import { computeChangedSymbols, type DeclRange } from '../src/modules/repo-intel/graph/changed.js';

const d = (name: string, line: number, endLine: number, kind = 'function'): DeclRange => ({ name, kind, line, endLine });
const names = (r: ReturnType<typeof computeChangedSymbols>): string[] => r.map((c) => `${c.deleted ? '-' : '+'}${c.path}#${c.name}`);

const BASE = new Map([['lib.ts', [d('<module>', 1, 9, 'module'), d('foo', 1, 3), d('bar', 5, 7)]]]);

describe('computeChangedSymbols', () => {
  it('head hunk ∩ head declarations => changed (head coordinates, not base ones)', () => {
    // head moved `foo` down by 10 lines: only head coordinates may be used for the added side
    const head = new Map([['lib.ts', [d('foo', 11, 13), d('bar', 15, 17)]]]);
    const r = computeChangedSymbols({ files: [{ path: 'lib.ts', status: 'modified', patch: '@@ -2 +12 @@\n-  return 1;\n+  return 2;\n' }], base: BASE, head });
    expect(names(r)).toEqual(['+lib.ts#foo']);
  });

  it('a removed range touching a symbol that head still declares is a change, not a deletion', () => {
    const head = new Map([['lib.ts', [d('foo', 1, 3), d('bar', 5, 7)]]]);
    const r = computeChangedSymbols({ files: [{ path: 'lib.ts', status: 'modified', patch: '@@ -6 +6,0 @@\n-  return 2;\n' }], base: BASE, head });
    expect(names(r)).toEqual(['+lib.ts#bar']);
  });

  it('removed range over a symbol head no longer declares => deleted; unrelated symbols stay untouched', () => {
    const head = new Map([['lib.ts', [d('foo', 1, 3)]]]);
    const r = computeChangedSymbols({ files: [{ path: 'lib.ts', status: 'modified', patch: '@@ -4,4 +3,0 @@\n-\n-export function bar() {\n-  return 2;\n-}\n' }], base: BASE, head });
    expect(names(r)).toEqual(['-lib.ts#bar']);
  });

  it('head symbol absent from the index => added/changed', () => {
    const head = new Map([['lib.ts', [d('foo', 1, 3), d('bar', 5, 7), d('baz', 9, 11)]]]);
    const r = computeChangedSymbols({ files: [{ path: 'lib.ts', status: 'modified', patch: '@@ -7,0 +8,4 @@\n+\n+export function baz() {\n+  return 3;\n+}\n' }], base: BASE, head });
    expect(names(r)).toEqual(['+lib.ts#baz']);
  });

  it('a hunk outside every declaration is the module-scope pseudo-symbol', () => {
    const head = new Map([['lib.ts', [d('foo', 1, 3), d('bar', 5, 7)]]]);
    const r = computeChangedSymbols({ files: [{ path: 'lib.ts', status: 'modified', patch: '@@ -4 +4 @@\n-// a\n+// b\n' }], base: BASE, head });
    expect(names(r)).toEqual(['+lib.ts#<module>']);
  });

  it('moved symbol = delete in the source file + add in the target file', () => {
    const base = new Map([['a.ts', [d('mv', 1, 3)]], ['b.ts', [d('keep', 1, 2)]]]);
    const head = new Map([['a.ts', []], ['b.ts', [d('keep', 1, 2), d('mv', 4, 6)]]]);
    const r = computeChangedSymbols({
      files: [
        { path: 'a.ts', status: 'modified', patch: '@@ -1,3 +0,0 @@\n-export function mv() {\n-  return 1;\n-}\n' },
        { path: 'b.ts', status: 'modified', patch: '@@ -2,0 +3,3 @@\n+export function mv() {\n+  return 1;\n+}\n' },
      ],
      base,
      head,
    });
    expect(names(r)).toEqual(['-a.ts#mv', '+b.ts#mv']);
  });

  it('deleted file => every persisted symbol (incl. <module>) is deleted', () => {
    const r = computeChangedSymbols({ files: [{ path: 'lib.ts', status: 'removed' }], base: BASE, head: new Map() });
    expect(names(r)).toEqual(['-lib.ts#<module>', '-lib.ts#bar', '-lib.ts#foo']);
  });

  it('renamed file => old path deleted, new path added', () => {
    const base = new Map([['old.ts', [d('<module>', 1, 3, 'module'), d('f', 1, 3)]]]);
    const head = new Map([['new.ts', [d('f', 1, 3)]]]);
    const r = computeChangedSymbols({ files: [{ path: 'new.ts', status: 'renamed', previousPath: 'old.ts', patch: null }], base, head });
    expect(names(r)).toEqual(['+new.ts#f', '-old.ts#<module>', '-old.ts#f']);
  });

  it('added file => all head symbols; head unknown (degraded) => nothing to say about it', () => {
    const head = new Map([['n.ts', [d('x', 1, 2), d('y', 4, 5)]]]);
    expect(names(computeChangedSymbols({ files: [{ path: 'n.ts', status: 'added', patch: '@@ -0,0 +1,5 @@\n+x\n' }], base: new Map(), head }))).toEqual(['+n.ts#x', '+n.ts#y']);
    expect(computeChangedSymbols({ files: [{ path: 'n.ts', status: 'added', patch: '@@ -0,0 +1,5 @@\n+x\n' }], base: new Map(), head: new Map() })).toEqual([]);
  });

  it('degraded head (not parsed): base-only — removed ranges mark changed, never deleted', () => {
    const r = computeChangedSymbols({ files: [{ path: 'lib.ts', status: 'modified', patch: '@@ -5,3 +5,0 @@\n-a\n-b\n-c\n' }], base: BASE, head: new Map() });
    expect(names(r)).toEqual(['+lib.ts#bar']);
  });

  it('no patch => the whole file counts as changed (legacy path); bare v1 method rows are not graph keys', () => {
    const base = new Map([['c.ts', [d('<module>', 1, 9, 'module'), d('C', 1, 9, 'class'), d('C.m', 2, 4, 'method'), d('m', 2, 4, 'method')]]]);
    const r = computeChangedSymbols({ files: [{ path: 'c.ts' }], base, head: new Map() });
    expect(names(r)).toEqual(['+c.ts#<module>', '+c.ts#C', '+c.ts#C.m']);
  });

  it('only the tightest declaration is reported (method, not its class)', () => {
    const base = new Map([['c.ts', [d('C', 1, 9, 'class'), d('C.m', 2, 4, 'method')]]]);
    const head = base;
    const r = computeChangedSymbols({ files: [{ path: 'c.ts', status: 'modified', patch: '@@ -3 +3 @@\n-a\n+b\n' }], base, head });
    expect(names(r)).toEqual(['+c.ts#C.m']);
  });
});

// Regression (found in the browser smoke on burnjohn/quick-blog PR #24):
// package-lock.json and workflow YAML showed up as changed `<module>` nodes.
describe('computeChangedSymbols — non-code files', () => {
  it('yields no changed node for lockfiles, YAML, docs or assets', () => {
    const out = computeChangedSymbols({
      files: [
        { path: 'client/package-lock.json', status: 'modified', patch: '@@ -1,2 +1,2 @@\n-a\n+b\n' },
        { path: '.github/workflows/ci.yml', status: 'removed', patch: '@@ -1 +0,0 @@\n-x\n' },
        { path: 'README.md', status: 'added', patch: '@@ -0,0 +1 @@\n+x\n' },
        { path: 'src/logo.svg', status: 'modified', patch: null },
      ],
      base: new Map(),
      head: new Map(),
    });
    expect(out).toEqual([]);
  });

  it('still tracks a code file renamed from a non-code extension and vice versa', () => {
    const out = computeChangedSymbols({
      files: [{ path: 'src/a.json', previousPath: 'src/a.ts', status: 'renamed', patch: null }],
      base: new Map([['src/a.ts', [{ name: 'foo', kind: 'function', line: 1, endLine: 3 }]]]),
      head: new Map(),
    });
    expect(out.map((c) => [c.path, c.name, c.deleted])).toEqual([['src/a.ts', 'foo', true]]);
  });
});
