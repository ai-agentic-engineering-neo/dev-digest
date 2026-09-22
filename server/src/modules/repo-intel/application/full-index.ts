/**
 * Use case — full index of one repo. Drives:
 *   1. walk + filter           (CloneFiles.walk)
 *   2. parse (bounded parallel, per-file watchdog) + facts
 *   3. [T3] import graph (ImportGraph) — outside I/O, BEFORE the transaction
 *   4. ONE transaction: delete-and-rewrite symbols/references, edges → resolve
 *      decl_file → rank (PageRank) → repo-map render → file_facts, and upsert
 *      `repo_index_state` (status='full' on a clean pass)
 *
 * Soft budget self-watch: JobRunner wraps the handler in a 120s timeout and
 * rejects → `failed`+retry on hit. The handler can't catch its own outer
 * timeout, so it self-monitors `INDEX_SOFT_BUDGET_MS ≈ 110s`, stops starting
 * new files, skips the graph block and finishes 'partial' BEFORE the hard cap.
 *
 * Option B: rank = PageRank only, hotness=0 (the clone is shallow).
 */
import type { RepoRef } from '@devdigest/shared';
import {
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
  INDEX_SOFT_BUDGET_MS,
  INDEXER_VERSION,
} from '../constants.js';
import type { IndexerEdgeRow } from '../domain/model.js';
import { computeFileRank } from '../domain/rank.js';
import { renderRepoMap } from '../domain/repo-map.js';
import type { IndexResult, IndexStatus } from '../types.js';
import { asMessage, emptyBuffers, forEachBounded, parseSourceFile } from './parse-sources.js';
import type { IndexerDeps } from './ports.js';

export interface IndexPayload {
  repoId: string;
  /** Optional ref hint — when omitted the repo's owner/name come from the DB. */
  owner?: string;
  name?: string;
}

/** Per-file parse error captured into `stats.parseDegraded` (capped). */
interface ParseDegradedEntry {
  file: string;
  reason: string;
}

/** Hard cap on `stats.parseDegraded` so a broken clone can't blow up jsonb. */
const PARSE_DEGRADED_CAP = 50;

/**
 * Full index of one repo. Returns the final IndexResult so the caller can
 * report it (job ack, HTTP response). The persist step is one transaction, so
 * a failure leaves the previous index intact and a retry is idempotent.
 */
