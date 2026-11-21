/**
 * Projections of a `BlastGraphResult` (plan 19 / P2-B): the legacy flat
 * `BlastResult` list shape (Brief / callers), plus the "nothing to show"
 * result builders. Pure — no I/O.
 */
import { clampDepth } from './graph/blast.js';
import { MAX_BLAST_EDGES, MAX_BLAST_NODES, MAX_CALLERS_PER_SYMBOL } from './constants.js';
import type { BlastCallerRow, BlastGraphResult, BlastRequest, BlastResult, IndexState } from './types.js';

export function blastIndexInfo(state: IndexState | null, lowConfidence: boolean | undefined): BlastGraphResult['index'] {
  return {
    status: state?.status ?? null,
    indexedSha: state?.lastIndexedSha ? state.lastIndexedSha : null,
    lowConfidence: lowConfidence === true,
    coverage: state?.coverage ?? null,
    reindexing: state?.reindexing ?? null,
  };
}

export function emptyBlastGraphResult(
  req: BlastRequest,
  state: IndexState | null,
  extra: Partial<BlastGraphResult> = {},
): BlastGraphResult {
  const indexedSha = state?.lastIndexedSha ? state.lastIndexedSha : null;
  return {
    graph: {
      nodes: [],
      edges: [],
      truncation: {
        truncated: false,
        nodesDropped: 0,
        edgesDropped: 0,
        totalsCapped: false,
        maxDepth: clampDepth(req.depth),
        maxNodes: MAX_BLAST_NODES,
        maxEdges: MAX_BLAST_EDGES,
      },
      entryPoints: { items: [], total: 0 },
      tests: { items: [], total: 0 },
    },
    overlay: {
      staleOverlay: req.baseSha === null || indexedSha !== req.baseSha,
      overlayDegraded: false,
      degradedFiles: [],
      degradedCount: 0,
      baseSha: req.baseSha,
      headSha: req.headSha ?? '',
      indexedSha,
    },
    index: blastIndexInfo(state, false),
    reindexing: null,
    changed: [],
    projection: { callers: [], impactedEndpoints: [], factsByFile: {} },
    ...extra,
  };
}

/** Flat list projection for Brief / legacy callers; callers capped per changed symbol (rank desc). */
export function toLegacyBlastResult(res: BlastGraphResult): BlastResult {
  if (res.reindexing) {
    return { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' };
  }
  const perSymbol = new Map<string, number>();
  const callers: BlastCallerRow[] = [];
  for (const c of res.projection.callers) {
    const n = perSymbol.get(c.viaSymbol) ?? 0;
    if (n >= MAX_CALLERS_PER_SYMBOL) continue;
    perSymbol.set(c.viaSymbol, n + 1);
    callers.push(c);
  }
  return {
    changedSymbols: res.changed.map((c) => ({ file: c.file, name: c.name, kind: c.kind })),
    callers,
    impactedEndpoints: res.projection.impactedEndpoints,
    factsByFile: res.projection.factsByFile,
    degraded: false,
  };
}
