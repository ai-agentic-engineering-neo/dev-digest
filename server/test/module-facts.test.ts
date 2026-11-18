import { describe, it, expect } from 'vitest';

import { parseModuleFacts, MODULE_SYMBOL } from '../src/adapters/astgrep/module-facts.js';

const facts = (src: string, file = 'src/x.ts') => parseModuleFacts(file, src);

describe('parseModuleFacts — imports', () => {
  it('builds the binding table for every static form', () => {
    const f = facts(`
import def from './a';
import * as ns from './b';
import { x, y as z } from './c';
import type { T } from './d';
import { type U, v } from './e';
import './side';
import legacy = require('./f');
`);
    const by = (l: string | null, s: string) => f.imports.find((i) => i.localName === l && i.specifier === s)!;
    expect(by('def', './a')).toMatchObject({ importedName: 'default', isType: false, kind: 'static', line: 2 });
    expect(by('ns', './b')).toMatchObject({ importedName: '*' });
    expect(by('z', './c')).toMatchObject({ importedName: 'y', isType: false });
    expect(by('x', './c')).toMatchObject({ importedName: 'x' });
    expect(by('T', './d')).toMatchObject({ importedName: 'T', isType: true });
    expect(by('U', './e').isType).toBe(true);
    expect(by('v', './e').isType).toBe(false);
    expect(by(null, './side')).toMatchObject({ importedName: null, kind: 'static' });
    expect(by('legacy', './f')).toMatchObject({ kind: 'require', importedName: '*' });
  });

  it('records literal dynamic import and require with kind', () => {
    const f = facts(`
const m = await import('./dyn');
const { a, b: c } = require('./req');
import('./bare');
`);
    expect(f.imports.find((i) => i.specifier === './dyn')).toMatchObject({ kind: 'dynamic', localName: 'm', importedName: '*', nonLiteral: false });
    expect(f.imports.find((i) => i.localName === 'c')).toMatchObject({ kind: 'require', importedName: 'b', specifier: './req' });
    expect(f.imports.find((i) => i.localName === 'a')).toMatchObject({ importedName: 'a' });
    expect(f.imports.find((i) => i.specifier === './bare')).toMatchObject({ kind: 'dynamic', localName: null });
  });

  it('records non-literal dynamic/require as unresolvable', () => {
    const f = facts('const n = "x";\nimport(n);\nrequire("./a" + n);\nimport(`./t/${n}`);\n');
    const bad = f.imports.filter((i) => i.nonLiteral);
    expect(bad).toHaveLength(3);
    expect(bad.every((i) => i.specifier === null)).toBe(true);
    expect(bad.map((i) => i.kind).sort()).toEqual(['dynamic', 'dynamic', 'require']);
  });

  it('treats a substitution-free template literal as a literal specifier', () => {
    expect(facts('import(`./lit`);').imports[0]).toMatchObject({ specifier: './lit', nonLiteral: false });
  });
});

describe('parseModuleFacts — exports', () => {
  it('covers local, aliased, re-export, star, namespace and default forms', () => {
    const f = facts(`
export function fn() {}
export const k = 1, k2 = 2;
export enum E { A }
export interface I {}
const a = 1;
export { a as b };
export { r1, r2 as r3 } from './m';
export type { RT } from './m';
export * from './all';
export * as nsx from './nsmod';
export { z as default };
`);
    const ex = (n: string) => f.exports.find((e) => e.exportedName === n)!;
    expect(ex('fn')).toMatchObject({ kind: 'local', localName: 'fn' });
    expect(ex('k')).toMatchObject({ kind: 'local' });
    expect(ex('k2')).toMatchObject({ kind: 'local' });
    expect(ex('E')).toMatchObject({ kind: 'local', isType: false });
    expect(ex('I')).toMatchObject({ kind: 'local', isType: true });
    expect(ex('b')).toMatchObject({ kind: 'local', localName: 'a' });
    expect(ex('r1')).toMatchObject({ kind: 'reexport', specifier: './m', localName: 'r1' });
    expect(ex('r3')).toMatchObject({ kind: 'reexport', localName: 'r2' });
    expect(ex('RT')).toMatchObject({ kind: 'reexport', isType: true });
    expect(ex('*')).toMatchObject({ kind: 'reexport_all', specifier: './all' });
    expect(ex('nsx')).toMatchObject({ kind: 'namespace', specifier: './nsmod' });
    expect(ex('default')).toMatchObject({ kind: 'default', localName: 'z' });
  });

  it('names an anonymous default export with the default pseudo-symbol', () => {
    const arrow = facts('export default async () => 1;\n');
    expect(arrow.exports[0]).toMatchObject({ exportedName: 'default', kind: 'default', localName: 'default' });
    expect(arrow.symbols.find((s) => s.name === 'default')).toMatchObject({ kind: 'function', exported: true });

    const fn = facts('export default function () {}\n');
    expect(fn.symbols.some((s) => s.name === 'default')).toBe(true);
    const cls = facts('export default class {}\n');
    expect(cls.symbols.find((s) => s.name === 'default')?.kind).toBe('class');
  });

  it('keeps the declared name for named default exports and identifier defaults', () => {
    const f = facts('export default function named() {}\n');
    expect(f.exports[0]).toMatchObject({ kind: 'default', localName: 'named' });
    expect(f.symbols.some((s) => s.name === 'named')).toBe(true);
    expect(f.symbols.some((s) => s.name === 'default')).toBe(false);
    const g = facts('function q() {}\nexport default q;\n');
    expect(g.exports[0]).toMatchObject({ localName: 'q' });
    expect(g.symbols.find((s) => s.name === 'q')?.exported).toBe(true);
  });
});

