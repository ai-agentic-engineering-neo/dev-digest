import { describe, expect, it } from 'vitest';
import { clampDepth, computeBlast, memoryBlastSource, type BlastSeed } from '../src/modules/repo-intel/graph/blast.js';
import type { BlastEdgeKind } from '../src/vendor/shared/index.js';
import type { SymbolEdgeRow } from '../src/modules/repo-intel/graph/types.js';
import { MAX_BLAST_EDGES, MAX_BLAST_NODES, MAX_TRAVERSAL_NODES } from '../src/modules/repo-intel/constants.js';

/** `from -> to` where both are `path#name`; reads as "from depends on to". */
const e = (from: string, to: string, kind: BlastEdgeKind = 'call', line = 1): SymbolEdgeRow => {
  const [fp, fn] = from.split('#');
  const [tp, tn] = to.split('#');
  return { fromPath: fp!, fromName: fn!, toPath: tp!, toName: tn!, kind, confidence: 'exact', line };
};
const seed = (id: string, deleted = false): BlastSeed => {
  const [path, name] = id.split('#');
  return { path: path!, name: name!, kind: 'function', deleted };
};
const ids = (r: Awaited<ReturnType<typeof computeBlast>>, role?: string): string[] =>
  r.graph.nodes.filter((n) => !role || n.role === role).map((n) => n.id).sort();

describe('clampDepth', () => {
  it('clamps to 1…6 with default 6', () => {
    expect(clampDepth(undefined)).toBe(6);
    expect(clampDepth(0)).toBe(1);
    expect(clampDepth(-3)).toBe(1);
    expect(clampDepth(99)).toBe(6);
    expect(clampDepth(3.9)).toBe(3);
    expect(clampDepth(Number.NaN)).toBe(6);
  });
});

describe('computeBlast — reverse reachability', () => {
  const chain = [e('b.ts#b', 'a.ts#a'), e('c.ts#c', 'b.ts#b'), e('d.ts#d', 'c.ts#c')];

  it('walks callers hop by hop and records depth', async () => {
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(chain));
    expect(r.graph.nodes.map((n) => [n.id, n.depth, n.role])).toEqual([
      ['a.ts#a', 0, 'changed'],
      ['b.ts#b', 1, 'impacted'],
      ['c.ts#c', 2, 'impacted'],
      ['d.ts#d', 3, 'impacted'],
    ]);
    expect(r.graph.edges).toHaveLength(3);
    expect(r.graph.truncation).toMatchObject({ truncated: false, totalsCapped: false, maxDepth: 6 });
  });

  it('stops at the depth bound (clamped) and never expands past it', async () => {
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(chain), { depth: 2 });
    expect(ids(r)).toEqual(['a.ts#a', 'b.ts#b', 'c.ts#c']);
    expect(r.graph.truncation.maxDepth).toBe(2);
    expect((await computeBlast([seed('a.ts#a')], memoryBlastSource(chain), { depth: 0 })).graph.truncation.maxDepth).toBe(1);
  });

  it('terminates on cycles (visited set) and ignores self edges', async () => {
    const edges = [e('b.ts#b', 'a.ts#a'), e('a.ts#a', 'b.ts#b'), e('a.ts#a', 'a.ts#a')];
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(edges));
    expect(ids(r)).toEqual(['a.ts#a', 'b.ts#b']);
  });

  it('stops at entry points (file_facts + app router) and at tests, but still reports them', async () => {
    const edges = [
      e('routes/users.ts#h', 'a.ts#a'),
      e('beyond.ts#x', 'routes/users.ts#h'),
      e('app/x/page.tsx#Page', 'a.ts#a'),
      e('beyond2.ts#y', 'app/x/page.tsx#Page'),
      e('a.test.ts#t', 'a.ts#a'),
      e('beyond3.ts#z', 'a.test.ts#t'),
    ];
    const facts = new Map([['routes/users.ts', { endpoints: ['GET /users'], crons: [] }]]);
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(edges, { facts }));
    expect(ids(r, 'entry_point')).toEqual(['app/x/page.tsx#Page', 'routes/users.ts#h']);
    expect(ids(r, 'test')).toEqual(['a.test.ts#t']);
    expect(ids(r)).not.toContain('beyond.ts#x');
    expect(ids(r)).not.toContain('beyond2.ts#y');
    expect(ids(r)).not.toContain('beyond3.ts#z');
    expect(r.graph.entryPoints.items.map((p) => [p.path, p.type, p.label])).toEqual([
      ['app/x/page.tsx', 'page', 'page app/x/page.tsx'],
      ['routes/users.ts', 'endpoint', 'GET /users'],
    ]);
    expect(r.graph.entryPoints.total).toBe(2);
    expect(r.graph.tests).toEqual({ items: [{ path: 'a.test.ts', depth: 1 }], total: 1 });
    expect(r.graph.nodes.find((n) => n.id === 'routes/users.ts#h')?.entryLabel).toBe('GET /users');
  });

  it('a changed symbol sitting in an entry-point file is still expanded', async () => {
    const edges = [e('b.ts#b', 'routes/users.ts#h')];
    const facts = new Map([['routes/users.ts', { endpoints: ['GET /users'], crons: [] }]]);
    const r = await computeBlast([seed('routes/users.ts#h')], memoryBlastSource(edges, { facts }));
    expect(ids(r)).toEqual(['b.ts#b', 'routes/users.ts#h']);
    expect(r.graph.entryPoints.items).toEqual([{ path: 'routes/users.ts', type: 'endpoint', label: 'GET /users', depth: 0 }]);
  });

  it('keeps deleted seeds flagged and reports their remaining dependents', async () => {
    const r = await computeBlast([seed('a.ts#gone', true)], memoryBlastSource([e('b.ts#b', 'a.ts#gone')]));
    expect(r.graph.nodes.find((n) => n.id === 'a.ts#gone')).toMatchObject({ role: 'changed', deleted: true });
    expect(ids(r, 'impacted')).toEqual(['b.ts#b']);
  });
});

