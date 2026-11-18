/**
 * repo-intel pipeline — `runIncremental`.
 *
 * Cheap path the polling/refresh hook takes. Flow:
 *   1. No state row OR indexer-version mismatch → delegate to runFullIndex.
 *   2. `currentSha === lastIndexedSha`            → touch updated_at, exit.
 *   3. `git diff --name-only base..head` ∩ SUPPORTED_EXT
 *        - 0 files → bump lastIndexedSha, exit (code didn't move in a parsed ext).
 *        - >INCREMENTAL_FULL_THRESHOLD → delegate to runFullIndex (cheaper than the slice).
 *      Else: delete the slice's rows + reparse + persist.
 *
 * [T3] After the slice reparse, the graph + rank are rebuilt over the full
 * file set and `decl_file` is re-resolved; the per-commit repo-map cache is
 * invalidated and re-rendered. `rank = PageRank` (D7); `hotness` is real,
 * refetched from PR history the same way `pipeline/full.ts` does — see its
 * header comment.
 */
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import type { PipelineDeps } from '../deps.js';
import { langForFile } from '../../../adapters/astgrep/index.js';
import {
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
  HOTNESS_WINDOW_DAYS,
  INDEXER_VERSION,
  SUPPORTED_EXT,
} from '../constants.js';
import { buildGraph, type GraphResult, type ParsedModule } from '../graph/index.js';
import type {
  IndexerEdgeRow,
  IndexerFileFactsRow,
  IndexerReferenceRow,
  IndexerSymbolRow,
  RepoIntelRepository,
} from '../repository.js';
import type { IndexResult, IndexStatus } from '../types.js';
import { runFullIndex, type IndexPayload } from './full.js';
import { walkClone, type WalkStats } from './walk.js';
import { contextModules } from './context.js';
import { computeFileRank } from './rank.js';
import { renderRepoMap } from './repo-map.js';
import {
  asMessage,
  makeReadText,
  parseSource,
  referenceRowsFor,
  symbolRowsFor,
} from './index-rows.js';

/**
 * Threshold above which incremental becomes more expensive than full-index.
 * Tuned against step 4. Held local here (not in constants.ts) so
 * the heuristic can move without churning the public constants module.
 */
const INCREMENTAL_FULL_THRESHOLD = 300;

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

