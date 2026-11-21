/**
 * Reverse-reachability blast core (plan 19 / P2-B; AC-27…AC-33). Pure: no
 * adapters, no db, no fs. All data arrives through the injected `BlastSource`
 * (the repository for persisted rows, wrapped by the overlay for the PR's
 * head-side replacements), so the same code runs in the fixture gate with an
 * in-memory edge list.
 *
 * Traversal is iterative per hop: one chunked `(to_path, to_name) IN (…)` read
 * per frontier — the whole-repo edge table is never loaded.
 */
import { MODULE_SYMBOL } from '../../../domain/module-facts.js';
import type {
  BlastAffectedTest,
  BlastEdgeKind,
  BlastEntryPoint,
  BlastGraph,
  BlastGraphEdge,
  BlastGraphNode,
} from '../../../vendor/shared/index.js';
import {
  BLAST_DEFAULT_DEPTH,
  BLAST_MAX_DEPTH,
  BLAST_QUERY_CHUNK,
  MAX_BLAST_EDGES,
  MAX_BLAST_ENTRY_POINTS,
  MAX_BLAST_NODES,
  MAX_BLAST_TESTS,
  MAX_TRAVERSAL_NODES,
} from '../constants.js';
import { classifyEntryPoint, isTestFile, type EntryClass, type FileFactsLite } from './entry-points.js';
import type { SymbolEdgeRow } from './types.js';

export interface SymbolRef {
  path: string;
  name: string;
}

export interface BlastSource {
  /** Edges whose TARGET is one of `targets` (exact `(to_path, to_name)` pairs). */
  incomingEdges(targets: readonly SymbolRef[]): Promise<SymbolEdgeRow[]>;
  fileFacts(paths: readonly string[]): Promise<ReadonlyMap<string, FileFactsLite>>;
  /** `file_rank.rank` per path; missing ⇒ 0. */
  fileRanks(paths: readonly string[]): Promise<ReadonlyMap<string, number>>;
}

export interface BlastSeed extends SymbolRef {
  kind: string;
  deleted: boolean;
}

export interface BlastOptions {
  /** Clamped to 1…6, default 6. */
  depth?: number;
  /** false ⇒ edges of kind type/extends/implements are not traversed at all. */
  includeTypeOnly?: boolean;
}

/** Edge kinds that exist at runtime (AC-31). Everything else is type-only. */
const RUNTIME_KINDS: ReadonlySet<BlastEdgeKind> = new Set<BlastEdgeKind>(['call', 'value', 're-export']);
export const isRuntimeEdgeKind = (k: BlastEdgeKind): boolean => RUNTIME_KINDS.has(k);

export function clampDepth(depth: number | undefined): number {
  if (depth === undefined || !Number.isFinite(depth)) return BLAST_DEFAULT_DEPTH;
  return Math.min(BLAST_MAX_DEPTH, Math.max(1, Math.trunc(depth)));
}

export const nodeId = (r: SymbolRef): string => `${r.path}#${r.name}`;

export interface DirectCaller {
  from: SymbolRef;
  /** The changed symbol it reaches. */
  via: SymbolRef;
  line: number;
  rank: number;
}

export interface BlastComputation {
  graph: BlastGraph;
  /** Untruncated discovery, for list projections. */
  discovered: { nodes: number; edges: number };
  /** Cross-file edges INTO a changed symbol (legacy `callers`). */
  directCallers: DirectCaller[];
  /** Files of every non-changed node reached (impacted/entry/test). */
  impactedFiles: string[];
  /** Facts of every file the traversal touched. */
  facts: ReadonlyMap<string, FileFactsLite>;
}

interface Node {
  ref: SymbolRef;
  kind: string | null;
  depth: number;
  deleted: boolean;
  seed: boolean;
}

interface Edge {
  from: string;
  to: string;
  kind: BlastEdgeKind;
  confidence: SymbolEdgeRow['confidence'];
  line: number;
}