describe('computeBlast — runtime vs type-only (AC-31)', () => {
  it('runtime iff reached through at least one all-runtime path', async () => {
    const edges = [
      e('t1.ts#t1', 'a.ts#a', 'type'), // only via a type edge
      e('t2.ts#t2', 't1.ts#t1', 'call'), // runtime edge, but behind a type-only hop
      e('r1.ts#r1', 'a.ts#a', 'value'),
      e('r2.ts#r2', 'r1.ts#r1', 're-export'),
      // reached by BOTH a type path and a runtime path => runtime
      e('both.ts#both', 'a.ts#a', 'extends'),
      e('both.ts#both', 'r1.ts#r1', 'call'),
    ];
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(edges));
    const typeOnly = Object.fromEntries(r.graph.nodes.map((n) => [n.id, n.typeOnly === true]));
    expect(typeOnly).toMatchObject({ 'a.ts#a': false, 't1.ts#t1': true, 't2.ts#t2': true, 'r1.ts#r1': false, 'r2.ts#r2': false, 'both.ts#both': false });
    const edgeFlags = Object.fromEntries(r.graph.edges.map((x) => [`${x.from}>${x.kind}`, x.typeOnly]));
    expect(edgeFlags['t1.ts#t1>type']).toBe(true);
    expect(edgeFlags['both.ts#both>extends']).toBe(true);
    expect(edgeFlags['r1.ts#r1>value']).toBe(false);
  });

  it('includeTypeOnly=false does not traverse type edges at all', async () => {
    const edges = [e('t1.ts#t1', 'a.ts#a', 'type'), e('t2.ts#t2', 't1.ts#t1'), e('r.ts#r', 'a.ts#a', 'call'), e('i.ts#i', 'a.ts#a', 'implements')];
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(edges), { includeTypeOnly: false });
    expect(ids(r)).toEqual(['a.ts#a', 'r.ts#r']);
    expect(r.graph.edges.every((x) => !x.typeOnly)).toBe(true);
  });
});