export async function runIncremental(
  deps: PipelineDeps,
  repository: RepoIntelRepository,
  payload: IndexPayload,
): Promise<IndexResult> {
  const startedAt = Date.now();
  const repoId = payload.repoId;

  const repo = await repository.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) {
    // No clone yet → nothing to refresh against. The next CLONE job will
    // enqueue a full index; we don't try to fake one here.
    return {
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: Date.now() - startedAt,
      reason: 'no_clone',
    };
  }

  const state = await repository.tryGetIndexState(repoId);

  // (1) No state row OR indexer-version mismatch → full reindex. The version
  //     bumps whenever the parser/schema changes shape; mixing rows from two
  //     versions would corrupt downstream consumers (step 1).
  if (!state || state.indexerVersion !== INDEXER_VERSION) {
    return runFullIndex(deps, repository, payload);
  }

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  let currentSha: string;
  try {
    currentSha = await deps.git.currentHead(ref);
  } catch (err) {
    return {
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: Date.now() - startedAt,
      reason: `git_head_failed:${asMessage(err)}`,
    };
  }

  // (2) Sha unchanged → just touch updated_at so observers see liveness.
  if (currentSha === state.lastIndexedSha) {
    await repository.touchIndexState(repoId);
    return {
      status: state.status,
      filesIndexed: state.filesIndexed,
      filesSkipped: state.filesSkipped,
      durationMs: Date.now() - startedAt,
      reason: 'sha_unchanged',
    };
  }

  // (3) Compute changed-file intersection.
  let changedAll: string[];
  try {
    changedAll = await deps.git.diffNameOnly(ref, state.lastIndexedSha, currentSha);
  } catch (err) {
    // diff failure (shallow clone, missing base, etc.) — fall back to full.
    // The full path is heavier but correct; degrading silently to "no-op" would
    // leave the index drifted from HEAD.
    return runFullIndex(deps, repository, payload);
  }
  const changed = changedAll.filter((p) => SUPPORTED_SET.has(extname(p).toLowerCase()));

  if (changed.length === 0) {
    // Code didn't move in a parsed extension — just bump the sha so the next
    // diff baseline is current.
    await repository.advanceSha(repoId, currentSha);
    return {
      status: state.status,
      filesIndexed: state.filesIndexed,
      filesSkipped: state.filesSkipped,
      durationMs: Date.now() - startedAt,
      reason: 'no_supported_changes',
    };
  }

  // (4) Large diff → cheaper to redo a full index than to slice.
  if (changed.length > INCREMENTAL_FULL_THRESHOLD) {
    return runFullIndex(deps, repository, payload);
  }

  // (5) Walk the clone once: it is both the existence oracle (deleted /
  //     renamed paths are absent) and the resolver's file view.
  let walked: Awaited<ReturnType<typeof walkClone>>;
  try {
    walked = await walkClone(repo.clonePath);
  } catch {
    return runFullIndex(deps, repository, payload);
  }
  const walkSet = new Set(walked.files);
  const walkStats: WalkStats = walked.stats;
  const present = changed.filter((p) => walkSet.has(p));
  const gone = changed.filter((p) => !walkSet.has(p)); // deleted / renamed away

  // (6) AC-18 expansion: importers of changed files (through re-export chains)
  //     re-bind against the new exports; a structural change (file added or
  //     removed) can also fix/break previously `missing` specifiers.
  const indexedBefore = await repository.getIndexedPaths(repoId, present);
  const structural = gone.length > 0 || present.some((p) => !indexedBefore.has(p));
  const expansion = new Set(await repository.getImpactedImporters(repoId, changed));
  if (structural) {
    for (const f of await repository.getFilesWithRecoverableImports(repoId)) expansion.add(f);
  }
  const affected = [...new Set([...present, ...[...expansion].filter((p) => walkSet.has(p))])];
  if (affected.length > INCREMENTAL_FULL_THRESHOLD) {
    return runFullIndex(deps, repository, payload);
  }
  const affectedSet = new Set(affected);

  // (7) Re-read + re-parse the affected slice (one read per file).
  const parsedModules: ParsedModule[] = [];
  const hashByPath = new Map<string, string>();
  const factsBuf: IndexerFileFactsRow[] = [];
  let filesIndexed = 0;
  let filesSkipped = 0;
  const parseDegraded: Array<{ file: string; reason: string }> = [];

  // Deleted / renamed-away paths: their rows are cleared below; they are still
  // reported (skipped + parseDegraded) exactly as v1 did for a vanished file.
  for (const relPath of gone) {
    filesSkipped += 1;
    parseDegraded.push({ file: relPath, reason: 'ENOENT: no such file (deleted or renamed)' });
  }

  for (const relPath of affected) {
    if (!langForFile(relPath)) {
      filesSkipped += 1;
      continue;
    }
    let source: string;
    try {
      source = await readFile(join(repo.clonePath, relPath), 'utf8');
    } catch (err) {
      // Vanished between the walk and the read — count as skipped (its old
      // rows still get cleared below).
      filesSkipped += 1;
      parseDegraded.push({ file: relPath, reason: asMessage(err) });
      continue;
    }
    try {
      const parsed = await parseSource(relPath, source);
      parsedModules.push({ path: relPath, facts: parsed.facts });
      hashByPath.set(relPath, parsed.contentHash);
      if (parsed.endpoints.length > 0 || parsed.crons.length > 0) {
        factsBuf.push({ filePath: relPath, endpoints: parsed.endpoints, crons: parsed.crons });
      }
      filesIndexed += 1;
    } catch (err) {
      filesSkipped += 1;
      parseDegraded.push({ file: relPath, reason: asMessage(err) });
    }
  }

  // (8) Graph over the WHOLE repo: freshly parsed slice + the persisted
  //     imports/exports/symbols of everything else as binding context. Only
  //     the slice's rows are written back; file_edges is rebuilt globally.
  let graphFailed: string | undefined;
  let graph: GraphResult | null = null;
  try {
    const context = await repository.getGraphContext(repoId);
    const all = [...parsedModules, ...contextModules(context, affectedSet)];
    const instance = deps.resolver.create({
      root: repo.clonePath,
      files: new Set([...walkSet, ...(walked.jsonFiles ?? [])]),
      readText: makeReadText(repo.clonePath),
    });
    graph = buildGraph(all, instance);
  } catch (err) {
    graphFailed = asMessage(err);
  }

  const declsByFile = new Map<string, GraphResult['referencesDeclFile']>();
  for (const d of graph?.referencesDeclFile ?? []) {
    if (!affectedSet.has(d.file)) continue;
    const list = declsByFile.get(d.file);
    if (list) list.push(d);
    else declsByFile.set(d.file, [d]);
  }
  const symbolsBuf: IndexerSymbolRow[] = [];
  const refsBuf: IndexerReferenceRow[] = [];
  for (const m of parsedModules) {
    const hash = hashByPath.get(m.path)!;
    symbolsBuf.push(...symbolRowsFor(repoId, m.path, hash, m.facts));
    refsBuf.push(
      ...referenceRowsFor(repoId, m.path, hash, m.facts, graph ? (declsByFile.get(m.path) ?? []) : null),
    );
  }

  // Replace semantics over everything the slice owned, incl. deleted paths.
  const owned = [...new Set([...affected, ...gone])];
  await repository.deleteForFiles(repoId, owned);
  await repository.insertSymbols(symbolsBuf);
  await repository.insertReferences(refsBuf);
  await repository.patchFileFacts(repoId, owned, factsBuf);
  await repository.replaceGraphRowsForFiles(repoId, owned, {
    imports: graph ? graph.imports.filter((r) => affectedSet.has(r.fromFile)) : [],
    exports: graph ? graph.exports.filter((r) => affectedSet.has(r.file)) : [],
    edges: graph ? graph.edges.filter((r) => affectedSet.has(r.fromPath)) : [],
  });

  // --- T3: file_edges + rank + repo-map ---------------------------------
  let edgeRows: IndexerEdgeRow[] = [];
  let hotnessPrs = 0;
  if (graph) {
    try {
      edgeRows = graph.fileEdges.map((e) => ({ fromFile: e.from, toFile: e.to }));
      await repository.replaceEdges(repoId, edgeRows);

      // Hotness (D6): same source as pipeline/full.ts — already-ingested PR
      // history, never git log.
      const since = new Date(Date.now() - HOTNESS_WINDOW_DAYS * 86_400_000);
      const churn = await repository.getPrChurn(repoId, since);
      hotnessPrs = churn.prsConsidered;
      const churnMap = new Map(churn.counts.map((c) => [c.path, c.prs]));

      const rankRows = computeFileRank(walked.files, edgeRows, churnMap);
      await repository.replaceFileRank(repoId, rankRows);
      // The repo-map is keyed per commit_sha → prior entries are now stale.
      const candidates = await repository.getRepoMapCandidates(repoId);
      const map = renderRepoMap(candidates, deps.tokenizer, DEFAULT_REPO_MAP_TOKEN_BUDGET);
      await repository.deleteRepoMapCache(repoId);
      await repository.putRepoMapCache(
        repoId,
        currentSha,
        DEFAULT_REPO_MAP_TOKEN_BUDGET,
        map.text,
        map.tokens,
      );
    } catch (err) {
      graphFailed = asMessage(err);
    }
  }
  const tsconfigFailures = graph?.coverage.tsconfigFailures ?? [];

  // Keep 'full' only if the prior index was full AND this slice stayed clean.
  const clean = parseDegraded.length === 0 && !graphFailed && tsconfigFailures.length === 0;
  const status: IndexStatus = clean && state.status === 'full' ? 'full' : 'partial';

  const stats: Record<string, unknown> = {
    // walkClone already ran above (to rebuild the graph over the full file
    // set) — its bounded/totalCandidates would otherwise be silently lost on
    // every incremental refresh (AC-18 needs this to survive a refresh).
    ...walkStats,
    incremental: true,
    changedFiles: changed.length,
    affectedFiles: affected.length,
    deletedFiles: gone.length,
    symbolsWritten: symbolsBuf.length,
    referencesWritten: refsBuf.length,
    edgesWritten: edgeRows.length,
    hotnessPrs,
    hotnessWindowDays: HOTNESS_WINDOW_DAYS,
    hotnessAvailable: hotnessPrs > 0,
    ...(graphFailed ? { graphFailed } : {}),
    ...(tsconfigFailures.length > 0 ? { tsconfigFailures: tsconfigFailures.length } : {}),
    parseDegraded,
    durationMs: Date.now() - startedAt,
  };

  // The aggregate filesIndexed counter on `repo_index_state` is the prior
  // count + this slice. Symbols/references for unchanged files are still in
  // the table, so the counter must reflect total coverage.
  const newFilesIndexed = state.filesIndexed + filesIndexed;
  const newFilesSkipped = state.filesSkipped + filesSkipped;

  await repository.upsertIndexState({
    repoId,
    lastIndexedSha: currentSha,
    indexerVersion: INDEXER_VERSION,
    status,
    filesIndexed: newFilesIndexed,
    filesSkipped: newFilesSkipped,
    stats,
    coverage: graph?.coverage ?? undefined,
    tsconfigFailures: graph ? tsconfigFailures : undefined,
  });

  return {
    status,
    filesIndexed,
    filesSkipped,
    durationMs: Date.now() - startedAt,
    reason: 'incremental',
  };
}