function* chunked<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export async function computeBlast(
  seeds: readonly BlastSeed[],
  source: BlastSource,
  opts: BlastOptions = {},
): Promise<BlastComputation> {
  const maxDepth = clampDepth(opts.depth);
  const includeTypeOnly = opts.includeTypeOnly ?? true;

  const nodes = new Map<string, Node>();
  for (const s of seeds) {
    const id = nodeId(s);
    if (!nodes.has(id)) nodes.set(id, { ref: { path: s.path, name: s.name }, kind: s.kind, depth: 0, deleted: s.deleted, seed: true });
  }
  const edges = new Map<string, Edge>();
  const facts = new Map<string, FileFactsLite>();
  const classOf = new Map<string, EntryClass | null>();
  let totalsCapped = false;

  const loadFacts = async (paths: Iterable<string>): Promise<void> => {
    const need = [...new Set(paths)].filter((p) => !facts.has(p) && !isTestFile(p));
    for (const chunk of chunked(need, BLAST_QUERY_CHUNK)) {
      const got = await source.fileFacts(chunk);
      for (const p of chunk) facts.set(p, got.get(p) ?? { endpoints: [], crons: [] });
    }
  };
  const entryOf = (path: string): EntryClass | null => {
    let c = classOf.get(path);
    if (c === undefined) {
      c = classifyEntryPoint(path, facts.get(path));
      classOf.set(path, c);
    }
    return c;
  };

  await loadFacts([...nodes.values()].map((n) => n.ref.path));

  let frontier: Node[] = [...nodes.values()];
  for (let hop = 1; hop <= maxDepth && frontier.length > 0; hop += 1) {
    const rows: SymbolEdgeRow[] = [];
    for (const chunk of chunked(frontier.map((n) => n.ref), BLAST_QUERY_CHUNK)) {
      rows.push(...(await source.incomingEdges(chunk)));
    }
    const discovered: Node[] = [];
    for (const r of rows) {
      if (!includeTypeOnly && !isRuntimeEdgeKind(r.kind)) continue;
      const toId = `${r.toPath}#${r.toName}`;
      const fromRef = { path: r.fromPath, name: r.fromName };
      const fromId = nodeId(fromRef);
      if (fromId === toId || !nodes.has(toId)) continue;
      if (!nodes.has(fromId)) {
        if (nodes.size >= MAX_TRAVERSAL_NODES) {
          totalsCapped = true;
          continue;
        }
        const n: Node = { ref: fromRef, kind: null, depth: hop, deleted: false, seed: false };
        nodes.set(fromId, n);
        discovered.push(n);
      }
      const key = `${fromId}\0${toId}\0${r.kind}\0${r.line}`;
      if (!edges.has(key)) edges.set(key, { from: fromId, to: toId, kind: r.kind, confidence: r.confidence, line: r.line });
    }
    await loadFacts(discovered.map((n) => n.ref.path));
    // Entry points and tests are where the walk stops (AC-27a): nothing depends on them in a way we report.
    frontier = discovered.filter((n) => !isTestFile(n.ref.path) && entryOf(n.ref.path) === null);
  }

  // ---- runtime vs type-only (AC-31): runtime iff reachable from a seed through >= 1 path of runtime-only edges ----
  const incomingByTo = new Map<string, Edge[]>();
  for (const e of edges.values()) {
    if (!isRuntimeEdgeKind(e.kind)) continue;
    const arr = incomingByTo.get(e.to);
    if (arr) arr.push(e);
    else incomingByTo.set(e.to, [e]);
  }
  const runtime = new Set<string>();
  let level: string[] = [];
  for (const [id, n] of nodes) {
    if (n.seed) {
      runtime.add(id);
      level.push(id);
    }
  }
  for (let hop = 1; hop <= maxDepth && level.length > 0; hop += 1) {
    const next: string[] = [];
    for (const id of level) {
      // A stop node (entry/test) is runtime-reached but never expanded further.
      const n = nodes.get(id)!;
      if (!n.seed && (isTestFile(n.ref.path) || entryOf(n.ref.path) !== null)) continue;
      for (const e of incomingByTo.get(id) ?? []) {
        if (runtime.has(e.from)) continue;
        runtime.add(e.from);
        next.push(e.from);
      }
    }
    level = next;
  }

  // ---- ranks (one chunked read over the visited files) ----
  const files = [...new Set([...nodes.values()].map((n) => n.ref.path))];
  const ranks = new Map<string, number>();
  for (const chunk of chunked(files, BLAST_QUERY_CHUNK)) {
    const got = await source.fileRanks(chunk);
    for (const p of chunk) ranks.set(p, got.get(p) ?? 0);
  }
  const rankOf = (path: string): number => ranks.get(path) ?? 0;

  // ---- classify + order ----
  interface Out {
    id: string;
    n: Node;
    role: BlastGraphNode['role'];
    entry: EntryClass | null;
    tier: 0 | 1 | 2;
  }
  const all: Out[] = [];
  for (const [id, n] of nodes) {
    const entry = isTestFile(n.ref.path) ? null : entryOf(n.ref.path);
    let role: BlastGraphNode['role'];
    if (n.seed) role = 'changed';
    else if (isTestFile(n.ref.path)) role = 'test';
    else if (entry) role = 'entry_point';
    else role = 'impacted';
    all.push({ id, n, role, entry, tier: role === 'changed' ? 0 : role === 'entry_point' ? 1 : 2 });
  }
  all.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.tier === 0 ? 0 : a.n.depth - b.n.depth) ||
      (a.tier === 0 ? 0 : rankOf(b.n.ref.path) - rankOf(a.n.ref.path)) ||
      cmp(a.id, b.id),
  );

  // ---- entry points / tests (full counts, capped lists) ----
  const entryByFile = new Map<string, BlastEntryPoint>();
  const testByFile = new Map<string, BlastAffectedTest>();
  for (const o of all) {
    const path = o.n.ref.path;
    if (isTestFile(path)) {
      const prev = testByFile.get(path);
      if (!prev || o.n.depth < prev.depth) testByFile.set(path, { path, depth: o.n.depth });
    } else if (o.entry) {
      const prev = entryByFile.get(path);
      if (!prev || o.n.depth < prev.depth) entryByFile.set(path, { path, type: o.entry.type, label: o.entry.label, depth: o.n.depth });
    }
  }
  const byDepthRankPath = <T extends { path: string; depth: number }>(a: T, b: T): number =>
    a.depth - b.depth || rankOf(b.path) - rankOf(a.path) || cmp(a.path, b.path);
  const entryAll = [...entryByFile.values()].sort(byDepthRankPath);
  const testAll = [...testByFile.values()].sort(byDepthRankPath);

  // ---- truncation: changed, then entry points, then impacted (depth asc, rank desc) ----
  const kept = all.slice(0, MAX_BLAST_NODES);
  const keptIds = new Set(kept.map((o) => o.id));
  const depthOf = (id: string): number => nodes.get(id)?.depth ?? 0;
  const keptEdgesAll = [...edges.values()].filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
  keptEdgesAll.sort(
    (a, b) =>
      Number(!isRuntimeEdgeKind(a.kind)) - Number(!isRuntimeEdgeKind(b.kind)) ||
      depthOf(a.from) - depthOf(b.from) ||
      cmp(a.from, b.from) ||
      cmp(a.to, b.to) ||
      a.line - b.line,
  );
  const keptEdges = keptEdgesAll.slice(0, MAX_BLAST_EDGES);

  const outNodes: BlastGraphNode[] = kept.map(({ id, n, role, entry }) => {
    const node: BlastGraphNode = {
      id,
      kind: 'symbol',
      name: n.ref.name,
      path: n.ref.path,
      role,
      depth: n.depth,
      symbolKind: n.kind ?? (n.ref.name === MODULE_SYMBOL ? 'module' : null),
      rank: rankOf(n.ref.path),
    };
    if (n.deleted) node.deleted = true;
    if (!n.seed && !runtime.has(id)) node.typeOnly = true;
    if (entry) node.entryLabel = entry.label;
    return node;
  });
  const outEdges: BlastGraphEdge[] = keptEdges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    confidence: e.confidence,
    typeOnly: !isRuntimeEdgeKind(e.kind),
    line: e.line,
  }));

  const nodesDropped = all.length - kept.length;
  const edgesDropped = edges.size - keptEdges.length;

  const directCallers: DirectCaller[] = [];
  for (const e of edges.values()) {
    const to = nodes.get(e.to)!;
    const from = nodes.get(e.from)!;
    if (!to.seed || from.ref.path === to.ref.path) continue;
    directCallers.push({ from: from.ref, via: to.ref, line: e.line, rank: rankOf(from.ref.path) });
  }
  directCallers.sort((a, b) => b.rank - a.rank || cmp(nodeId(a.from), nodeId(b.from)) || a.line - b.line);

  const impactedFiles = [...new Set([...nodes.values()].filter((n) => !n.seed).map((n) => n.ref.path))].sort();

  return {
    graph: {
      nodes: outNodes,
      edges: outEdges,
      truncation: {
        truncated: nodesDropped > 0 || edgesDropped > 0 || totalsCapped,
        nodesDropped,
        edgesDropped,
        totalsCapped,
        maxDepth,
        maxNodes: MAX_BLAST_NODES,
        maxEdges: MAX_BLAST_EDGES,
      },
      entryPoints: { items: entryAll.slice(0, MAX_BLAST_ENTRY_POINTS), total: entryAll.length },
      tests: { items: testAll.slice(0, MAX_BLAST_TESTS), total: testAll.length },
    },
    discovered: { nodes: nodes.size, edges: edges.size },
    directCallers,
    impactedFiles,
    facts,
  };
}

/** A `BlastSource` over an in-memory edge list (fixture gate, tests, overlay merge base). */
export function memoryBlastSource(
  edges: readonly SymbolEdgeRow[],
  extra: { facts?: ReadonlyMap<string, FileFactsLite>; ranks?: ReadonlyMap<string, number> } = {},
): BlastSource {
  const byTarget = new Map<string, SymbolEdgeRow[]>();
  for (const e of edges) {
    const k = `${e.toPath}#${e.toName}`;
    const arr = byTarget.get(k);
    if (arr) arr.push(e);
    else byTarget.set(k, [e]);
  }
  return {
    incomingEdges: async (targets) => targets.flatMap((t) => byTarget.get(nodeId(t)) ?? []),
    fileFacts: async (paths) => new Map(paths.flatMap((p) => (extra.facts?.has(p) ? [[p, extra.facts.get(p)!] as const] : []))),
    fileRanks: async (paths) => new Map(paths.map((p) => [p, extra.ranks?.get(p) ?? 0] as const)),
  };
}
