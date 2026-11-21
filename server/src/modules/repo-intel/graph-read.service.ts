/**
 * ProjectGraphReader implementation (specs/18, plan 19 P4-A).
 *
 * Application service: orchestrates the read repository and the pure graph
 * core (`graph/aggregate.ts`, `graph/scc.ts`). Reads are side-effect free — it
 * never enqueues a reindex, never writes. Takes the repository, never the DI
 * container.
 */
import {
  DEFAULT_FILE_PAGE_SIZE,
  MAX_CYCLE_MEMBERS,
  MAX_CYCLES,
  MAX_FILE_PAGE_SIZE,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  MAX_HOT_FILES,
  MAX_SYMBOL_PAGE,
  MAX_UNRESOLVED_PAGE_SIZE,
  type ProjectGraph,
  type ProjectGraphEdge,
  type ProjectGraphEmpty,
  type ProjectGraphFiles,
  type ProjectGraphIndex,
  type ProjectGraphNode,
  type ProjectGraphReindexing,
  type ProjectGraphSymbols,
  type ProjectGraphUnresolved,
} from '../../vendor/shared/index.js';
import { OVERVIEW_TARGET_NODES } from './constants.js';
import type {
  ProjectGraphFilesQuery,
  ProjectGraphQuery,
  ProjectGraphReader,
  ProjectGraphSymbolsQuery,
  ProjectGraphUnresolvedQuery,
} from '../../domain/ports/project-graph.js';
import { NotFoundError } from '../../platform/errors.js';
import { INDEXER_VERSION, INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from './constants.js';
import {
  aggregateDirFocus,
  aggregateOverview,
  buildFileTable,
  capGraph,
  chooseDepth,
  topHotFiles,
  type AggNode,
  type FileInfo,
} from './graph/aggregate.js';
import { findCycles, summarizeCycles, type CycleSummary } from './graph/scc.js';
import type { GraphReadRepository } from './graph-read.repository.js';

/** The slice of the repository this service needs (lets tests inject a fake). */
export type GraphReadStore = Pick<
  GraphReadRepository,
  | 'getIndexState'
  | 'hasActiveIndexJob'
  | 'listFiles'
  | 'listFileEdges'
  | 'countSymbols'
  | 'listSymbols'
  | 'listSymbolEdges'
  | 'symbolDegrees'
  | 'countUnresolved'
  | 'listUnresolved'
>;

const CYCLE_CACHE_MAX = 64;

type Prelude =
  | { ok: false; response: ProjectGraphEmpty | ProjectGraphReindexing }
  | { ok: true; index: ProjectGraphIndex };

const clampInt = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(Number.isFinite(n) ? n : min)));

export class GraphReadService implements ProjectGraphReader {
  /** Memoised cycle analysis per (repoId, lastIndexedSha, indexerVersion). */
  private readonly cycleCache = new Map<string, CycleSummary>();

  constructor(private readonly store: GraphReadStore) {}

  // ---- public reads ------------------------------------------------------

