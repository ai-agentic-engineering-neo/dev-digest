import { describe, it, expect } from 'vitest';
import {
  aggregateDirFocus,
  aggregateOverview,
  buildFileTable,
  capGraph,
  chooseDepth,
  countAtDepth,
  topHotFiles,
  type FileInfo,
} from '../src/modules/repo-intel/graph/aggregate.js';

const f = (path: string, rank = 1, hotness = 0): FileInfo => ({ path, rank, hotness });
const e = (from: string, to: string) => ({ from, to });

const files = [
  f('src/a/x.ts'), f('src/a/y.ts'), f('src/b/z.ts'), f('lib/q.ts'), f('main.ts'),
];

describe('LoD depth selection', () => {
  it('counts distinct roll-up keys per depth', () => {
    expect(countAtDepth(files, 1)).toBe(3); // src, lib, main.ts
    expect(countAtDepth(files, 2)).toBe(4); // src/a, src/b, lib/q.ts, main.ts
  });

  it('picks the deepest DIRECTORY level within the overview target, never file detail', () => {
    expect(countAtDepth(files, 3)).toBe(5); // every file on its own
    expect(chooseDepth(files, 400)).toBe(2); // directories only, even when files would fit
    expect(chooseDepth(files, 3)).toBe(1); // depth 2 (4 nodes) would overflow
    expect(chooseDepth(files, 2)).toBe(1); // nothing fits => floor of 1
  });
});

describe('aggregateOverview', () => {
  it('rolls files up and weights edges by underlying file-edge count', () => {
    const g = aggregateOverview(
      files,
      [e('src/a/x.ts', 'src/b/z.ts'), e('src/a/y.ts', 'src/b/z.ts'), e('src/a/x.ts', 'src/a/y.ts'), e('main.ts', 'lib/q.ts')],
      2,
    );
    const ids = g.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['lib/q.ts', 'main.ts', 'src/a', 'src/b']);
    const ab = g.edges.find((x) => x.from === 'src/a' && x.to === 'src/b');
    expect(ab?.weight).toBe(2);
    // intra-directory edge disappears
    expect(g.edges.some((x) => x.from === x.to)).toBe(false);
    expect(g.nodes.find((n) => n.id === 'src/a')).toMatchObject({ kind: 'directory', fileCount: 2 });
  });
});

describe('aggregateDirFocus', () => {
  it('shows children plus one aggregate node per neighbour directory', () => {
    const g = aggregateDirFocus(
      files,
      [e('src/a/x.ts', 'src/b/z.ts'), e('main.ts', 'src/a/y.ts'), e('lib/q.ts', 'src/a/x.ts')],
      'src/a',
    );
    const children = g.nodes.filter((n) => !n.aggregate).map((n) => n.id).sort();
    expect(children).toEqual(['src/a/x.ts', 'src/a/y.ts']);
    const neighbours = g.nodes.filter((n) => n.aggregate).map((n) => n.path).sort();
    expect(neighbours).toEqual(['', 'lib', 'src/b']);
    expect(g.edges).toHaveLength(3);
  });
});

describe('capGraph', () => {
  it('truncates nodes and edges to the caps and reports drops', () => {
    const nodes = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, rank: i }));
    const edges = Array.from({ length: 499 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, weight: 1 }));
    const c = capGraph(nodes, edges, (n) => n.rank, 400, 1200);
    expect(c.nodes).toHaveLength(400);
    expect(c.truncated).toBe(true);
    expect(c.nodesDropped).toBe(100);
    // every kept edge connects kept nodes
    const ids = new Set(c.nodes.map((n) => n.id));
    expect(c.edges.every((x) => ids.has(x.from) && ids.has(x.to))).toBe(true);
  });

  it('caps edges at maxEdges keeping the heaviest', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { from: 'a', to: 'b', weight: 1 },
      { from: 'b', to: 'c', weight: 5 },
      { from: 'a', to: 'c', weight: 3 },
    ];
    const c = capGraph(nodes, edges, () => 0, 10, 2);
    expect(c.edges.map((x) => x.weight)).toEqual([5, 3]);
    expect(c.edgesDropped).toBe(1);
    expect(c.truncated).toBe(true);
  });

  it('is not truncated within the caps', () => {
    expect(capGraph([{ id: 'a' }], [], () => 0, 400, 1200).truncated).toBe(false);
  });
});

describe('topHotFiles / buildFileTable', () => {
  it('orders by rank*(1+hotness) and limits', () => {
    const ranked = [f('a', 1, 0), f('b', 1, 1), f('c', 0.5, 0)];
    expect(topHotFiles(ranked, 2).map((x) => x.path)).toEqual(['b', 'a']);
  });

  it('computes distinct in/out degree and sorts', () => {
    const rows = buildFileTable(
      [f('a'), f('b'), f('c')],
      [e('a', 'b'), e('a', 'b'), e('c', 'b'), e('b', 'b')],
      'in',
    );
    expect(rows[0]).toMatchObject({ path: 'b', inCount: 2, outCount: 0 });
    expect(rows.find((r) => r.path === 'a')).toMatchObject({ inCount: 0, outCount: 1 });
  });
});
