/**
 * repo-intel pipeline — file ranking (step 6, T3).
 *
 * `hotness` is real and persisted: it's the third, optional `churn` argument
 * below, normalized to `[0, 1]` over the files being ranked (D6/AC-7/AC-9).
 * `rank` deliberately stays `= pagerank` and is NOT redefined as
 * `pagerank * (1 + hotness)` — three already-shipped features read the
 * persisted `rank` (repo-map rendering, blast-radius caller ordering,
 * conventions sampling), and D7 keeps their ordering untouched (AC-11). The
 * weighted product is derived at READ TIME, by the onboarding module only
 * (`RepoIntelService.getWeightedRankedFiles`), from the two values `file_rank`
 * already stores separately — never written back here.
 *
 * Graph: nodes are indexed files; a directed edge `importer → imported` per
 * `file_edges` row. PageRank then accrues to depended-upon ("foundational")
 * files — exactly the "core files everything imports rank high" intuition, and
 * faithful to Aider's repo-map (which ranks by graph, not churn).
 *
 * Pure + deterministic given (files, edges, churn): no DB, no git, no clock —
 * the caller (`pipeline/full.ts` / `pipeline/incremental.ts`) resolves the
 * churn window against `Date.now()` and fetches the raw PR-file counts before
 * calling in.
 */
import Graph from 'graphology';
import { centrality } from 'graphology-metrics';
import type { IndexerEdgeRow, IndexerFileRankRow } from '../repository.js';

/**
 * Compute `file_rank` rows for `files` over the import graph `edges`, plus
 * `hotness` from the optional `churn` map of RAW PR-file counts (path → count
 * within the recency window; `RepoIntelRepository.getPrChurn`'s `counts`,
 * collapsed to a map by the caller).
 *
 * `hotness` is normalized over the INTERSECTION of `churn` and `files` only —
 * a churned path that isn't in `files` (not indexed) is ignored, never added
 * as a node (AC-10) — as `count / max(count)` over that intersection, so the
 * most-changed indexed file gets `hotness = 1`. Absent `churn`, or a zero max
 * (no PR touched any indexed file in the window), every file's `hotness` is 0
 * (AC-9) — identical to today's pure-PageRank behavior.
 *
 * Isolated files (no edges) get PageRank's uniform floor; an empty/degenerate
 * graph degrades to a flat ranking rather than throwing.
 */
export function computeFileRank(
  files: string[],
  edges: IndexerEdgeRow[],
  churn?: ReadonlyMap<string, number>,
): IndexerFileRankRow[] {
  if (files.length === 0) return [];

  const graph = new Graph({ type: 'directed', allowSelfLoops: false, multi: false });
  for (const f of files) graph.mergeNode(f);
  for (const e of edges) {
    if (e.fromFile === e.toFile) continue;
    if (!graph.hasNode(e.fromFile) || !graph.hasNode(e.toFile)) continue;
    graph.mergeEdge(e.fromFile, e.toFile);
  }

  let pr: Record<string, number>;
  try {
    pr = centrality.pagerank(graph) as Record<string, number>;
  } catch {
    // Degenerate graph — fall back to a uniform score so the pipeline still
    // produces a (flat) ranking. stats.graphFailed already records the cause.
    const uniform = 1 / files.length;
    pr = Object.fromEntries(files.map((f) => [f, uniform]));
  }

  // Max churn over the intersection of `files` and `churn` only — iterating
  // `files` (never `churn`'s own keys) is what makes an un-indexed PR path
  // impossible to introduce as a node (AC-10).
  let maxChurn = 0;
  if (churn) {
    for (const f of files) {
      const c = churn.get(f);
      if (c !== undefined && c > maxChurn) maxChurn = c;
    }
  }

  const base = files.map((f) => {
    const score = pr[f] ?? 0;
    const rawChurn = churn?.get(f) ?? 0;
    const hotness = maxChurn > 0 ? rawChurn / maxChurn : 0;
    return { filePath: f, pagerank: score, hotness, rank: score };
  });

  // Percentile via "share of files with rank ≤ this rank" so ties share a
  // value (round to the rightmost position of the tie group). Higher rank →
  // higher percentile; top file → ~100.
  const asc = [...base].sort((a, b) => a.rank - b.rank);
  const n = asc.length;
  const pctByPath = new Map<string, number>();
  for (let i = 0; i < n; ) {
    const groupRank = asc[i]!.rank;
    let j = i;
    while (j + 1 < n && asc[j + 1]!.rank === groupRank) j += 1;
    const pct = Math.round((100 * (j + 1)) / n);
    for (let k = i; k <= j; k += 1) pctByPath.set(asc[k]!.filePath, pct);
    i = j + 1;
  }

  return base.map((r) => ({ ...r, percentile: pctByPath.get(r.filePath) ?? 0 }));
}