describe('parseModuleFacts — symbols', () => {
  it('adds exported const/let/var and enum, skips unexported plain values', () => {
    const f = facts(`
export const A = 1;
export let B = 2;
export var C = 3;
const hidden = 4;
export enum Color { RED }
export const fn = () => 1;
`);
    const kind = (n: string) => f.symbols.find((s) => s.name === n)?.kind;
    expect(kind('A')).toBe('const');
    expect(kind('B')).toBe('const');
    expect(kind('C')).toBe('const');
    expect(kind('hidden')).toBeUndefined();
    expect(kind('Color')).toBe('enum');
    expect(kind('fn')).toBe('function');
  });

  it('collapses overloads and merging, keys methods as Class.method, no bare dupes', () => {
    const f = facts(`
export function o(a: string): void;
export function o(a: number): void;
export function o(a: any): void {}
export interface M { a: string }
export interface M { b: number; call(): void }
export class K {
  run(): void {}
  run(x: number): void;
}
`);
    expect(f.symbols.filter((s) => s.name === 'o')).toHaveLength(1);
    expect(f.symbols.filter((s) => s.name === 'M')).toHaveLength(1);
    expect(f.symbols.map((s) => s.name)).toContain('K.run');
    expect(f.symbols.map((s) => s.name)).not.toContain('run');
    expect(f.symbols.map((s) => s.name)).toContain('M.call'); // interface member
  });

  it('adds a <module> pseudo-symbol spanning the file', () => {
    const f = facts('const a = 1;\n\n\nexport const b = 2;\n');
    const m = f.symbols.find((s) => s.name === MODULE_SYMBOL)!;
    expect(m).toMatchObject({ kind: 'module', line: 1 });
    expect(m.endLine).toBeGreaterThanOrEqual(4);
  });

  it('collects abstract classes and ambient declarations', () => {
    const f = facts('export abstract class Base { m(): void {} }\nexport declare function dec(): void;\n');
    expect(f.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['Base', 'Base.m', 'dec']));
  });
});