describe('computeBlast — caps and truncation (AC-28/29)', () => {
  it('keeps changed first, then entry points, then impacted by depth asc / rank desc, and counts what it drops', async () => {
    const callers = Array.from({ length: MAX_BLAST_NODES + 20 }, (_, i) => e(`c/f${String(i).padStart(3, '0')}.ts#f`, 'a.ts#a'));
    const entry = e('routes/r.ts#h', 'a.ts#a');
    const facts = new Map([['routes/r.ts', { endpoints: ['GET /r'], crons: [] }]]);
    // rank: higher index => higher rank, so the LAST callers must survive the cut
    const ranks = new Map(callers.map((x, i) => [x.fromPath, i] as const));
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource([...callers, entry], { facts, ranks }));
    expect(r.graph.nodes).toHaveLength(MAX_BLAST_NODES);
    expect(r.graph.nodes[0]!.role).toBe('changed');
    expect(r.graph.nodes[1]!.id).toBe('routes/r.ts#h'); // entry point outranks every plain impacted node
    expect(r.graph.nodes.some((n) => n.id === `c/f${String(MAX_BLAST_NODES + 19).padStart(3, '0')}.ts#f`)).toBe(true);
    expect(r.graph.nodes.some((n) => n.id === 'c/f000.ts#f')).toBe(false);
    expect(r.graph.truncation).toMatchObject({ truncated: true, nodesDropped: 22, totalsCapped: false, maxNodes: MAX_BLAST_NODES });
    // edges: only those among kept nodes
    expect(r.graph.edges.length).toBe(MAX_BLAST_NODES - 1);
    expect(r.graph.truncation.edgesDropped).toBe(r.discovered.edges - r.graph.edges.length);
  });

  it('caps edges at MAX_BLAST_EDGES, runtime before type-only, lower depth first', async () => {
    // 100 nodes, each with 8 parallel edges to the seed (different lines) => 800 edges
    const edges: SymbolEdgeRow[] = [];
    for (let i = 0; i < 100; i += 1) {
      for (let l = 1; l <= 8; l += 1) edges.push(e(`n/${String(i).padStart(3, '0')}.ts#n`, 'a.ts#a', l <= 4 ? 'type' : 'call', l));
    }
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(edges));
    expect(r.graph.edges).toHaveLength(MAX_BLAST_EDGES);
    expect(r.graph.truncation).toMatchObject({ truncated: true, edgesDropped: 200, nodesDropped: 0 });
    // all 400 runtime edges survive; the 200 dropped ones are type-only
    expect(r.graph.edges.filter((x) => !x.typeOnly)).toHaveLength(400);
    expect(r.graph.edges.filter((x) => x.typeOnly)).toHaveLength(200);
  });

  it('MAX_TRAVERSAL_NODES stops discovery and flags totalsCapped (counts are lower bounds)', async () => {
    const edges = Array.from({ length: MAX_TRAVERSAL_NODES + 50 }, (_, i) => e(`m/${i}.ts#m`, 'a.ts#a'));
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(edges));
    expect(r.discovered.nodes).toBe(MAX_TRAVERSAL_NODES);
    expect(r.graph.truncation.totalsCapped).toBe(true);
    expect(r.graph.truncation.truncated).toBe(true);
    expect(r.graph.nodes).toHaveLength(MAX_BLAST_NODES);
  });

  it('entry points ≤ 50 and tests ≤ 100 are listed, with full totals', async () => {
    const eps = Array.from({ length: 60 }, (_, i) => e(`app/r${i}/route.ts#GET`, 'a.ts#a'));
    const tests = Array.from({ length: 120 }, (_, i) => e(`t/x${i}.test.ts#t`, 'a.ts#a'));
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource([...eps, ...tests]));
    expect(r.graph.entryPoints.items).toHaveLength(50);
    expect(r.graph.entryPoints.total).toBe(60);
    expect(r.graph.tests.items).toHaveLength(100);
    expect(r.graph.tests.total).toBe(120);
  });

  it('queries each hop in chunks, never the whole edge table', async () => {
    const calls: number[] = [];
    const base = memoryBlastSource(Array.from({ length: 450 }, (_, i) => e(`m/${i}.ts#m`, 'a.ts#a')));
    const source = { ...base, incomingEdges: async (t: readonly unknown[]) => { calls.push(t.length); return base.incomingEdges(t as never); } };
    await computeBlast([seed('a.ts#a')], source);
    expect(calls[0]).toBe(1); // hop 1: the seed only
    expect(Math.max(...calls)).toBeLessThanOrEqual(200); // hop 2: 450 frontier nodes in <= 200-sized chunks
    expect(calls.reduce((a, b) => a + b, 0)).toBe(451);
  });

  it('direct callers exclude same-file usages and are sorted by rank', async () => {
    const edges = [e('a.ts#inner', 'a.ts#a'), e('lo.ts#x', 'a.ts#a'), e('hi.ts#y', 'a.ts#a')];
    const ranks = new Map([['lo.ts', 1], ['hi.ts', 9]]);
    const r = await computeBlast([seed('a.ts#a')], memoryBlastSource(edges, { ranks }));
    expect(r.directCallers.map((c) => c.from.path)).toEqual(['hi.ts', 'lo.ts']);
  });
});
