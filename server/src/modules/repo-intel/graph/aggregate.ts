/**
 * Pure level-of-detail aggregation for the project graph (specs/18 AC-47…53).
 * File nodes are rolled up into directory nodes; edges are weighted by the
 * number of underlying file edges. No I/O — the read service feeds it rows.
 */

export interface FileInfo {
  path: string;
  rank: number;
  hotness: number;
}

export interface FileEdge {
  from: string;
  to: string;
}

export interface AggNode {
  id: string;
  kind: 'directory' | 'file';
  label: string;
  path: string;
  fileCount: number;
  aggregate: boolean;
  rank: number;
  /** Highest hotness among the aggregated files. */
  hotness: number;
  files: string[];
}

export interface AggEdge {
  from: string;
  to: string;
  weight: number;
}

export interface AggGraph {
  nodes: AggNode[];
  edges: AggEdge[];
}

export interface CappedGraph<N, E> {
  nodes: N[];
  edges: E[];
  truncated: boolean;
  nodesDropped: number;
  edgesDropped: number;
}

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** Number of directory segments above a file (`a/b/c.ts` => 2). */
export function dirDepthOf(path: string): number {
  return path.split('/').length - 1;
}

export function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Deepest directory depth present in the file set. */
export function maxDepth(files: readonly FileInfo[]): number {
  let m = 0;
  for (const f of files) m = Math.max(m, dirDepthOf(f.path));
  return m;
}

/**
 * Key a file rolls up to at `depth`: its first `depth` directory segments if
 * it sits in at least `depth` directories, otherwise the file itself.
 */
function keyAtDepth(path: string, depth: number): { id: string; directory: boolean } {
  const segs = path.split('/');
  if (segs.length - 1 >= depth) return { id: segs.slice(0, depth).join('/'), directory: true };
  return { id: path, directory: false };
}

/** Node count of the overview at `depth` (no edges built). */
export function countAtDepth(files: readonly FileInfo[], depth: number): number {
  const keys = new Set<string>();
  for (const f of files) keys.add(keyAtDepth(f.path, depth).id);
  return keys.size;
}

/**
 * Most detailed roll-up depth (>= 1) whose aggregated node count is within
 * `maxNodes`. `maxDirDepth + 1` is full file detail. Falls back to 1 when even
 * depth 1 is over the cap (the caller truncates).
 */
export function chooseDepth(files: readonly FileInfo[], maxNodes: number): number {
  // The most detailed level that still fits: roll-up counts never shrink as
  // depth grows, so walk down until the next level would overflow. Depth 1 is
  // the floor even when it alone exceeds the cap (truncation handles that).
  const deepest = Math.max(1, maxDepth(files) + 1);
  let chosen = 1;
  for (let d = 1; d <= deepest; d++) {
    if (countAtDepth(files, d) > maxNodes) break;
    chosen = d;
  }
  return chosen;
}

function makeNode(
  id: string,
  directory: boolean,
  members: FileInfo[],
  aggregate = false,
  path = id,
): AggNode {
  let rank = 0;
  let hotness = 0;
  for (const m of members) {
    rank += m.rank;
    hotness = Math.max(hotness, m.hotness);
  }
  return {
    id,
    kind: directory ? 'directory' : 'file',
    label: baseName(path) || (aggregate ? '(root)' : path),
    path,
    fileCount: members.length,
    aggregate,
    rank,
    hotness,
    files: members.map((m) => m.path),
  };
}

function weighEdges(
  edges: readonly FileEdge[],
  keyOf: (file: string) => string | null,
): AggEdge[] {
  const weights = new Map<string, AggEdge>();
  for (const e of edges) {
    const from = keyOf(e.from);
    const to = keyOf(e.to);
    if (from === null || to === null || from === to) continue;
    const k = `${from}\0${to}`;
    const cur = weights.get(k);
    if (cur) cur.weight++;
    else weights.set(k, { from, to, weight: 1 });
  }
  return [...weights.values()];
}

/** Whole-repo overview rolled up at `depth`. */
export function aggregateOverview(
  files: readonly FileInfo[],
  edges: readonly FileEdge[],
  depth: number,
): AggGraph {
  const groups = new Map<string, { directory: boolean; members: FileInfo[] }>();
  const keyByFile = new Map<string, string>();
  for (const f of files) {
    const k = keyAtDepth(f.path, depth);
    keyByFile.set(f.path, k.id);
    let g = groups.get(k.id);
    if (!g) groups.set(k.id, (g = { directory: k.directory, members: [] }));
    g.members.push(f);
  }
  const nodes = [...groups.entries()].map(([id, g]) => makeNode(id, g.directory, g.members));
  return { nodes, edges: weighEdges(edges, (p) => keyByFile.get(p) ?? null) };
}

/**
 * `dir=` focus: the directory's immediate children (subdirectories rolled up,
 * files as-is) plus ONE aggregate node per neighbouring directory (any file
 * outside `dir` that shares an edge with a file inside it).
 */
