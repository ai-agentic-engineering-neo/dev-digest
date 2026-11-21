/**
 * PR overlay for blast reads (plan 19 / P2-B; AC-25a…f): fake git + the REAL
 * parser and resolver, driven through `RepoIntelService.getBlastGraph` with a
 * fake repository that serves a base index built by the real graph core.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseModuleFacts } from '../src/adapters/astgrep/module-facts.js';
import { TsModuleResolverFactory } from '../src/adapters/tsresolve/index.js';
import { MAX_FILE_SIZE, MAX_OVERLAY_FILES, INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import { buildGraph, type ParsedModule } from '../src/modules/repo-intel/graph/index.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { BlastRequest, IndexState } from '../src/modules/repo-intel/types.js';
import { readTextIn } from './depgraph-fixture-utils.js';

const SHA_INDEXED = 'a'.repeat(40);
const SHA_HEAD = 'b'.repeat(40);
const TSCONFIG = JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } });

const LIB = ['export function foo(): number {', '  return 1;', '}', '', 'export function bar(): number {', '  return 2;', '}', ''].join('\n');
const USER = [
  "import { foo, bar } from './lib';",
  'export function useFoo(): number { return foo(); }',
  'export function useBar(): number { return bar(); }',
  '',
].join('\n');
const ALIAS_BASE = 'export const x = 1;\n';
const ALIAS_HEAD = "import { foo } from '@/lib';\nexport function viaAlias(): number { return foo(); }\n";

interface Harness {
  svc: RepoIntelService;
  git: { heads: Map<string, string | null>; hasObjectCalls: number; fetchCalls: number; headPresent: boolean; presentAfterFetch: boolean; reads: string[] };
  req: (files: BlastRequest['files'], extra?: Partial<BlastRequest>) => BlastRequest;
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'graph-overlay-'));
  writeFileSync(join(root, 'tsconfig.json'), TSCONFIG);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function harness(base: Record<string, string>, opts: { state?: Partial<IndexState> } = {}): Harness {
  const modules: ParsedModule[] = Object.entries(base).map(([path, src]) => ({ path, facts: parseModuleFacts(path, src) }));
  const resolver = new TsModuleResolverFactory().create({
    root,
    files: new Set([...Object.keys(base), 'tsconfig.json']),
    readText: readTextIn(root),
  });
  const graph = buildGraph(modules, resolver);

  const git = { heads: new Map<string, string | null>(), hasObjectCalls: 0, fetchCalls: 0, headPresent: true, presentAfterFetch: false, reads: [] as string[] };
  const fakeGit = {
    hasObject: async () => {
      git.hasObjectCalls += 1;
      return git.headPresent;
    },
    fetchPullHead: async () => {
      git.fetchCalls += 1;
      if (git.presentAfterFetch) git.headPresent = true;
    },
    readFileAtRef: async (_r: unknown, _sha: string, path: string, max: number) => {
      git.reads.push(path);
      const src = git.heads.get(path);
      if (src === undefined || src === null) return null;
      return Buffer.byteLength(src) > max ? null : src;
    },
  };
  const state: IndexState = {
    repoId: 'r1',
    status: 'full',
    filesIndexed: modules.length,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: SHA_INDEXED,
    indexerVersion: INDEXER_VERSION,
    updatedAt: new Date(0),
    coverage: null,
    reindexing: null,
    ...opts.state,
  };
  const fakeRepo = {
    tryGetIndexState: async () => state,
    getRepoBasics: async () => ({ id: 'r1', owner: 'acme', name: 'w', defaultBranch: 'main', clonePath: root }),
    getSymbolRows: async (_id: string, paths: string[]) =>
      graph.symbols.filter((s) => paths.includes(s.file)).map((s) => ({ path: s.file, name: s.name, kind: s.kind, line: s.line, endLine: s.endLine, exported: s.exported, signature: s.signature })),
    getIndexedFilePaths: async () => new Set(Object.keys(base)),
    getGraphContext: async () => ({
      imports: graph.imports,
      exports: graph.exports,
      symbols: graph.symbols.map((s) => ({ path: s.file, name: s.name, kind: s.kind, line: s.line, endLine: s.endLine, exported: s.exported, signature: s.signature })),
    }),
    getIncomingEdges: async (_id: string, targets: Array<{ path: string; name: string }>) =>
      graph.edges.filter((e) => targets.some((t) => t.path === e.toPath && t.name === e.toName)),
    getFileFacts: async () => [],
    getFileRankValues: async () => new Map(),
  };
  const svc = new RepoIntelService(fakeRepo as never, {
    repoIntelEnabled: true,
    git: fakeGit as never,
    resolver: new TsModuleResolverFactory(),
  } as never);
  return {
    svc,
    git,
    req: (files, extra = {}) => ({ headSha: SHA_HEAD, baseSha: SHA_INDEXED, prNumber: 7, files, ...extra }),
  };
}

const BASE = { 'src/lib.ts': LIB, 'src/user.ts': USER, 'src/alias.ts': ALIAS_BASE };
const nodeIds = (r: { graph: { nodes: Array<{ id: string; role: string }> } }, role: string): string[] =>
  r.graph.nodes.filter((n) => n.role === role).map((n) => n.id).sort();

describe('overlay — changed symbols from head', () => {
  it('modified body: head hunk ∩ head declaration => changed, dependents impacted, overlay clean', async () => {
    const h = harness(BASE);
    h.git.heads.set('src/lib.ts', LIB.replace('return 1;', 'return 11;'));
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-  return 1;\n+  return 11;\n' }]));
    expect(nodeIds(r, 'changed')).toEqual(['src/lib.ts#foo']);
    expect(nodeIds(r, 'impacted')).toEqual(['src/user.ts#useFoo']);
    expect(r.overlay).toMatchObject({ staleOverlay: false, overlayDegraded: false, degradedCount: 0, headSha: SHA_HEAD, baseSha: SHA_INDEXED, indexedSha: SHA_INDEXED });
    expect(r.index).toMatchObject({ status: 'full', lowConfidence: false });
  });

  it('added symbol is changed; deleted symbol is flagged deleted and its callers are still impacted', async () => {
    const h = harness(BASE);
    const head = LIB.split('\n').slice(0, 3).join('\n') + '\n\nexport function baz(): number {\n  return 3;\n}\n';
    h.git.heads.set('src/lib.ts', head);
    const patch = '@@ -4,4 +4,4 @@\n \n-export function bar(): number {\n-  return 2;\n-}\n+export function baz(): number {\n+  return 3;\n+}\n';
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'modified', patch }]));
    expect(nodeIds(r, 'changed')).toEqual(['src/lib.ts#bar', 'src/lib.ts#baz']);
    expect(r.graph.nodes.find((n) => n.id === 'src/lib.ts#bar')?.deleted).toBe(true);
    expect(r.graph.nodes.find((n) => n.id === 'src/lib.ts#baz')?.deleted).toBeUndefined();
    expect(nodeIds(r, 'impacted')).toEqual(['src/user.ts#useBar']);
    expect(r.changed.filter((c) => c.deleted).map((c) => c.name)).toEqual(['bar']);
    // AC-42: head declaration line for overlay files, indexed line for the rest, none for deleted.
    const byId = new Map(r.graph.nodes.map((n) => [n.id, n]));
    expect(byId.get('src/lib.ts#baz')?.line).toBe(5);
    expect(byId.get('src/lib.ts#bar')?.line).toBeUndefined();
    expect(byId.get('src/user.ts#useBar')?.line).toBe(USER.split('\n').findIndex((l) => l.includes('useBar')) + 1);
  });

  it('moved symbol: deleted in the source file, added in the target file', async () => {
    const h = harness({ ...BASE, 'src/other.ts': 'export const keep = 1;\n' });
    h.git.heads.set('src/lib.ts', LIB.split('\n').slice(0, 3).join('\n') + '\n');
    h.git.heads.set('src/other.ts', 'export const keep = 1;\nexport function bar(): number {\n  return 2;\n}\n');
    const r = await h.svc.getBlastGraph(
      'r1',
      h.req([
        { path: 'src/lib.ts', status: 'modified', patch: '@@ -4,4 +3,0 @@\n-\n-export function bar(): number {\n-  return 2;\n-}\n' },
        { path: 'src/other.ts', status: 'modified', patch: '@@ -1,0 +2,3 @@\n+export function bar(): number {\n+  return 2;\n+}\n' },
      ]),
    );
    expect(nodeIds(r, 'changed')).toEqual(['src/lib.ts#bar', 'src/other.ts#bar']);
    expect(r.graph.nodes.find((n) => n.id === 'src/lib.ts#bar')?.deleted).toBe(true);
    expect(r.graph.nodes.find((n) => n.id === 'src/other.ts#bar')?.deleted).toBeUndefined();
  });

  it('deleted file: every persisted symbol is deleted; dependents impacted; no overlay edge targets it', async () => {
    const h = harness(BASE);
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'removed', patch: '@@ -1,8 +0,0 @@\n-x\n' }]));
    expect(r.graph.nodes.filter((n) => n.role === 'changed').every((n) => n.deleted === true)).toBe(true);
    expect(nodeIds(r, 'impacted')).toEqual(['src/user.ts#useBar', 'src/user.ts#useFoo']);
    expect(h.git.reads).toEqual([]); // nothing to read for a deleted file
  });

  it('renamed file: old path deleted, new path added', async () => {
    const h = harness(BASE);
    h.git.heads.set('src/lib2.ts', LIB);
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib2.ts', status: 'renamed', previousPath: 'src/lib.ts', patch: null }]));
    const changed = r.graph.nodes.filter((n) => n.role === 'changed');
    expect(changed.filter((n) => n.path === 'src/lib.ts').every((n) => n.deleted === true)).toBe(true);
    expect(changed.filter((n) => n.path === 'src/lib2.ts').map((n) => n.name).sort()).toEqual(['<module>', 'bar', 'foo']);
    expect(changed.filter((n) => n.path === 'src/lib2.ts').every((n) => !n.deleted)).toBe(true);
    // importers of the old path still point at deleted symbols
    expect(nodeIds(r, 'impacted')).toContain('src/user.ts#useFoo');
  });
});

describe('overlay — head-side graph and resolver', () => {
  it('json/tsconfig files are visible to the overlay resolver: an alias import added by the PR resolves', async () => {
    const h = harness(BASE);
    h.git.heads.set('src/alias.ts', ALIAS_HEAD);
    // foo is also changed so the alias caller has something to reach
    h.git.heads.set('src/lib.ts', LIB.replace('return 1;', 'return 11;'));
    const r = await h.svc.getBlastGraph(
      'r1',
      h.req([
        { path: 'src/alias.ts', status: 'modified', patch: '@@ -1 +1,2 @@\n-export const x = 1;\n+import { foo } from \'@/lib\';\n+export function viaAlias(): number { return foo(); }\n' },
        { path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-  return 1;\n+  return 11;\n' },
      ]),
    );
    // viaAlias is itself added by the PR (changed); the alias import made it a real caller of foo
    expect(r.graph.edges.some((e) => e.from === 'src/alias.ts#viaAlias' && e.to === 'src/lib.ts#foo')).toBe(true);
    expect(r.overlay.overlayDegraded).toBe(false);
  });

  it('the overlay replaces the changed file\'s own persisted edges (a call the PR removed disappears)', async () => {
    const h = harness(BASE);
    h.git.heads.set('src/user.ts', "import { foo } from './lib';\nexport function useFoo(): number { return foo(); }\nexport function useBar(): number { return 0; }\n");
    h.git.heads.set('src/lib.ts', LIB.replace('return 2;', 'return 22;'));
    const r2 = await h.svc.getBlastGraph(
      'r1',
      h.req([
        { path: 'src/user.ts', status: 'modified', patch: '@@ -1 +1 @@\n-import { foo, bar } from \'./lib\';\n+import { foo } from \'./lib\';\n@@ -3 +3 @@\n-export function useBar(): number { return bar(); }\n+export function useBar(): number { return 0; }\n' },
        { path: 'src/lib.ts', status: 'modified', patch: '@@ -6 +6 @@\n-  return 2;\n+  return 22;\n' },
      ]),
    );
    expect(nodeIds(r2, 'changed')).toContain('src/lib.ts#bar');
    // useBar no longer calls bar() at head => it is changed itself (body edited) but not an impacted caller of bar
    expect(r2.graph.edges.some((e) => e.from === 'src/user.ts#useBar' && e.to === 'src/lib.ts#bar')).toBe(false);
  });
});

describe('overlay — degradation (AC-25c…f)', () => {
  it('an oversize / unreadable head file is degraded: base-only data, listed, flagged', async () => {
    const h = harness(BASE);
    h.git.heads.set('src/lib.ts', 'x'.repeat(MAX_FILE_SIZE + 10));
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-  return 1;\n+  return 11;\n' }]));
    expect(r.overlay).toMatchObject({ overlayDegraded: true, degradedFiles: ['src/lib.ts'], degradedCount: 1 });
    // base-only: the removed line (base coords 2) still marks foo as changed, never deleted
    expect(nodeIds(r, 'changed')).toEqual(['src/lib.ts#foo']);
    expect(r.graph.nodes.find((n) => n.id === 'src/lib.ts#foo')?.deleted).toBeUndefined();
    expect(nodeIds(r, 'impacted')).toEqual(['src/user.ts#useFoo']);
  });

  it('a file that fails to parse is degraded too (not fatal)', async () => {
    const h = harness(BASE);
    h.git.heads.set('src/lib.ts', null); // missing at head
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-a\n+b\n' }]));
    expect(r.overlay.degradedFiles).toEqual(['src/lib.ts']);
  });

  it('missing head object: ONE fetch of the PR head, recheck, then every file degraded', async () => {
    const h = harness(BASE);
    h.git.headPresent = false;
    h.git.heads.set('src/lib.ts', LIB);
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-a\n+b\n' }]));
    expect(h.git.fetchCalls).toBe(1);
    expect(h.git.hasObjectCalls).toBe(2);
    expect(h.git.reads).toEqual([]);
    expect(r.overlay).toMatchObject({ overlayDegraded: true, degradedFiles: ['src/lib.ts'] });
  });

  it('missing head object that the fetch brings in is used normally', async () => {
    const h = harness(BASE);
    h.git.headPresent = false;
    h.git.presentAfterFetch = true;
    h.git.heads.set('src/lib.ts', LIB.replace('return 1;', 'return 11;'));
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-  return 1;\n+  return 11;\n' }]));
    expect(h.git.fetchCalls).toBe(1);
    expect(r.overlay.overlayDegraded).toBe(false);
  });

  it('only MAX_OVERLAY_FILES are parsed; the rest are base-only and listed (≤ 50 listed, full count kept)', async () => {
    const h = harness(BASE);
    const files: BlastRequest['files'] = [];
    for (let i = 0; i < MAX_OVERLAY_FILES + 60; i += 1) {
      const path = `gen/f${String(i).padStart(3, '0')}.ts`;
      h.git.heads.set(path, `export const v${i} = ${i};\n`);
      files.push({ path, status: 'added', patch: '@@ -0,0 +1 @@\n+x\n' });
    }
    const r = await h.svc.getBlastGraph('r1', h.req(files));
    expect(h.git.reads).toHaveLength(MAX_OVERLAY_FILES);
    expect(r.overlay.degradedCount).toBe(60);
    expect(r.overlay.degradedFiles).toHaveLength(50);
    expect(r.overlay.overlayDegraded).toBe(true);
  });
});

describe('getBlastGraph — index states', () => {
  it('staleOverlay: indexedSha !== baseSha, and a NULL base sha is stale', async () => {
    const h = harness(BASE);
    const files = [{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-a\n+b\n' }];
    h.git.heads.set('src/lib.ts', LIB);
    expect((await h.svc.getBlastGraph('r1', h.req(files, { baseSha: 'c'.repeat(40) }))).overlay.staleOverlay).toBe(true);
    const nul = (await h.svc.getBlastGraph('r1', h.req(files, { baseSha: null }))).overlay;
    expect(nul.staleOverlay).toBe(true);
    expect(nul.baseSha).toBeNull();
  });

  it('reindexing (explicit or stored version < 3): empty result + progress, no data, no fallback', async () => {
    const h = harness(BASE, { state: { reindexing: { state: 'running', done: 40, total: 100 } } });
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-a\n+b\n' }]));
    expect(r.reindexing).toEqual({ state: 'running', done: 40, total: 100 });
    expect(r.graph.nodes).toEqual([]);
    expect(r.fallback).toBeUndefined();
    expect(h.git.reads).toEqual([]);
    // legacy projection: empty + degraded, never the ripgrep fallback
    const legacy = await h.svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(legacy).toMatchObject({ changedSymbols: [], callers: [], degraded: true });
  });

  it('lowConfidence iff the value-binding share is below 0.8', async () => {
    const cov = (resolved: number) => ({ value: { resolved, total: 10 }, type: { resolved: 0, total: 0 }, unresolvedBySpecifier: 0, tsconfigFailures: [], inferredShare: 0 });
    const files = [{ path: 'src/lib.ts', status: 'modified', patch: '@@ -2 +2 @@\n-a\n+b\n' }];
    for (const [resolved, expected] of [[7, true], [8, false], [10, false]] as const) {
      const h = harness(BASE, { state: { coverage: cov(resolved) } });
      h.git.heads.set('src/lib.ts', LIB);
      expect((await h.svc.getBlastGraph('r1', h.req(files))).index.lowConfidence).toBe(expected);
    }
  });

  it('failed index => `fallback` (v1 degraded path stays for it)', async () => {
    const h = harness(BASE, { state: { status: 'failed', degraded: true } });
    const r = await h.svc.getBlastGraph('r1', h.req([{ path: 'src/lib.ts' }]));
    expect(r.fallback).toBe('index_failed');
  });

  it('legacy getBlastRadius without a diff: whole file changed, list shape kept, no overlay', async () => {
    const h = harness(BASE);
    const res = await h.svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(res.degraded).toBe(false);
    expect(res.changedSymbols.map((s) => s.name).sort()).toEqual(['<module>', 'bar', 'foo']);
    expect(res.callers.map((c) => `${c.symbol}->${c.viaSymbol}`).sort()).toEqual(['useBar->bar', 'useFoo->foo']);
    expect(h.git.reads).toEqual([]);
  });
});