  async getGraph(repoId: string, query: ProjectGraphQuery): Promise<ProjectGraph> {
    const pre = await this.prelude(repoId);
    if (!pre.ok) return pre.response;
    const files = await this.store.listFiles(repoId);
    const cycles = await this.cycles(repoId, pre.index);
    const hot = topHotFiles(files, MAX_HOT_FILES);
    const hotSet = new Set(hot.map((h) => h.path));
    const hotFiles = hot.map((h) => ({ path: h.path, rank: h.rank, hotness: h.hotness }));
    const cyclesDto = {
      items: cycles.items,
      total: cycles.total,
      filesInCycles: cycles.cycleFiles.size,
    };

    if (query.file !== undefined) {
      const file = query.file;
      this.requireFile(files, file);
      const page = clampInt(query.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
      const { nodes, edges, truncation, total } = await this.fileFocus(
        repoId,
        file,
        page,
        files,
        cycles.cycleFiles,
        hotSet,
      );
      return {
        state: 'ready',
        index: pre.index,
        focus: { mode: 'file', depth: null, dir: null, file },
        nodes,
        edges,
        truncation,
        cycles: cyclesDto,
        hotFiles,
        symbolPage: { page, pageSize: MAX_SYMBOL_PAGE, total },
      };
    }

    const fileEdges = await this.store.listFileEdges(repoId);
    let agg;
    let focus;
    if (query.dir !== undefined) {
      this.requireDir(files, query.dir);
      agg = aggregateDirFocus(files, fileEdges, query.dir);
      focus = { mode: 'dir' as const, depth: null, dir: query.dir, file: null };
    } else {
      const depth = query.depth ?? chooseDepth(files, OVERVIEW_TARGET_NODES);
      agg = aggregateOverview(files, fileEdges, depth);
      focus = { mode: 'overview' as const, depth, dir: null, file: null };
    }
    const capped = capGraph(
      agg.nodes,
      agg.edges,
      // Focus children before aggregate neighbours, then by rank.
      (n) => (n.aggregate ? 0 : 1_000_000) + n.rank,
      MAX_GRAPH_NODES,
      MAX_GRAPH_EDGES,
    );
    return {
      state: 'ready',
      index: pre.index,
      focus,
      nodes: capped.nodes.map((n) => this.toNode(n, cycles.cycleFiles, hotSet)),
      edges: capped.edges.map((e) => ({ from: e.from, to: e.to, weight: e.weight })),
      truncation: {
        truncated: capped.truncated,
        nodesDropped: capped.nodesDropped,
        edgesDropped: capped.edgesDropped,
        maxNodes: MAX_GRAPH_NODES,
        maxEdges: MAX_GRAPH_EDGES,
      },
      cycles: cyclesDto,
      hotFiles,
      symbolPage: null,
    };
  }

  async listFiles(repoId: string, query: ProjectGraphFilesQuery): Promise<ProjectGraphFiles> {
    const pre = await this.prelude(repoId);
    if (!pre.ok) return pre.response;
    const pageSize = clampInt(query.pageSize ?? DEFAULT_FILE_PAGE_SIZE, 1, MAX_FILE_PAGE_SIZE);
    const page = clampInt(query.page, 1, Number.MAX_SAFE_INTEGER);
    const all = await this.store.listFiles(repoId);
    let scoped = all;
    if (query.dir !== undefined) {
      this.requireDir(all, query.dir);
      const prefix = query.dir === '' ? '' : `${query.dir}/`;
      scoped = all.filter((f) => f.path.startsWith(prefix));
    }
    const [edges, cycles] = await Promise.all([
      this.store.listFileEdges(repoId),
      this.cycles(repoId, pre.index),
    ]);
    const hotSet = new Set(topHotFiles(all, MAX_HOT_FILES).map((h) => h.path));
    const rows = buildFileTable(scoped, edges, query.sort);
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
      ...r,
      hot: hotSet.has(r.path),
      inCycle: cycles.cycleFiles.has(r.path),
    }));
    return {
      state: 'ready',
      index: pre.index,
      dir: query.dir ?? null,
      items,
      page,
      pageSize,
      total: rows.length,
    };
  }

  async listUnresolved(
    repoId: string,
    query: ProjectGraphUnresolvedQuery,
  ): Promise<ProjectGraphUnresolved> {
    const pre = await this.prelude(repoId);
    if (!pre.ok) return pre.response;
    const pageSize = clampInt(query.pageSize, 1, MAX_UNRESOLVED_PAGE_SIZE);
    const page = clampInt(query.page, 1, Number.MAX_SAFE_INTEGER);
    const [total, items] = await Promise.all([
      this.store.countUnresolved(repoId),
      this.store.listUnresolved(repoId, (page - 1) * pageSize, pageSize),
    ]);
    return { state: 'ready', index: pre.index, items, page, pageSize, total };
  }

  async listSymbols(repoId: string, query: ProjectGraphSymbolsQuery): Promise<ProjectGraphSymbols> {
    const pre = await this.prelude(repoId);
    if (!pre.ok) return pre.response;
    const files = await this.store.listFiles(repoId);
    this.requireFile(files, query.file);
    const page = clampInt(query.page, 1, Number.MAX_SAFE_INTEGER);
    const [total, rows] = await Promise.all([
      this.store.countSymbols(repoId, query.file),
      this.store.listSymbols(repoId, query.file, (page - 1) * MAX_SYMBOL_PAGE, MAX_SYMBOL_PAGE),
    ]);
    const degrees = await this.store.symbolDegrees(
      repoId,
      query.file,
      rows.map((r) => r.name),
    );
    return {
      state: 'ready',
      index: pre.index,
      file: query.file,
      items: rows.map((r) => ({
        ...r,
        inCount: degrees.get(r.name)?.inCount ?? 0,
        outCount: degrees.get(r.name)?.outCount ?? 0,
      })),
      page,
      pageSize: MAX_SYMBOL_PAGE,
      total,
    };
  }

  // ---- internals ---------------------------------------------------------

  /** Index status gate shared by every read: empty / reindexing / ready. */
  private async prelude(repoId: string): Promise<Prelude> {
    const state = await this.store.getIndexState(repoId);
    if (!state) {
      const active = await this.store.hasActiveIndexJob(repoId, [
        INDEX_JOB_KIND,
        REFRESH_JOB_KIND,
        RESYNC_JOB_KIND,
      ]);
      return { ok: false, response: { state: 'empty', reason: active ? 'indexing' : 'never_indexed' } };
    }
    if (state.status === 'failed') {
      return { ok: false, response: { state: 'empty', reason: 'failed' } };
    }
    if (state.reindexState || state.indexerVersion < INDEXER_VERSION) {
      return {
        ok: false,
        response: {
          state: 'reindexing',
          reindexing: {
            state: state.reindexState ?? 'queued',
            done: state.reindexDone ?? 0,
            total: state.reindexTotal ?? 0,
          },
        },
      };
    }
    return {
      ok: true,
      index: {
        status: state.status,
        indexedSha: state.lastIndexedSha,
        indexerVersion: state.indexerVersion,
        coverage: (state.coverage as ProjectGraphIndex['coverage']) ?? null,
      },
    };
  }

  private async cycles(repoId: string, index: ProjectGraphIndex): Promise<CycleSummary> {
    const key = `${repoId}:${index.indexedSha}:${index.indexerVersion}`;
    const hit = this.cycleCache.get(key);
    if (hit) return hit;
    const edges = await this.store.listFileEdges(repoId);
    const summary = summarizeCycles(findCycles(edges), MAX_CYCLES, MAX_CYCLE_MEMBERS);
    if (this.cycleCache.size >= CYCLE_CACHE_MAX) {
      const oldest = this.cycleCache.keys().next().value;
      if (oldest !== undefined) this.cycleCache.delete(oldest);
    }
    this.cycleCache.set(key, summary);
    return summary;
  }

  private requireFile(files: readonly FileInfo[], file: string): void {
    if (!files.some((f) => f.path === file)) throw new NotFoundError(`File not in index: ${file}`);
  }

  private requireDir(files: readonly FileInfo[], dir: string): void {
    if (dir === '') return;
    const prefix = `${dir}/`;
    if (!files.some((f) => f.path.startsWith(prefix))) {
      throw new NotFoundError(`Directory not in index: ${dir}`);
    }
  }

  private toNode(n: AggNode, cycleFiles: ReadonlySet<string>, hotSet: ReadonlySet<string>): ProjectGraphNode {
    return {
      id: n.id,
      kind: n.kind,
      label: n.label,
      path: n.path,
      fileCount: n.fileCount,
      aggregate: n.aggregate,
      rank: n.rank,
      hot: n.files.some((f) => hotSet.has(f)),
      inCycle: n.files.some((f) => cycleFiles.has(f)),
    };
  }

  /** `file=` focus: that file's symbols (paged) + in/out symbol edges. */
  private async fileFocus(
    repoId: string,
    file: string,
    page: number,
    files: readonly FileInfo[],
    cycleFiles: ReadonlySet<string>,
    hotSet: ReadonlySet<string>,
  ) {
    const [total, symbols] = await Promise.all([
      this.store.countSymbols(repoId, file),
      this.store.listSymbols(repoId, file, (page - 1) * MAX_SYMBOL_PAGE, MAX_SYMBOL_PAGE),
    ]);
    const names = symbols.map((s) => s.name);
    const rawEdges = await this.store.listSymbolEdges(repoId, file, names, MAX_GRAPH_EDGES + 1);
    const rankOf = new Map(files.map((f) => [f.path, f.rank]));
    const id = (path: string, name: string): string => `${path}#${name}`;

    const nodeMap = new Map<string, ProjectGraphNode & { prio: number }>();
    for (const s of symbols) {
      nodeMap.set(id(file, s.name), {
        id: id(file, s.name),
        kind: 'symbol',
        label: s.name,
        path: file,
        fileCount: 1,
        aggregate: false,
        rank: rankOf.get(file) ?? 0,
        hot: hotSet.has(file),
        inCycle: cycleFiles.has(file),
        symbolKind: s.kind,
        exported: s.exported,
        prio: 1,
      });
    }
    const edgeMap = new Map<string, ProjectGraphEdge>();
    for (const e of rawEdges) {
      for (const [p, n] of [
        [e.fromPath, e.fromName],
        [e.toPath, e.toName],
      ] as const) {
        const nid = id(p, n);
        if (!nodeMap.has(nid)) {
          nodeMap.set(nid, {
            id: nid,
            kind: 'symbol',
            label: n,
            path: p,
            fileCount: 1,
            aggregate: false,
            rank: rankOf.get(p) ?? 0,
            hot: hotSet.has(p),
            inCycle: cycleFiles.has(p),
            prio: 0,
          });
        }
      }
      const from = id(e.fromPath, e.fromName);
      const to = id(e.toPath, e.toName);
      if (from === to) continue;
      const k = `${from}\0${to}`;
      const cur = edgeMap.get(k);
      if (cur) {
        cur.weight++;
        if (e.confidence === 'inferred') cur.confidence = 'inferred';
      } else {
        edgeMap.set(k, { from, to, weight: 1, kind: e.kind, confidence: e.confidence });
      }
    }
    // The +1 probe row means the edge list itself was cut by the SQL LIMIT.
    const edgeLimited = rawEdges.length > MAX_GRAPH_EDGES;
    const capped = capGraph(
      [...nodeMap.values()],
      [...edgeMap.values()],
      (n) => n.prio * 1_000_000 + n.rank,
      MAX_GRAPH_NODES,
      MAX_GRAPH_EDGES,
    );
    return {
      total,
      nodes: capped.nodes.map(({ prio: _p, ...n }) => n),
      edges: capped.edges,
      truncation: {
        truncated: capped.truncated || edgeLimited,
        nodesDropped: capped.nodesDropped,
        edgesDropped: capped.edgesDropped + (edgeLimited ? 1 : 0),
        maxNodes: MAX_GRAPH_NODES,
        maxEdges: MAX_GRAPH_EDGES,
      },
    };
  }
}
