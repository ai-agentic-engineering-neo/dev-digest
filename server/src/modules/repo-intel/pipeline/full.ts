/**
 * repo-intel pipeline — `runFullIndex`.
 *
 * One-pass full index of a repo. Drives:
 *   1. walk + filter           (pipeline/walk.ts)
 *   2. parse (ast-grep, parallel via p-queue, per-file watchdog) + facts
 *   3. delete-and-rewrite the cached symbols/references for this repo
 *      (idempotent — re-running is safe; UNIQUE constraint guards dup rows)
 *   4. [T3] module graph (resolver + pure core) → decl_file at insert → rank (PageRank)
 *      → repo-map render → file_facts
 *   5. upsert `repo_index_state` (status='full' on a clean pass)
 *
 * Soft budget self-watch: JobRunner wraps the handler in
 * `withTimeout(120s)` and rejects → `failed`+retry on hit.
 * The handler can't catch its own outer timeout, so we self-monitor
 * `INDEX_SOFT_BUDGET_MS ≈ 110s` and finish 'partial' BEFORE the hard cap.
 *
 * `rank = PageRank` always (D7 — see pipeline/rank.ts); `hotness` is real,
 * sourced from already-ingested PR-file history within `HOTNESS_WINDOW_DAYS`
 * (D6), 0 when there's none. The T3 block (graph/rank/repo-map/facts) is
 * skipped entirely when the soft budget trips, leaving status 'partial'.
 */
import { readFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { join } from 'node:path';
import PQueue from 'p-queue';
import type { RepoRef } from '@devdigest/shared';
import type { PipelineDeps } from '../deps.js';
import { langForFile } from '../../../adapters/astgrep/index.js';
import {
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
  HOTNESS_WINDOW_DAYS,
  INDEX_SOFT_BUDGET_MS,
  INDEXER_VERSION,
  REINDEX_PROGRESS_EVERY,
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
import { walkClone } from './walk.js';
import {
  asMessage,
  makeReadText,
  parseSource,
  reportProgress,
  referenceRowsFor,
  symbolRowsFor,
} from './index-rows.js';
import { computeFileRank } from './rank.js';
import { renderRepoMap } from './repo-map.js';

export interface IndexPayload {
  repoId: string;
  /** Optional ref hint — when omitted we look up the repo's owner/name from the DB. */
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
 * report it (job ack, HTTP response). Errors that abort the whole run still
 * stamp a `status='failed'` row before re-throwing — the handler is
 * idempotent on retry.
 */
export async function runFullIndex(
  deps: PipelineDeps,
  repository: RepoIntelRepository,
  payload: IndexPayload,
): Promise<IndexResult> {
  const startedAt = Date.now();
  const repoId = payload.repoId;

  const repo = await repository.getRepoBasics(repoId);
  if (!repo) {
    // Repo deleted between enqueue and run — no-op, no row to write to.
    return degradedResult(startedAt, 'repo_not_found');
  }
  if (!repo.clonePath) {
    // Clone hasn't completed yet (race against runCloneJob) — bail and let
    // the next enqueue (after clone) populate the index. Persist a row so
    // observability can see why no index exists.
    await safePersist(repository, repoId, '', 'degraded', 0, 0, {
      reason: 'no_clone',
      degradedReason: 'no_data',
      durationMs: Date.now() - startedAt,
    });
    return degradedResult(startedAt, 'no_clone');
  }

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  const currentSha = await safeCurrentHead(deps, ref);

  // Walk + filter -------------------------------------------------------
  const walk = await walkClone(repo.clonePath);
  if (walk.files.length === 0) {
    await safePersist(repository, repoId, currentSha, 'partial', 0, walk.stats.skippedTooLarge, {
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
  const modules: ParsedModule[] = [];
  const parsedByPath = new Map<string, string>(); // path → content hash
  const factsBuf: IndexerFileFactsRow[] = [];
  let processed = 0;
  // Reindex lifecycle (AC-16): queued → running, progress every N files.
  await reportProgress(repository, repoId, 0, walk.files.length);
  const parseDegraded: ParseDegradedEntry[] = [];
  let filesIndexed = 0;
  let filesSkipped = walk.stats.skippedTooLarge;
  let softBudgetReached = false;

  const concurrency = Math.max(1, cpus().length - 1);
  const parseQ = new PQueue({ concurrency });

  for (const relPath of walk.files) {
    // Soft-budget gate: before enqueuing each file, bail out if we've burned
    // the budget. Anything still in flight is awaited via `onIdle()` below.
    if (Date.now() - startedAt > INDEX_SOFT_BUDGET_MS) {
      softBudgetReached = true;
      break;
    }

    void parseQ.add(async () => {
      const lang = langForFile(relPath);
      if (!lang) {
        filesSkipped += 1;
        return;
      }
      let source: string;
      try {
        source = await readFile(join(repo.clonePath!, relPath), 'utf8');
      } catch (err) {
        filesSkipped += 1;
        recordParseDegraded(parseDegraded, relPath, asMessage(err));
        return;
      }
      // One read per file: the same text feeds facts, hash, endpoints, crons.
      try {
        const parsed = await parseSource(relPath, source);
        modules.push({ path: relPath, facts: parsed.facts });
        parsedByPath.set(relPath, parsed.contentHash);
        // Per-file facts (endpoints/crons) so blast reads from file_facts
        // instead of re-parsing the clone (T3 blast migration).
        if (parsed.endpoints.length > 0 || parsed.crons.length > 0) {
          factsBuf.push({ filePath: relPath, endpoints: parsed.endpoints, crons: parsed.crons });
        }
        filesIndexed += 1;
      } catch (err) {
        filesSkipped += 1;
        recordParseDegraded(parseDegraded, relPath, asMessage(err));
      }
      processed += 1;
      if (processed % REINDEX_PROGRESS_EVERY === 0) {
        void reportProgress(repository, repoId, processed, walk.files.length);
      }
    });
  }

  await parseQ.onIdle();

  // Graph (pure core over the facts already in memory) -------------------
  // Skipped when the soft budget tripped: we're already over time. A throwing
  // resolver factory / graph core degrades to `partial` (graph_failed) and the
  // symbols/references still persist (decl_file NULL).
  let graphFailed: string | undefined;
  let graph: GraphResult | null = null;
  if (!softBudgetReached) {
    try {
      const instance = deps.resolver.create({
        root: repo.clonePath,
        files: new Set([...walk.files, ...(walk.jsonFiles ?? [])]),
        readText: makeReadText(repo.clonePath),
      });
      graph = buildGraph(modules, instance);
    } catch (err) {
      graphFailed = asMessage(err);
    }
  }

  // Persist phase -------------------------------------------------------
  // Delete-then-insert is the idempotent shape blast already uses. Keeps
  // the new UNIQUE index (symbols_repo_path_name_kind_line_uq) happy.
  const declsByFile = new Map<string, GraphResult['referencesDeclFile']>();
  for (const d of graph?.referencesDeclFile ?? []) {
    const list = declsByFile.get(d.file);
    if (list) list.push(d);
    else declsByFile.set(d.file, [d]);
  }
  const symbolsBuf: IndexerSymbolRow[] = [];
  const refsBuf: IndexerReferenceRow[] = [];
  for (const m of modules) {
    const hash = parsedByPath.get(m.path)!;
    symbolsBuf.push(...symbolRowsFor(repoId, m.path, hash, m.facts));
    refsBuf.push(
      ...referenceRowsFor(repoId, m.path, hash, m.facts, graph ? (declsByFile.get(m.path) ?? []) : null),
    );
  }
  await repository.deleteAllForRepo(repoId);
  await repository.insertSymbols(symbolsBuf);
  await repository.insertReferences(refsBuf);
  if (graph) {
    await repository.replaceGraphRows(repoId, {
      imports: graph.imports,
      exports: graph.exports,
      edges: graph.edges,
    });
  }

  // --- T3: rank → repo-map → facts ---------------------------------------
  let edgeRows: IndexerEdgeRow[] = [];
  let rankCount = 0;
  let hotnessPrs = 0;
  if (!softBudgetReached) {
    // file_edges ONLY from resolved imports/re-exports (R-2).
    edgeRows = (graph?.fileEdges ?? []).map((e) => ({ fromFile: e.from, toFile: e.to }));
    await repository.replaceEdges(repoId, edgeRows);

    // Hotness (D6): raw PR-file churn within the recency window, from
    // already-ingested PR history — never git log (clock stays in the
    // caller so pipeline/rank.ts's purity contract holds). Fetched even on a
    // graphFailed pass — hotness is independent of the import graph.
    const since = new Date(Date.now() - HOTNESS_WINDOW_DAYS * 86_400_000);
    const churn = await repository.getPrChurn(repoId, since);
    hotnessPrs = churn.prsConsidered;
    const churnMap = new Map(churn.counts.map((c) => [c.path, c.prs]));

    // Rank: pagerank + real hotness (D6/D7 — rank itself stays = pagerank).
    const rankRows = computeFileRank(walk.files, edgeRows, churnMap);
    rankCount = rankRows.length;
    await repository.replaceFileRank(repoId, rankRows);

    // Repo-map render → cache. Drop stale entries (prior SHAs) first.
    const candidates = await repository.getRepoMapCandidates(repoId);
    const map = renderRepoMap(candidates, deps.tokenizer, DEFAULT_REPO_MAP_TOKEN_BUDGET);
    await repository.deleteRepoMapCache(repoId);
    if (currentSha) {
      await repository.putRepoMapCache(
        repoId,
        currentSha,
        DEFAULT_REPO_MAP_TOKEN_BUDGET,
        map.text,
        map.tokens,
      );
    }

    // Per-file facts (endpoints/crons) for the blast facade.
    await repository.replaceFileFacts(repoId, factsBuf);
  }

  const tsconfigFailures = graph?.coverage.tsconfigFailures ?? [];

  // Clean pass → 'full'. Any degradation (soft budget, graph failure, or a
  // parse error) keeps it honestly 'partial'.
  const clean =
    !softBudgetReached && !graphFailed && parseDegraded.length === 0 && tsconfigFailures.length === 0;
  const status: IndexStatus = clean ? 'full' : 'partial';
  const stats: Record<string, unknown> = {
    ...walk.stats,
    filesSeen: walk.files.length,
    symbolsWritten: symbolsBuf.length,
    referencesWritten: refsBuf.length,
    edgesWritten: edgeRows.length,
    ranked: rankCount,
    factsWritten: factsBuf.length,
    hotnessPrs,
    hotnessWindowDays: HOTNESS_WINDOW_DAYS,
    hotnessAvailable: hotnessPrs > 0,
    ...(graphFailed ? { graphFailed } : {}),
    ...(tsconfigFailures.length > 0 ? { tsconfigFailures: tsconfigFailures.length } : {}),
    softBudgetReached,
    parseDegraded,
    durationMs: Date.now() - startedAt,
  };

  await repository.upsertIndexState({
    repoId,
    lastIndexedSha: currentSha,
    indexerVersion: INDEXER_VERSION,
    status,
    filesIndexed,
    filesSkipped,
    stats,
    coverage: graph?.coverage ?? null,
    tsconfigFailures: graph ? tsconfigFailures : null,
  });

  return {
    status,
    filesIndexed,
    filesSkipped,
    durationMs: Date.now() - startedAt,
    reason: softBudgetReached
      ? 'soft_budget'
      : graphFailed
        ? 'graph_failed'
        : tsconfigFailures.length > 0
          ? 'tsconfig_failed'
          : undefined,
  };
}

function recordParseDegraded(buf: ParseDegradedEntry[], file: string, reason: string): void {
  if (buf.length >= PARSE_DEGRADED_CAP) return;
  buf.push({ file, reason });
}

async function safeCurrentHead(deps: PipelineDeps, ref: RepoRef): Promise<string> {
  try {
    return await deps.git.currentHead(ref);
  } catch {
    return '';
  }
}

async function safePersist(
  repository: RepoIntelRepository,
  repoId: string,
  sha: string,
  status: 'partial' | 'degraded',
  filesIndexed: number,
  filesSkipped: number,
  stats: Record<string, unknown>,
): Promise<void> {
  try {
    await repository.upsertIndexState({
      repoId,
      lastIndexedSha: sha,
      indexerVersion: INDEXER_VERSION,
      status,
      filesIndexed,
      filesSkipped,
      stats,
    });
  } catch {
    // Persistence failure during early-exit path — never throw out of the
    // top-level handler; the next run will re-stamp the row.
  }
}

function degradedResult(startedAt: number, reason: string): IndexResult {
  return {
    status: 'degraded',
    filesIndexed: 0,
    filesSkipped: 0,
    durationMs: Date.now() - startedAt,
    reason,
  };
}