describe('parseModuleFacts — references', () => {
  const src = `
import { dep, Dep, ns2 } from './d';
import * as ns from './n';
interface Local {}
class Base {}
export class Child extends Base implements Local {
  svc!: Dep;
  go(x: ns.Shape): number {
    ns.fn();
    this.svc.run();
    return dep(x) + ns2.k;
  }
}
const top = dep;
`;
  const f = facts(src);
  const find = (kind: string, name: string) => f.references.find((r) => r.kind === kind && r.name === name);

  it('types every reference kind with 1-based lines', () => {
    expect(find('call', 'dep')).toMatchObject({ line: 11, receiver: null });
    expect(find('type', 'Dep')).toMatchObject({ line: 7 });
    expect(find('extends', 'Base')).toMatchObject({ line: 6 });
    expect(find('implements', 'Local')).toMatchObject({ line: 6 });
    expect(find('value', 'dep')).toMatchObject({ line: 14, enclosing: MODULE_SYMBOL });
  });

  it('emits namespace and member references as qualified', () => {
    expect(find('type', 'Shape')).toMatchObject({ receiver: 'ns' });
    expect(find('member', 'fn')).toMatchObject({ receiver: 'ns', prop: 'fn', isCall: true, line: 9 });
    expect(find('member', 'run')).toMatchObject({ receiver: 'this.svc', isCall: true });
    expect(find('member', 'k')).toMatchObject({ receiver: 'ns2', isCall: false });
  });

  it('attributes references to the tightest enclosing declaration', () => {
    expect(find('call', 'dep')!.enclosing).toBe('Child.go');
    expect(find('extends', 'Base')!.enclosing).toBe('Child');
    expect(find('type', 'Dep')!.enclosing).toBe('Child');
  });

  it('does not count imports, declaration names or parameters as references', () => {
    const g = facts("import { a } from './a';\nexport function f(p: number) { return p; }\n");
    expect(g.references.filter((r) => r.name === 'a')).toHaveLength(0);
    expect(g.references.filter((r) => r.name === 'f')).toHaveLength(0);
  });

  it('handles qualified extends and JSX components (tsx)', () => {
    const g = parseModuleFacts('src/c.tsx', "import * as m from './m';\nclass A extends m.Base {}\nexport const V = () => <Foo.Bar a={x} />;\n");
    expect(g.references.find((r) => r.kind === 'extends')).toMatchObject({ name: 'Base', receiver: 'm' });
    const h = parseModuleFacts('src/c.tsx', "import { Foo } from './f';\nexport const V = () => <div><Foo /></div>;\n");
    expect(h.references.find((r) => r.name === 'Foo')).toMatchObject({ kind: 'value' });
    expect(h.references.find((r) => r.name === 'div')).toBeUndefined();
  });
});

describe('parseModuleFacts — .d.ts and edge cases', () => {
  it('emits type references only for .d.ts', () => {
    const f = facts(
      "import { T, v } from './t';\nexport declare const x: T;\nexport declare function f(a: T): T;\nexport default v;\ndeclare class C extends T {}\n",
      'types/a.d.ts',
    );
    expect(f.references.length).toBeGreaterThan(0);
    expect(f.references.every((r) => r.kind === 'type')).toBe(true);
    expect(f.references.some((r) => r.name === 'v')).toBe(false);
    expect(f.symbols.map((s) => s.name)).toContain('f');
  });

  it('returns empty facts for unsupported extensions and empty source', () => {
    expect(parseModuleFacts('readme.md', '# hi')).toEqual({ imports: [], exports: [], symbols: [], references: [] });
    const e = parseModuleFacts('a.ts', '');
    expect(e.imports).toEqual([]);
    expect(e.symbols.map((s) => s.name)).toEqual([MODULE_SYMBOL]);
  });

  it('is tolerant of syntax errors', () => {
    expect(() => facts("import { a from './x';\nexport function (\n")).not.toThrow();
  });
});

// Regression: the JS grammars have no `interface_declaration`; asking for it
// threw, so every .js/.jsx file fell into parse-degraded on a real repo.
describe('parseModuleFacts — JavaScript files', () => {
  const JS = `
import React from 'react';
import Foo, { bar } from '.';
const helper = require('./helper');
export const VALUE = 1;
export default function App() { return <Foo onClick={() => bar(helper.x())} />; }
class Svc { make() { return this.make(); } }
export { Svc };
`;
  for (const file of ['src/App.jsx', 'src/App.js', 'src/App.mjs', 'src/App.cjs']) {
    it(`parses ${file} without throwing and keeps imports, exports and symbols`, () => {
      const facts = parseModuleFacts(file, JS);
      expect(facts.imports.map((i) => i.specifier)).toEqual(expect.arrayContaining(['react', '.', './helper']));
      expect(facts.exports.map((e) => e.exportedName)).toEqual(expect.arrayContaining(['VALUE', 'default', 'Svc']));
      expect(facts.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['App', 'Svc', 'Svc.make', MODULE_SYMBOL]));
    });
  }
});

// Regression: a plain value declared without `export` and exported later
// (`export default X` / `export { X }`) must still be a symbol, or every
// importer's binding dangles (found on a real Express/Mongoose repo).
describe('parseModuleFacts — late-exported plain values', () => {
  it('turns `const X = …; export default X` and `export { Y }` into exported const symbols', () => {
    const facts = parseModuleFacts('src/models/Comment.js', `
import mongoose from 'mongoose';
const schema = new mongoose.Schema({});
const Comment = mongoose.model('Comment', schema);
let Other = 1;
export default Comment;
export { Other };
`);
    const byName = new Map(facts.symbols.map((s) => [s.name, s]));
    expect(byName.get('Comment')).toMatchObject({ kind: 'const', exported: true });
    expect(byName.get('Other')).toMatchObject({ kind: 'const', exported: true });
    expect(byName.has('schema')).toBe(false);
  });
});
