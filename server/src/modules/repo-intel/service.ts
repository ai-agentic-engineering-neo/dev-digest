/**
 * RepoIntelService — the `RepoIntel` facade every feature codes against.
 *
 * Indexing (job handlers in ./composition.ts, or inline) delegates to the
 * application use cases in ./application; reads come from the persisted index
 * (RepoIntelReader) or diff-scoped parsing of the clone. Every read degrades to
 * a valid empty/`degraded` value instead of throwing (see types.ts header).
 *
 * The service holds only ports (./application/ports.ts); composition.ts builds
 * the real adapters, tests pass in-memory fakes.
 */
import type { RepoRef } from '@devdigest/shared';
import {
  BFS_DEPTH,
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
  INDEXER_VERSION,
  RESYNC_JOB_KIND,
} from './constants.js';
import { criticalPaths, pickTopFiles } from './domain/rules.js';
import { getBlastRadius } from './application/blast-radius.js';
import { runFullIndex } from './application/full-index.js';
import { runIncremental } from './application/incremental-index.js';
import { getCallerSignatures, getUnresolvedReferences } from './application/source-queries.js';
import type { RepoIntelDeps } from './application/ports.js';
import type {
  BlastResult,
  FileRankRow,
  IndexResult,
  IndexState,
  RefRow,
  RepoIntel,
  RepoMapResult,
  SignatureRow,
  SymbolRow,
} from './types.js';

/** How many top-ranked files seed `getCriticalPaths` dependency chains. */
const CRITICAL_PATH_ROOTS = 5;

/** Outcome of POST /repos/:id/resync — 202 either way; the UI polls /index-state. */
export type ResyncRequest =
  | { status: 'accepted'; jobId: string }
  | { status: 'accepted'; degraded: true; reason: 'no_handler' };

export class RepoIntelService implements RepoIntel {
  constructor(private readonly deps: RepoIntelDeps) {}

  // --- Indexing ------------------------------------------------------------

  /** Full index INLINE (the INDEX job handler and CI call this). */
  indexRepo(repoId: string): Promise<IndexResult> {
    return runFullIndex(this.deps, { repoId });
  }

  /** Incremental refresh INLINE; falls back to a full index when needed. */
  refreshIndex(repoId: string): Promise<IndexResult> {
    return runIncremental(this.deps, { repoId });
  }

  /**
   * Manual "re-analyze": advance the clone to `origin/<defaultBranch>`, then
   * run an incremental refresh (never a destructive re-clone). Degrades (never
   * throws) when the repo isn't cloned yet or the fetch fails.
   */
  async resyncRepo(repoId: string, opts: { signal?: AbortSignal } = {}): Promise<IndexResult> {
    const startedAt = Date.now();
    const degraded = (reason: string): IndexResult => ({
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: Date.now() - startedAt,
      reason,
    });
    const repo = await this.deps.reader.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) return degraded('no_clone');
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    try {
      await this.deps.git.sync(ref, repo.defaultBranch, opts.signal ? { signal: opts.signal } : undefined);
    } catch (err) {
      return degraded(`sync_failed:${err instanceof Error ? err.message : String(err)}`);
    }
    return runIncremental(this.deps, { repoId });
  }

  /**
   * Enqueue a background resync. Never throws: an enqueue failure (no handler,
   * DB hiccup) is reported as degraded so the UI can still poll /index-state.
   */
  async requestResync(workspaceId: string, repoId: string): Promise<ResyncRequest> {
    try {
      const job = await this.deps.jobs.enqueue(workspaceId, RESYNC_JOB_KIND, { repoId });
      return { status: 'accepted', jobId: job.id };
    } catch {
      return { status: 'accepted', degraded: true, reason: 'no_handler' };
    }
  }

  /** The persisted state, or a synthesised degraded row — never throws. */
  async getIndexState(repoId: string): Promise<IndexState> {
    const persisted = await this.deps.reader.tryGetIndexState(repoId);
    if (persisted) return persisted;
    return {
      repoId,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      reason: 'no_data',
      lastIndexedSha: '',
      indexerVersion: INDEXER_VERSION,
      updatedAt: new Date(0),
      degraded: true,
      degradedReason: 'no_data',
    };
  }

  // --- Reads ---------------------------------------------------------------

  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    return getBlastRadius(this.deps, repoId, changedFiles);
  }

  getCallerSignatures(repoId: string, changedFiles: string[], limit?: number): Promise<SignatureRow[]> {
    return getCallerSignatures(this.deps, repoId, changedFiles, limit);
  }

  getUnresolvedReferences(repoId: string, files: string[]): Promise<RefRow[]> {
    return getUnresolvedReferences(this.deps, repoId, files);
  }

  /**
   * The cached repo-map for the last-indexed SHA. Only
   * `DEFAULT_REPO_MAP_TOKEN_BUDGET` is ever rendered; other budgets (or an
   * unindexed repo) miss and degrade cleanly.
   */
  async getRepoMap(repoId: string, tokenBudget?: number): Promise<RepoMapResult> {
    const degraded: RepoMapResult = { text: '', tokens: 0, cached: false, degraded: true, reason: 'no_data' };
    if (!this.deps.enabled) return { ...degraded, reason: 'flag_off' };
    const state = await this.deps.reader.tryGetIndexState(repoId);
    if (!state || !state.lastIndexedSha) return degraded;
    const budget = tokenBudget ?? DEFAULT_REPO_MAP_TOKEN_BUDGET;
    const hit = await this.deps.reader.getRepoMapCache(repoId, state.lastIndexedSha, budget);
    if (!hit) return degraded;
    return { text: hit.mapText, tokens: hit.tokenCount, cached: true };
  }

  /** Percentile per path from `file_rank`. */
  async getFileRank(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    if (!this.deps.enabled || paths.length === 0) return [];
    return this.deps.reader.getFileRankFor(repoId, paths);
  }

  /** Persistent symbol read-model for the given files. */
  async getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolRow[]> {
    if (!this.deps.enabled || paths.length === 0) return [];
    const rows = await this.deps.reader.getSymbolRows(repoId, paths);
    return rows.map((r) => ({
      file: r.path,
      name: r.name,
      kind: r.kind,
      exported: r.exported,
      startLine: r.line ?? 0,
      endLine: r.endLine ?? r.line ?? 0,
      signature: r.signature,
    }));
  }

  /** Top-N files by rank, minus tests/configs/migrations — conventions sample. */
  getConventionSamples(repoId: string, n: number): Promise<string[]> {
    return this.getTopFilesByRank(repoId, n);
  }

  /**
   * Top-N paths by rank DESC, minus junk paths and `exclude` substrings.
   * Over-fetches 10× so the post-filter still yields N where possible.
   */
  async getTopFilesByRank(repoId: string, n: number, opts?: { exclude?: string[] }): Promise<string[]> {
    if (!this.deps.enabled || n <= 0) return [];
    const rows = await this.deps.reader.getRankedPaths(repoId, Math.max(n * 10, 100));
    return pickTopFiles(rows, n, opts?.exclude ?? []);
  }

  /** Dependency chains from the highest-ranked files (onboarding reading-path). */
  async getCriticalPaths(repoId: string): Promise<string[][]> {
    if (!this.deps.enabled) return [];
    const edges = await this.deps.reader.getEdges(repoId);
    if (edges.length === 0) return [];
    const ranked = await this.deps.reader.getRankedPaths(repoId, 100_000);
    return criticalPaths(edges, ranked, { rootCount: CRITICAL_PATH_ROOTS, depth: BFS_DEPTH });
  }
}
