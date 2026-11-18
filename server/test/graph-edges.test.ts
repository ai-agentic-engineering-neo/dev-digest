import { describe, expect, it } from 'vitest';
import { build, edgeStrs } from './graph-test-utils.js';

describe('symbol edges (AC-9…AC-13)', () => {
  it('creates exact call/value edges via import bindings, attributed to the enclosing symbol', () => {
    const { graph } = build({
      'lib.ts': `export function f() {}\nexport const C = 1;`,
      'u.ts': `import { f as g, C } from './lib';\nexport function run() { g(); return C; }\ng();`,
    });
    expect(edgeStrs(graph)).toEqual([
      'u.ts#<module> -call/exact-> lib.ts#f',
      'u.ts#run -call/exact-> lib.ts#f',
      'u.ts#run -value/exact-> lib.ts#C',
    ]);
  });

  it('M4: `x.get()` with an unrelated imported `get` produces NO exact edge', () => {
    const { graph } = build({
      'util.ts': `export function get() {}`,
      'u.ts': `import { get as fetchIt } from './util';\nexport function run(x: any) { x.get(); }`,
    });
    expect(graph.edges.filter((e) => e.fromName === 'run')).toEqual([]);
    expect(graph.edges.some((e) => e.confidence === 'exact' && e.toName === 'get')).toBe(false);
  });

  it('a same-file declaration named like a member is not matched by `x.m`', () => {
    const { graph } = build({ 'u.ts': `function get() {}\nexport function run(x: any) { x.get(); }` });
    expect(graph.edges).toEqual([]);
  });

  it('infers an injected-instance member call only when exactly one bound class has that method', () => {
    const { graph } = build({
      'svc.ts': `export class Mailer { send() {} other() {} }`,
      'svc2.ts': `export class Pager { other() {} }`,
      'u.ts': `import { Mailer } from './svc';\nimport { Pager } from './svc2';\nexport class Ctl { constructor(private m: Mailer, private p: Pager) {} go() { this.m.send(); this.p.other(); } }`,
    });
    const u = graph.edges.filter((e) => e.fromPath === 'u.ts');
    expect(u).toContainEqual(expect.objectContaining({ fromName: 'Ctl.go', toPath: 'svc.ts', toName: 'Mailer.send', kind: 'call', confidence: 'inferred' }));
    // `other` exists on two bound classes ⇒ unresolved
    expect(u.some((e) => e.toName.endsWith('.other'))).toBe(false);
    expect(graph.coverage.inferredShare).toBeGreaterThan(0);
    const r = graph.referencesDeclFile.find((x) => x.name === 'other')!;
    expect(r).toMatchObject({ declFile: null, via: 'unresolved' });
    expect(graph.referencesDeclFile.find((x) => x.name === 'send')).toMatchObject({ declFile: 'svc.ts', via: 'inferred' });
  });

  it('does not infer from classes that are neither imported nor declared in the file', () => {
    const { graph } = build({
      'svc.ts': `export class Mailer { send() {} }`,
      'u.ts': `export function run(x: any) { x.send(); }`,
    });
    expect(graph.edges).toEqual([]);
  });

  it('infers over a same-file class/interface member and edges the receiver binding exactly (`Svc.make()`)', () => {
    const { graph } = build({
      'svc.ts': `export class Svc { static make() {} }`,
      'u.ts': `import { Svc } from './svc';\nexport function run() { Svc.make(); }`,
    });
    expect(edgeStrs(graph)).toEqual(['u.ts#run -call/inferred-> svc.ts#Svc.make', 'u.ts#run -value/exact-> svc.ts#Svc']);
  });

  it('namespace `ns.fn()` / `ns.T` are exact, not member-call inference', () => {
    const { graph } = build({
      'lib.ts': `export function fn() {}\nexport interface T {}\nexport class Other { fn() {} }`,
      'u.ts': `import * as ns from './lib';\nexport function run(a: ns.T) { ns.fn(); }`,
    });
    expect(edgeStrs(graph)).toEqual(['u.ts#run -call/exact-> lib.ts#fn', 'u.ts#run -type/exact-> lib.ts#T']);
  });

  it('records type-position, extends and implements edges apart from runtime edges', () => {
    const { graph } = build({
      'm.ts': `export interface I {}\nexport class Base {}\nexport type Opts = {};`,
      'u.ts': `import type { I, Opts } from './m';\nimport { Base } from './m';\nexport class D extends Base implements I { opt: Opts = {}; }`,
    });
    const kinds = Object.fromEntries(graph.edges.map((e) => [e.toName, e.kind]));
    expect(kinds).toMatchObject({ I: 'implements', Base: 'extends', Opts: 'type' });
  });

  it('records same-file declaration references as exact; module-scope refs use <module>', () => {
    const { graph } = build({
      'u.ts': `function helper() {}\nexport function a() { helper(); }\nhelper();`,
    });
    expect(edgeStrs(graph)).toEqual(['u.ts#<module> -call/exact-> u.ts#helper', 'u.ts#a -call/exact-> u.ts#helper']);
  });

  it('skips self references (recursion)', () => {
    const { graph } = build({ 'u.ts': `export function r(n: number): number { return r(n - 1); }` });
    expect(graph.edges).toEqual([]);
  });

  it('re-export statements become re-export edges; `export *` targets the module pseudo-symbol', () => {
    const { graph } = build({
      'core.ts': `export function foo() {}`,
      'barrel.ts': `export { foo } from './core';\nexport * from './core';`,
    });
    expect(edgeStrs(graph)).toEqual(['barrel.ts#<module> -re-export/exact-> core.ts#<module>', 'barrel.ts#<module> -re-export/exact-> core.ts#foo']);
  });

  it('an alias-only importer still gets a file edge', () => {
    const { graph } = build({ 'src/lib/a.ts': `export const a = 1;`, 'app/u.ts': `import { a } from '@/lib/a';\nconsole.log(a);` });
    expect(graph.fileEdges).toEqual([{ from: 'app/u.ts', to: 'src/lib/a.ts' }]);
    expect(graph.edges).toHaveLength(1);
  });

  it('file edges include side-effect imports and re-exports, dedupe, and skip externals/self', () => {
    const { graph } = build({
      'a.ts': `export const a = 1;`,
      'b.ts': `import './a';\nimport { a } from './a';\nimport z from 'zod';\nexport * from './a';`,
    });
    expect(graph.fileEdges).toEqual([{ from: 'b.ts', to: 'a.ts' }]);
  });

  it('overloads target the one logical symbol once', () => {
    const { graph } = build({
      'lib.ts': `export function f(a: string): void;\nexport function f(a: number): void;\nexport function f(a: any) {}`,
      'u.ts': `import { f } from './lib';\nf('x');`,
    });
    expect(graph.symbols.filter((s) => s.file === 'lib.ts' && s.name === 'f')).toHaveLength(1);
    expect(edgeStrs(graph)).toEqual(['u.ts#<module> -call/exact-> lib.ts#f']);
  });

  it('.d.ts files: type edges only', () => {
    const { graph } = build({
      'types.d.ts': `export interface Cfg { a: 1 }`,
      'api.d.ts': `import { Cfg } from './types';\nexport declare function load(c: Cfg): void;`,
    });
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.edges.every((e) => e.kind === 'type')).toBe(true);
  });

  it('referencesDeclFile: exact → declaring file, external → via external, unknown → unresolved', () => {
    const { graph } = build({
      'lib.ts': `export function f() {}`,
      'u.ts': `import { f } from './lib';\nimport { z } from 'zod';\nf(); z(); ghost();`,
    });
    const by = Object.fromEntries(graph.referencesDeclFile.map((r) => [r.name, r]));
    expect(by.f).toMatchObject({ declFile: 'lib.ts', via: 'exact' });
    expect(by.z).toMatchObject({ declFile: null, via: 'external' });
    expect(by.ghost).toMatchObject({ declFile: null, via: 'unresolved' });
  });
});

describe('named export of an undeclared, un-imported local', () => {
  it('records unresolved `missing` instead of an edge to a non-existent (file, x)', () => {
    const { graph } = build({
      'm.ts': `export { ghost };\nexport function real() {}`,
      'u.ts': `import { ghost, real } from './m';\nexport function run() { ghost(); real(); }`,
    });
    // only the real symbol is edged; nothing points at m.ts#ghost
    expect(edgeStrs(graph).filter((e) => e.includes('ghost'))).toEqual([]);
    expect(edgeStrs(graph)).toContain('u.ts#run -call/exact-> m.ts#real');
    expect(graph.referencesDeclFile.find((r) => r.name === 'ghost')).toMatchObject({ declFile: null, via: 'unresolved' });
    // counted as an unresolved value binding in coverage
    expect(graph.coverage.value.total).toBe(2);
    expect(graph.coverage.value.resolved).toBe(1);
    expect(graph.coverage.unresolvedByReason?.missing).toBeGreaterThanOrEqual(1);
  });
});