export async function runFullIndex(deps: IndexerDeps, payload: IndexPayload): Promise<IndexResult> {
  const startedAt = Date.now();
  const repoId = payload.repoId;

  const repo = await deps.reader.getRepoBasics(repoId);
  if (!repo) {
    // Repo deleted between enqueue and run — no-op, no row to write to.
    return degradedResult(startedAt, 'repo_not_found');
  }
  if (!repo.clonePath) {
    // Clone hasn't completed yet (race against the clone job) — persist a row
    // so observability can see why no index exists; the post-clone enqueue
    // will populate it.
    await safePersist(deps, repoId, '', 'degraded', 0, 0, {
      reason: 'no_clone',
      degradedReason: 'no_data',
      durationMs: Date.now() - startedAt,
    });
    return degradedResult(startedAt, 'no_clone');
  }
  const root = repo.clonePath;

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  const currentSha = await safeCurrentHead(deps, ref);

  // Walk + filter -------------------------------------------------------
  const walk = await deps.files.walk(root);
  if (walk.files.length === 0) {
    await safePersist(deps, repoId, currentSha, 'partial', 0, walk.stats.skippedTooLarge, {
      ...walk.stats,
      reason: 'no_files',
      durationMs: Date.now() - startedAt,
    });
    return {
      status: 'partial',
      filesIndexed: 0,
      filesSkipped: walk.stats.skippedTooLarge,
      durationMs: Date.now() - startedAt,
      reason: 'no_files',
    };
  }

  // Parse phase ---------------------------------------------------------
  const buf = emptyBuffers();
  const parseDegraded: ParseDegradedEntry[] = [];
  let filesIndexed = 0;
  let filesSkipped = walk.stats.skippedTooLarge;
  let softBudgetReached = false;

  await forEachBounded(walk.files, deps.parseConcurrency, async (relPath) => {
    // Soft-budget gate: once the budget is burned, start no new file.
    if (softBudgetReached || Date.now() - startedAt > INDEX_SOFT_BUDGET_MS) {
      softBudgetReached = true;
      return;
    }
    const outcome = await parseSourceFile(deps, repoId, root, relPath, buf);
    if (outcome.kind === 'indexed') {
      filesIndexed += 1;
      return;
    }
    filesSkipped += 1;
    if (outcome.kind === 'failed') recordParseDegraded(parseDegraded, relPath, outcome.reason);
  });

  // --- T3 graph build (outside I/O: runs BEFORE the persist transaction) ---
  // Skipped when the soft budget tripped: the graph build would blow past the
  // hard cap. status then stays 'partial'.
  let graphFailed: string | undefined;
  let edgeRows: IndexerEdgeRow[] = [];
  let rankCount = 0;
  if (!softBudgetReached) {
    try {
      const edges = await deps.graph.buildEdges(root, walk.files);
      edgeRows = edges.map((e) => ({ fromFile: e.from, toFile: e.to }));
    } catch (err) {
      graphFailed = asMessage(err);
    }
  }

  // Clean pass → 'full'. Any degradation (soft budget, graph failure, or a
  // parse error) keeps it honestly 'partial'.
  const clean = !softBudgetReached && !graphFailed && parseDegraded.length === 0;
  const status: IndexStatus = clean ? 'full' : 'partial';

  // Persist phase — ONE transaction per reindex, so readers (reviews, blast,
  // repo-map) never see a wiped-but-not-yet-refilled index, and a crash
  // mid-write leaves the previous index intact.
  await deps.tx.run(async ({ index }) => {
    // Delete-then-insert keeps the UNIQUE constraint happy and is idempotent.
    await index.deleteAllForRepo(repoId);
    await index.insertSymbols(buf.symbols);
    await index.insertReferences(buf.references);

    if (!softBudgetReached) {
      await index.replaceEdges(repoId, edgeRows);
      // Full index inserts rows with NULL decl_file, so no reset is needed.
      await index.resolveReferences(repoId, { reset: false });

      const rankRows = computeFileRank(walk.files, edgeRows);
      rankCount = rankRows.length;
      await index.replaceFileRank(repoId, rankRows);

      // Repo-map render → cache. Drop stale entries (prior SHAs) first.
      const candidates = await index.getRepoMapCandidates(repoId);
      const map = renderRepoMap(candidates, deps.tokenizer, DEFAULT_REPO_MAP_TOKEN_BUDGET);
      await index.deleteRepoMapCache(repoId);
      if (currentSha) {
        await index.putRepoMapCache(repoId, currentSha, DEFAULT_REPO_MAP_TOKEN_BUDGET, map.text, map.tokens);
      }

      await index.replaceFileFacts(repoId, buf.facts);
    }

    await index.upsertIndexState({
      repoId,
      lastIndexedSha: currentSha,
      indexerVersion: INDEXER_VERSION,
      status,
      filesIndexed,
      filesSkipped,
      stats: {
        ...walk.stats,
        filesSeen: walk.files.length,
        symbolsWritten: buf.symbols.length,
        referencesWritten: buf.references.length,
        edgesWritten: edgeRows.length,
        ranked: rankCount,
        factsWritten: buf.facts.length,
        hotnessAvailable: false, // Option B — rank = pagerank only
        ...(graphFailed ? { graphFailed } : {}),
        softBudgetReached,
        parseDegraded,
        durationMs: Date.now() - startedAt,
      },
    });
  });

  return {
    status,
    filesIndexed,
    filesSkipped,
    durationMs: Date.now() - startedAt,
    reason: softBudgetReached ? 'soft_budget' : graphFailed ? 'graph_failed' : undefined,
  };
}

function recordParseDegraded(buf: ParseDegradedEntry[], file: string, reason: string): void {
  if (buf.length >= PARSE_DEGRADED_CAP) return;
  buf.push({ file, reason });
}

async function safeCurrentHead(deps: IndexerDeps, ref: RepoRef): Promise<string> {
  try {
    return await deps.git.currentHead(ref);
  } catch {
    return '';
  }
}

async function safePersist(
  deps: IndexerDeps,
  repoId: string,
  sha: string,
  status: 'partial' | 'degraded',
  filesIndexed: number,
  filesSkipped: number,
  stats: Record<string, unknown>,
): Promise<void> {
  try {
    await deps.state.upsertIndexState({
      repoId,
      lastIndexedSha: sha,
      indexerVersion: INDEXER_VERSION,
      status,
      filesIndexed,
      filesSkipped,
      stats,
    });
  } catch {
    // Early-exit persistence failure — never throw out of the job handler;
    // the next run re-stamps the row.
  }
}

function degradedResult(startedAt: number, reason: string): IndexResult {
  return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: Date.now() - startedAt, reason };
}