export function aggregateDirFocus(
  files: readonly FileInfo[],
  edges: readonly FileEdge[],
  dir: string,
): AggGraph {
  const prefix = dir === '' ? '' : `${dir}/`;
  const inside = new Map<string, FileInfo>();
  const infoByPath = new Map<string, FileInfo>();
  for (const f of files) {
    infoByPath.set(f.path, f);
    if (f.path.startsWith(prefix)) inside.set(f.path, f);
  }

  const childKey = (path: string): { id: string; directory: boolean } => {
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    return slash < 0
      ? { id: path, directory: false }
      : { id: `${prefix}${rest.slice(0, slash)}`, directory: true };
  };

  const groups = new Map<string, { directory: boolean; members: FileInfo[] }>();
  const keyByFile = new Map<string, string>();
  for (const f of inside.values()) {
    const k = childKey(f.path);
    keyByFile.set(f.path, k.id);
    let g = groups.get(k.id);
    if (!g) groups.set(k.id, (g = { directory: k.directory, members: [] }));
    g.members.push(f);
  }

  // Neighbours: other end of any edge crossing the boundary.
  const neighbourGroups = new Map<string, FileInfo[]>();
  const neighbourKeyByFile = new Map<string, string>();
  for (const e of edges) {
    const fromIn = inside.has(e.from);
    const toIn = inside.has(e.to);
    if (fromIn === toIn) continue;
    const other = fromIn ? e.to : e.from;
    const info = infoByPath.get(other);
    if (!info) continue;
    const key = parentDir(other);
    neighbourKeyByFile.set(other, key);
    let g = neighbourGroups.get(key);
    if (!g) neighbourGroups.set(key, (g = []));
    if (!g.some((m) => m.path === other)) g.push(info);
  }

  const nodes = [...groups.entries()].map(([id, g]) => makeNode(id, g.directory, g.members));
  for (const [key, members] of neighbourGroups) {
    // Prefix with a marker so a neighbour dir can never collide with a child id.
    nodes.push(makeNode(`~${key}`, true, members, true, key));
  }

  const keyOf = (p: string): string | null => {
    const own = keyByFile.get(p);
    if (own !== undefined) return own;
    const nb = neighbourKeyByFile.get(p);
    return nb === undefined ? null : `~${nb}`;
  };
  // Neighbour-to-neighbour edges are not part of this focus.
  const relevant = edges.filter((e) => inside.has(e.from) || inside.has(e.to));
  return { nodes, edges: weighEdges(relevant, keyOf) };
}

/**
 * Keep at most `maxNodes` nodes (highest `priority` first, stable on id) and
 * `maxEdges` edges (heaviest first) among the kept nodes.
 */
export function capGraph<N extends { id: string }, E extends { from: string; to: string; weight: number }>(
  nodes: readonly N[],
  edges: readonly E[],
  priority: (n: N) => number,
  maxNodes: number,
  maxEdges: number,
): CappedGraph<N, E> {
  const keptNodes = [...nodes]
    .sort((a, b) => priority(b) - priority(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, maxNodes);
  const ids = new Set(keptNodes.map((n) => n.id));
  const reachable = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const keptEdges = [...reachable]
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        (a.from + a.to < b.from + b.to ? -1 : a.from + a.to > b.from + b.to ? 1 : 0),
    )
    .slice(0, maxEdges);
  const nodesDropped = nodes.length - keptNodes.length;
  const edgesDropped = edges.length - keptEdges.length;
  return {
    nodes: keptNodes,
    edges: keptEdges,
    truncated: nodesDropped > 0 || edgesDropped > 0,
    nodesDropped,
    edgesDropped,
  };
}

/** Top-N files by weighted rank (rank * (1 + hotness)), stable on path. */
export function topHotFiles(files: readonly FileInfo[], n: number): FileInfo[] {
  const score = (f: FileInfo): number => f.rank * (1 + f.hotness);
  return [...files]
    .sort((a, b) => score(b) - score(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, n);
}

export interface FileTableRow {
  path: string;
  inCount: number;
  outCount: number;
  rank: number;
  hotness: number;
}

export type FileSortKey = 'path' | 'rank' | 'in' | 'out' | 'hotness';

/** In/out degree rows for `files` (distinct neighbours), then sorted. */
export function buildFileTable(
  files: readonly FileInfo[],
  edges: readonly FileEdge[],
  sort: FileSortKey,
): FileTableRow[] {
  const outs = new Map<string, Set<string>>();
  const ins = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    (outs.get(e.from) ?? outs.set(e.from, new Set()).get(e.from)!).add(e.to);
    (ins.get(e.to) ?? ins.set(e.to, new Set()).get(e.to)!).add(e.from);
  }
  const rows = files.map((f) => ({
    path: f.path,
    inCount: ins.get(f.path)?.size ?? 0,
    outCount: outs.get(f.path)?.size ?? 0,
    rank: f.rank,
    hotness: f.hotness,
  }));
  const key = (r: FileTableRow): number =>
    sort === 'rank' ? r.rank : sort === 'in' ? r.inCount : sort === 'out' ? r.outCount : r.hotness;
  rows.sort((a, b) =>
    sort === 'path'
      ? a.path < b.path ? -1 : a.path > b.path ? 1 : 0
      : key(b) - key(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  return rows;
}
