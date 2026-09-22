/**
 * Use case — incremental refresh (the polling/refresh/resync path). Flow:
 *   1. No state row OR indexer-version mismatch → delegate to runFullIndex.
 *   2. `currentSha === lastIndexedSha`            → touch updated_at, exit.
 *   3. `git diff --name-only base..head` ∩ SUPPORTED_EXT
 *        - diff fails → full index (correct, heavier)
 *        - 0 files → bump lastIndexedSha, exit.
 *        - > INCREMENTAL_FULL_THRESHOLD → full index (cheaper than the slice).
 *      Else: reparse the slice, rebuild graph + rank over the whole file set,
 *      and persist in ONE transaction; the graph/rank/map step runs in a
 *      SAVEPOINT so its failure only degrades the status to 'partial'.
 */
import { extname } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import { DEFAULT_REPO_MAP_TOKEN_BUDGET, INDEXER_VERSION, SUPPORTED_EXT } from '../constants.js';
import type { IndexerEdgeRow } from '../domain/model.js';
import { computeFileRank } from '../domain/rank.js';
import { renderRepoMap } from '../domain/repo-map.js';
import type { IndexResult, IndexStatus } from '../types.js';
import { runFullIndex, type IndexPayload } from './full-index.js';
import { asMessage, emptyBuffers, parseSourceFile } from './parse-sources.js';
import type { IndexerDeps } from './ports.js';

/** Above this many changed files a full index is cheaper than the slice. */
const INCREMENTAL_FULL_THRESHOLD = 300;

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

export async function runIncremental(deps: IndexerDeps, payload: IndexPayload): Promise<IndexResult> {
  const startedAt = Date.now();
  const repoId = payload.repoId;
  const finish = (
    status: IndexStatus,
    filesIndexed: number,
    filesSkipped: number,
    reason: string,
  ): IndexResult => ({ status, filesIndexed, filesSkipped, durationMs: Date.now() - startedAt, reason });

  const repo = await deps.reader.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) {
    // No clone yet → nothing to refresh against; the clone job enqueues a full index.
    return finish('degraded', 0, 0, 'no_clone');
  }
  const root = repo.clonePath;

  const state = await deps.reader.tryGetIndexState(repoId);

  // (1) Mixing rows from two indexer versions would corrupt consumers.
  if (!state || state.indexerVersion !== INDEXER_VERSION) {
    return runFullIndex(deps, payload);
  }

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  let currentSha: string;
  try {
    currentSha = await deps.git.currentHead(ref);
  } catch (err) {
    return finish('degraded', 0, 0, `git_head_failed:${asMessage(err)}`);
  }

  // (2) Sha unchanged → just touch updated_at so observers see liveness.
  if (currentSha === state.lastIndexedSha) {
    await deps.state.touchIndexState(repoId);
    return finish(state.status, state.filesIndexed, state.filesSkipped, 'sha_unchanged');
  }

  // (3) Changed-file intersection.
  let changedAll: string[];
  try {
    changedAll = await deps.git.diffNameOnly(ref, state.lastIndexedSha, currentSha);
  } catch {
    // Shallow clone / missing base — a silent no-op would leave the index
    // drifted from HEAD, so fall back to the (heavier but correct) full path.
    return runFullIndex(deps, payload);
  }
  const changed = changedAll.filter((p) => SUPPORTED_SET.has(extname(p).toLowerCase()));

  if (changed.length === 0) {
    await deps.state.advanceSha(repoId, currentSha);
    return finish(state.status, state.filesIndexed, state.filesSkipped, 'no_supported_changes');
  }

  // (4) Large diff → cheaper to redo a full index than to slice.
  if (changed.length > INCREMENTAL_FULL_THRESHOLD) {
    return runFullIndex(deps, payload);
  }

  // (5) Slice path: reparse the changed files (a deleted file counts as
  //     skipped; its old rows are still cleared below).
  const buf = emptyBuffers();
  let filesIndexed = 0;
  let filesSkipped = 0;
  const parseDegraded: Array<{ file: string; reason: string }> = [];
  for (const relPath of changed) {
    const outcome = await parseSourceFile(deps, repoId, root, relPath, buf);
    if (outcome.kind === 'indexed') {
      filesIndexed += 1;
      continue;
    }
    filesSkipped += 1;
    if (outcome.kind === 'failed') parseDegraded.push({ file: relPath, reason: outcome.reason });
  }

  // --- T3 graph build (outside I/O: runs BEFORE the persist transaction) ---
  // The symbol reparse is sliced, but graph + rank are global, so they are
  // rebuilt over the full file set (cheap vs. a whole-tree AST parse).
  let graphFailed: string | undefined;
  let edgeRows: IndexerEdgeRow[] = [];
  let allFiles: string[] = [];
  try {
    allFiles = (await deps.files.walk(root)).files;
    const edges = await deps.graph.buildEdges(root, allFiles);
    edgeRows = edges.map((e) => ({ fromFile: e.from, toFile: e.to }));
  } catch (err) {
    graphFailed = asMessage(err);
  }

  const status = await deps.tx.run(async ({ index }): Promise<IndexStatus> => {
    await index.deleteForFiles(repoId, changed);
    await index.insertSymbols(buf.symbols);
    await index.insertReferences(buf.references);
    await index.patchFileFacts(repoId, changed, buf.facts);

    if (!graphFailed) {
      try {
        await index.savepoint(async (sp) => {
          await sp.replaceEdges(repoId, edgeRows);
          // reset: a changed decl-file can invalidate a prior resolution.
          await sp.resolveReferences(repoId, { reset: true });
          await sp.replaceFileRank(repoId, computeFileRank(allFiles, edgeRows));
          // The repo-map is keyed per commit_sha → prior entries are now stale.
          const candidates = await sp.getRepoMapCandidates(repoId);
          const map = renderRepoMap(candidates, deps.tokenizer, DEFAULT_REPO_MAP_TOKEN_BUDGET);
          await sp.deleteRepoMapCache(repoId);
          await sp.putRepoMapCache(repoId, currentSha, DEFAULT_REPO_MAP_TOKEN_BUDGET, map.text, map.tokens);
        });
      } catch (err) {
        graphFailed = asMessage(err);
      }
    }

    // Keep 'full' only if the prior index was full AND this slice stayed clean.
    const clean = parseDegraded.length === 0 && !graphFailed;
    const sliceStatus: IndexStatus = clean && state.status === 'full' ? 'full' : 'partial';

    // Rows of unchanged files stay in the table, so the aggregate counters are
    // the prior totals + this slice.
    await index.upsertIndexState({
      repoId,
      lastIndexedSha: currentSha,
      indexerVersion: INDEXER_VERSION,
      status: sliceStatus,
      filesIndexed: state.filesIndexed + filesIndexed,
      filesSkipped: state.filesSkipped + filesSkipped,
      stats: {
        incremental: true,
        changedFiles: changed.length,
        symbolsWritten: buf.symbols.length,
        referencesWritten: buf.references.length,
        edgesWritten: edgeRows.length,
        hotnessAvailable: false,
        ...(graphFailed ? { graphFailed } : {}),
        parseDegraded,
        durationMs: Date.now() - startedAt,
      },
    });
    return sliceStatus;
  });

  return finish(status, filesIndexed, filesSkipped, 'incremental');
}
