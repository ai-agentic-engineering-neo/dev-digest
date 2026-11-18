import { describe, expect, it } from 'vitest';
import { build } from './graph-test-utils.js';

const bindingOf = (g: ReturnType<typeof build>['graph'], file: string, local: string) =>
  g.bindings.find((b) => b.file === file && b.localName === local)!.binding;

describe('binding resolution (AC-8)', () => {
  it('resolves renamed, default, anonymous-default, namespace and type-only imports', () => {
    const { graph } = build({
      'lib.ts': `export function a() {}\nexport default class Main {}\nexport interface T { x: 1 }`,
      'anon.ts': `export default function () {}`,
      'use.ts': `import { a as b } from './lib';\nimport Main from './lib';\nimport Anon from './anon';\nimport * as ns from './lib';\nimport type { T } from './lib';\nimport { type T as T2 } from './lib';\nb(); new Main(); Anon(); ns.a(); let t: T; let t2: T2;`,
    });
    expect(bindingOf(graph, 'use.ts', 'b')).toMatchObject({ kind: 'symbol', file: 'lib.ts', symbol: 'a' });
    expect(bindingOf(graph, 'use.ts', 'Main')).toMatchObject({ kind: 'symbol', file: 'lib.ts', symbol: 'Main', symbolKind: 'class' });
    expect(bindingOf(graph, 'use.ts', 'Anon')).toMatchObject({ kind: 'symbol', file: 'anon.ts', symbol: 'default' });
    expect(bindingOf(graph, 'use.ts', 'ns')).toEqual({ kind: 'namespace', file: 'lib.ts' });
    expect(bindingOf(graph, 'use.ts', 'T')).toMatchObject({ kind: 'symbol', symbol: 'T' });
    expect(bindingOf(graph, 'use.ts', 'T2')).toMatchObject({ kind: 'symbol', symbol: 'T' });
    expect(graph.bindings.filter((b) => b.isType).map((b) => b.localName).sort()).toEqual(['T', 'T2']);
  });

  it('follows a barrel chain (named, renamed, export *) to the declaring symbol', () => {
    const { graph } = build({
      'core.ts': `export function foo() {}\nexport function bar() {}`,
      'mid.ts': `export { foo as renamed } from './core';\nexport * from './core';`,
      'index.ts': `export * from './mid';`,
      'use.ts': `import { renamed, bar } from './index';\nrenamed(); bar();`,
    });
    expect(bindingOf(graph, 'use.ts', 'renamed')).toMatchObject({ kind: 'symbol', file: 'core.ts', symbol: 'foo' });
    expect(bindingOf(graph, 'use.ts', 'bar')).toMatchObject({ kind: 'symbol', file: 'core.ts', symbol: 'bar' });
  });

  it('binds an import that the importing barrel re-exports locally', () => {
    const { graph } = build({
      'core.ts': `export const k = 1;`,
      'barrel.ts': `import { k } from './core';\nexport { k };`,
      'use.ts': `import { k } from './barrel';\nconsole.log(k);`,
    });
    expect(bindingOf(graph, 'use.ts', 'k')).toMatchObject({ kind: 'symbol', file: 'core.ts', symbol: 'k' });
    expect(graph.edges).toContainEqual(expect.objectContaining({ fromPath: 'barrel.ts', fromName: '<module>', toPath: 'core.ts', toName: 'k', kind: 're-export' }));
  });

  it('resolves `export * as ns` to a namespace and lets ns.member bind exactly', () => {
    const { graph } = build({
      'core.ts': `export function foo() {}`,
      'barrel.ts': `export * as core from './core';`,
      'use.ts': `import { core } from './barrel';\ncore.foo();`,
    });
    expect(bindingOf(graph, 'use.ts', 'core')).toEqual({ kind: 'namespace', file: 'core.ts' });
    expect(graph.edges).toContainEqual(expect.objectContaining({ fromPath: 'use.ts', toPath: 'core.ts', toName: 'foo', kind: 'call', confidence: 'exact' }));
  });

  it('marks a name exported by two `export *` sources as ambiguous; the same declaration via a diamond is not', () => {
    const { graph } = build({
      'a.ts': `export const dup = 1;\nexport const only = 1;`,
      'b.ts': `export const dup = 2;`,
      'base.ts': `export const shared = 1;`,
      'l.ts': `export * from './base';`,
      'r.ts': `export * from './base';`,
      'barrel.ts': `export * from './a';\nexport * from './b';\nexport * from './l';\nexport * from './r';`,
      'use.ts': `import { dup, only, shared } from './barrel';`,
    });
    expect(bindingOf(graph, 'use.ts', 'dup')).toMatchObject({ kind: 'unresolved', reason: 'ambiguous' });
    expect(bindingOf(graph, 'use.ts', 'only')).toMatchObject({ kind: 'symbol', file: 'a.ts' });
    expect(bindingOf(graph, 'use.ts', 'shared')).toMatchObject({ kind: 'symbol', file: 'base.ts' });
    const row = graph.imports.find((i) => i.localName === 'dup')!;
    expect(row).toMatchObject({ unresolvedReason: 'ambiguous', resolvedFile: 'barrel.ts' });
    expect(graph.coverage.unresolvedByReason).toMatchObject({ ambiguous: 1 });
  });

  it('terminates on a re-export cycle with reason `cycle`', () => {
    const { graph } = build({
      'a.ts': `export { x } from './b';`,
      'b.ts': `export { x } from './a';`,
      'star1.ts': `export * from './star2';`,
      'star2.ts': `export * from './star1';`,
      'use.ts': `import { x } from './a';\nimport { y } from './star1';`,
    });
    expect(bindingOf(graph, 'use.ts', 'x')).toMatchObject({ kind: 'unresolved', reason: 'cycle' });
    expect(bindingOf(graph, 'use.ts', 'y')).toMatchObject({ kind: 'unresolved', reason: 'cycle' });
  });

  it('reports external / builtin / missing / non-literal distinctly and still resolves file edges', () => {
    const { graph } = build({
      'x.ts': `import fs from 'node:fs';\nimport z from 'zod';\nimport { m } from './nope';\nconst d = await import(path);\nexport const q = 1;`,
    });
    const reasons = Object.fromEntries(graph.imports.map((i) => [i.specifier || '<dyn>', i.unresolvedReason]));
    expect(reasons).toMatchObject({ 'node:fs': 'builtin', zod: 'external', './nope': 'missing', '<dyn>': 'non_literal' });
    expect(graph.coverage.unresolvedBySpecifier).toBe(2);
  });

  it('reports a name missing from a resolved file as `missing` with the file recorded', () => {
    const { graph } = build({ 'a.ts': `export const x = 1;`, 'u.ts': `import { nope } from './a';` });
    expect(graph.imports[0]).toMatchObject({ resolvedFile: 'a.ts', unresolvedReason: 'missing' });
  });
});
