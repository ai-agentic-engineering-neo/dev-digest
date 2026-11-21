import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { GraphReadService, type GraphReadStore } from '../src/modules/repo-intel/graph-read.service.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { GraphIndexStateRow } from '../src/modules/repo-intel/graph-read.repository.js';
import type { AuthProvider } from '../src/domain/ports/auth.js';

/**
 * specs/18 P4-A — project graph routes over a REAL `GraphReadService` fed by
 * an in-memory store (no DB): path validation, 404s, caps, reindexing, empty
 * states, pagination bounds.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const REPO = '11111111-1111-4111-8111-111111111111';

const auth: AuthProvider = {
  currentUser: async () => ({ id: 'u', email: 'u@x', name: 'u' }) as never,
  currentWorkspace: async () => ({ id: 'w', name: 'w' }) as never,
};

interface Fixture {
  state: GraphIndexStateRow | null;
  activeJob: boolean;
  files: Array<{ path: string; rank: number; hotness: number }>;
  edges: Array<{ from: string; to: string }>;
  symbolEdges: number;
}

const readyState = (over: Partial<GraphIndexStateRow> = {}): GraphIndexStateRow => ({
  status: 'full',
  lastIndexedSha: 'abc123',
  indexerVersion: INDEXER_VERSION,
  coverage: null,
  reindexState: null,
  reindexDone: null,
  reindexTotal: null,
  ...over,
});

function makeStore(fx: Fixture): GraphReadStore {
  return {
    getIndexState: async () => fx.state,
    hasActiveIndexJob: async () => fx.activeJob,
    listFiles: async () => fx.files,
    listFileEdges: async () => fx.edges,
    countSymbols: async () => 3,
    listSymbols: async () => [
      { name: 'a', kind: 'function', line: 1, endLine: 2, exported: true },
      { name: 'b', kind: 'function', line: 3, endLine: 4, exported: false },
    ],
    listSymbolEdges: async (_r, file) =>
      Array.from({ length: fx.symbolEdges }, (_, i) => ({
        fromPath: file,
        fromName: 'a',
        toPath: `other/f${i}.ts`,
        toName: `s${i}`,
        kind: 'call',
        confidence: 'exact' as const,
      })),
    symbolDegrees: async () => new Map([['a', { inCount: 1, outCount: 2 }]]),
    countUnresolved: async () => 2,
    listUnresolved: async (_r, offset, limit) => [
      { file: 'src/a.ts', specifier: './nope', importedName: 'x', line: 1, reason: 'missing' },
    ].slice(0, limit + offset),
  };
}

describe('graph routes (no DB, fake store)', () => {
  let app: FastifyInstance;
  const fx: Fixture = {
    state: readyState(),
    activeJob: false,
    files: [
      { path: 'src/a.ts', rank: 3, hotness: 0 },
      { path: 'src/b.ts', rank: 2, hotness: 1 },
      { path: 'lib/c.ts', rank: 1, hotness: 0 },
    ],
    edges: [
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'src/b.ts', to: 'src/a.ts' },
      { from: 'lib/c.ts', to: 'src/a.ts' },
    ],
    symbolEdges: 3,
  };

  beforeAll(async () => {
    app = await buildApp({
      config,
      overrides: { auth, projectGraph: new GraphReadService(makeStore(fx)) },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('overview: ready graph with cycle membership, hot files, index header', async () => {
    const res = await get(`/repos/${REPO}/graph`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('ready');
    expect(body.index).toMatchObject({ indexedSha: 'abc123', indexerVersion: INDEXER_VERSION });
    expect(body.focus).toMatchObject({ mode: 'overview' });
    expect(body.cycles.total).toBe(1);
    expect(body.cycles.items[0].members).toEqual(['src/a.ts', 'src/b.ts']);
    expect(body.cycles.filesInCycles).toBe(2);
    expect(body.hotFiles.length).toBeLessThanOrEqual(20);
    expect(body.truncation.truncated).toBe(false);
  });

  it('dir focus: 404 for an unknown directory, 200 for a known one', async () => {
    expect((await get(`/repos/${REPO}/graph?dir=nope`)).statusCode).toBe(404);
    const ok = await get(`/repos/${REPO}/graph?dir=src`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().focus).toMatchObject({ mode: 'dir', dir: 'src' });
    expect(ok.json().nodes.some((n: { aggregate: boolean }) => n.aggregate)).toBe(true);
  });

  it('file focus: 404 for an unknown file; symbols + edges for a known one', async () => {
    expect((await get(`/repos/${REPO}/graph?file=src/nope.ts`)).statusCode).toBe(404);
    const ok = await get(`/repos/${REPO}/graph?file=src/a.ts`);
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.focus.mode).toBe('file');
    expect(body.symbolPage).toEqual({ page: 1, pageSize: 200, total: 3 });
    expect(body.edges).toHaveLength(3);
    expect(body.nodes.length).toBe(2 + 3);
  });

  it('file focus caps nodes at 400 and edges at 1200 with a truncated flag', async () => {
    fx.symbolEdges = 1500;
    const body = (await get(`/repos/${REPO}/graph?file=src/a.ts`)).json();
    fx.symbolEdges = 3;
    expect(body.nodes.length).toBeLessThanOrEqual(400);
    expect(body.edges.length).toBeLessThanOrEqual(1200);
    expect(body.truncation).toMatchObject({ truncated: true, maxNodes: 400, maxEdges: 1200 });
    expect(body.truncation.nodesDropped).toBeGreaterThan(0);
  });

  it.each([
    ['..', 'dir=..'],
    ['embedded ..', 'dir=src/../etc'],
    ['absolute', 'dir=/etc'],
    ['absolute file', 'file=/etc/passwd'],
    ['NUL', 'file=src/a.ts%00.png'],
    ['backslash', 'file=src%5Ca.ts'],
    ['empty segment', 'dir=src//x'],
    ['dot segment', 'dir=./src'],
    ['trailing slash', 'dir=src/'],
    ['both focuses', 'dir=src&file=src/a.ts'],
    ['bad depth', 'depth=0'],
  ])('rejects %s with 422 before any read', async (_n, qs) => {
    const res = await get(`/repos/${REPO}/graph?${qs}`);
    expect(res.statusCode).toBe(422);
  });

  it('symbols/files/unresolved validate paths and page bounds too', async () => {
    expect((await get(`/repos/${REPO}/graph/symbols?file=../x`)).statusCode).toBe(422);
    expect((await get(`/repos/${REPO}/graph/symbols`)).statusCode).toBe(422);
    expect((await get(`/repos/${REPO}/graph/files?dir=/abs`)).statusCode).toBe(422);
    expect((await get(`/repos/${REPO}/graph/files?page_size=501`)).statusCode).toBe(422);
    expect((await get(`/repos/${REPO}/graph/unresolved?page_size=201`)).statusCode).toBe(422);
    expect((await get(`/repos/not-a-uuid/graph`)).statusCode).toBe(422);
  });

  it('files table: defaults (100), sorting, cycle flags, 404 unknown dir', async () => {
    const res = await get(`/repos/${REPO}/graph/files?sort=rank`);
    const body = res.json();
    expect(body.pageSize).toBe(100);
    expect(body.total).toBe(3);
    expect(body.items[0]).toMatchObject({ path: 'src/a.ts', inCount: 2, outCount: 1, inCycle: true });
    expect(body.items.find((r: { path: string }) => r.path === 'lib/c.ts').inCycle).toBe(false);
    expect((await get(`/repos/${REPO}/graph/files?dir=missing`)).statusCode).toBe(404);
    const scoped = (await get(`/repos/${REPO}/graph/files?dir=lib`)).json();
    expect(scoped.items.map((r: { path: string }) => r.path)).toEqual(['lib/c.ts']);
  });

  it('unresolved: default page size 50, items + total', async () => {
    const body = (await get(`/repos/${REPO}/graph/unresolved`)).json();
    expect(body).toMatchObject({ state: 'ready', pageSize: 50, total: 2 });
    expect(body.items[0].reason).toBe('missing');
  });

  it('symbols: 404 for an unknown file, paged list for a known one', async () => {
    expect((await get(`/repos/${REPO}/graph/symbols?file=src/nope.ts`)).statusCode).toBe(404);
    const body = (await get(`/repos/${REPO}/graph/symbols?file=src/a.ts`)).json();
    expect(body.pageSize).toBe(200);
    expect(body.items[0]).toMatchObject({ name: 'a', inCount: 1, outCount: 2 });
  });

  it('stale indexer version => reindexing + no data on every endpoint', async () => {
    const saved = fx.state;
    fx.state = readyState({ indexerVersion: INDEXER_VERSION - 1 });
    for (const path of ['graph', 'graph/files', 'graph/unresolved', 'graph/symbols?file=src/a.ts']) {
      const body = (await get(`/repos/${REPO}/${path}`)).json();
      expect(body.state).toBe('reindexing');
      expect(body.nodes).toBeUndefined();
      expect(body.items).toBeUndefined();
    }
    fx.state = saved;
  });

  it('running reindex reports progress', async () => {
    const saved = fx.state;
    fx.state = readyState({ reindexState: 'running', reindexDone: 40, reindexTotal: 100 });
    const body = (await get(`/repos/${REPO}/graph`)).json();
    expect(body).toEqual({ state: 'reindexing', reindexing: { state: 'running', done: 40, total: 100 } });
    fx.state = saved;
  });

  it('empty states: never_indexed, indexing, failed', async () => {
    const saved = fx.state;
    fx.state = null;
    expect((await get(`/repos/${REPO}/graph`)).json()).toEqual({ state: 'empty', reason: 'never_indexed' });
    fx.activeJob = true;
    expect((await get(`/repos/${REPO}/graph`)).json()).toEqual({ state: 'empty', reason: 'indexing' });
    fx.activeJob = false;
    fx.state = readyState({ status: 'failed' });
    expect((await get(`/repos/${REPO}/graph`)).json()).toEqual({ state: 'empty', reason: 'failed' });
    fx.state = saved;
  });

  it('cycle analysis is memoised per (repo, sha, version)', async () => {
    let edgeLoads = 0;
    const base = makeStore({ ...fx, edges: fx.edges });
    const svc = new GraphReadService({
      ...base,
      listFileEdges: async () => {
        edgeLoads++;
        return fx.edges;
      },
    });
    await svc.listFiles(REPO, { page: 1, pageSize: 10, sort: 'path' });
    const afterFirst = edgeLoads;
    await svc.listFiles(REPO, { page: 1, pageSize: 10, sort: 'path' });
    // second call loads edges for the table only, not again for cycles
    expect(edgeLoads - afterFirst).toBe(1);
  });
});
