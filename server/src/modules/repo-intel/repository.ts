/**
 * repo-intel repository — thin Drizzle helpers over the existing `symbols` /
 * `references` tables (db/schema/context.ts) plus a tolerant probe of the
 * (not-yet-existing) `repo_index_state` table.
 *
 * T1 keeps this file deliberately small: the facade only needs (a) the basic
 * shape of a repo so it can call CodeIndex on the clone, (b) the cached
 * symbols/references blast already persists, and (c) a "does the index state
 * table exist yet?" probe so getIndexState can synthesise a degraded reply
 * before the T2 migration lands.
 *
 * IMPORTANT: the `repo_index_state` table is introduced by T2. Until then the
 * raw-SQL probes below MUST swallow `undefined_table` (Postgres 42P01) so the
 * facade keeps returning degraded — never throws.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { clampIndexedName } from '../../db/schema/context.js';
import { INDEXER_VERSION } from './constants.js';
import type { ExportRow, ImportRow, SymbolEdgeRow } from './graph/types.js';
import type { DegradedReason, FileRankRow, IndexState, IndexStatus } from './types.js';

/** Chunk size for batched inserts — same value blast already uses. */
const INSERT_CHUNK_SIZE = 500;
/** Chunk size for `IN (...)` deletes/lookups (well under the 65535 param cap). */
const DELETE_CHUNK_SIZE = 1000;

function* chunked<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size) as T[];
}

/** Row shape the indexer pipeline buffers up before persistence. */
export interface IndexerSymbolRow {
  repoId: string;
  path: string;
  name: string;
  kind: string;
  line: number;
  endLine: number | null;
  exported: boolean;
  signature: string | null;
  contentHash: string;
}

export interface IndexerReferenceRow {
  repoId: string;
  fromPath: string;
  toSymbol: string;
  line: number;
  /** Declaring file from binding resolution (exact/inferred); NULL = unresolved. */
  declFile?: string | null;
  contentHash: string;
}

/** Graph rows (graph core output) the pipeline persists, minus `repoId`. */
export interface GraphRowsInput {
  imports: ImportRow[];
  exports: ExportRow[];
  edges: SymbolEdgeRow[];
}

/** Persisted graph rows of one file, read back as incremental context. */
export interface GraphContextRows {
  imports: ImportRow[];
  exports: ExportRow[];
  symbols: Array<{
    path: string;
    name: string;
    kind: string;
    line: number | null;
    endLine: number | null;
    exported: boolean;
    signature: string | null;
  }>;
}

/** Bundle of values the pipeline persists into `repo_index_state`. */
export interface IndexStateUpsert {
  repoId: string;
  lastIndexedSha: string;
  indexerVersion: number;
  status: IndexStatus;
  filesIndexed: number;
  filesSkipped: number;
  stats: Record<string, unknown>;
  /** Graph coverage (specs/18 AC-14); omitted ⇒ stored as NULL. */
  coverage?: unknown;
  /** tsconfig files that failed to parse (AC-6); omitted ⇒ NULL. */
  tsconfigFailures?: unknown;
}

/** Minimal repo shape the facade needs to call CodeIndex on a clone. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Cached row from the existing `symbols` table (blast persists these). */
export interface CachedSymbolRow {
  path: string;
  name: string;
  kind: string;
  line: number | null;
}

/** Cached row from the existing `references` table. */
export interface CachedReferenceRow {
  fromPath: string;
  toSymbol: string;
  line: number;
}

// --- T3 row shapes ----------------------------------------------------------

/** Import-graph edge (importer → imported), repo-relative paths. */
export interface IndexerEdgeRow {
  fromFile: string;
  toFile: string;
}

/** One `file_rank` row the rank step buffers before persistence. */
export interface IndexerFileRankRow {
  filePath: string;
  pagerank: number;
  hotness: number;
  rank: number;
  percentile: number;
}

/** Precomputed per-file facts (endpoints/crons) the indexer writes for blast. */
export interface IndexerFileFactsRow {
  filePath: string;
  endpoints: string[];
  crons: string[];
}

/** Per-path PR-file churn within a window — the raw counts `computeFileRank`
 * normalizes into `hotness`. */
export interface PrChurnResult {
  counts: Array<{ path: string; prs: number }>;
  prsConsidered: number;
}

/** `file_rank` row (path + the three per-file scores), unordered. */
export interface FileRankFullRow {
  path: string;
  pagerank: number;
  hotness: number;
  percentile: number;
}

/** Candidate row for the repo-map renderer (symbols × file_rank). */
export interface RepoMapCandidateRow {
  path: string;
  name: string;
  exported: boolean;
  signature: string | null;
  rank: number;
}

/** Full symbol row (with the T2 columns) — for getSymbolsInFiles + blast. */
export interface FullSymbolRow {
  path: string;
  name: string;
  kind: string;
  line: number | null;
  endLine: number | null;
  exported: boolean;
  signature: string | null;
}

/** A resolved cross-file caller (reference whose decl_file is a changed file). */
export interface ResolvedCallerRow {
  fromPath: string;
  toSymbol: string;
  line: number;
  rank: number;
}

export class RepoIntelRepository {
  constructor(private db: Db) {}

  async getRepoBasics(repoId: string): Promise<RepoBasics | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row ?? null;
  }

  /** All cached symbols for a repo (from blast's persistence). */
  async getCachedSymbols(repoId: string): Promise<CachedSymbolRow[]> {
    return this.db
      .select({
        path: t.symbols.path,
        name: t.symbols.name,
        kind: t.symbols.kind,
        line: t.symbols.line,
      })
      .from(t.symbols)
      .where(eq(t.symbols.repoId, repoId));
  }

  /** Cached symbols restricted to the given file paths. */
  async getCachedSymbolsForFiles(repoId: string, paths: string[]): Promise<CachedSymbolRow[]> {
    if (paths.length === 0) return [];
    return this.db
      .select({
        path: t.symbols.path,
        name: t.symbols.name,
        kind: t.symbols.kind,
        line: t.symbols.line,
      })
      .from(t.symbols)
      .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, paths)));
  }

  /** Cached references whose `toSymbol` matches any of the given names. */
  async getCachedReferencesTo(
    repoId: string,
    toSymbols: string[],
  ): Promise<CachedReferenceRow[]> {
    if (toSymbols.length === 0) return [];
    return this.db
      .select({
        fromPath: t.references.fromPath,
        toSymbol: t.references.toSymbol,
        line: t.references.line,
      })
      .from(t.references)
      .where(
        and(eq(t.references.repoId, repoId), inArray(t.references.toSymbol, toSymbols)),
      );
  }

  /**
   * Read the `repo_index_state` row, if any. Tolerant of the table not yet
   * existing (some dev DBs may not have migration 0004 applied) — returns
   * `null` instead of throwing so the facade synthesises a degraded reply.
   *
   * `durationMs` and `reason` live inside `stats` (the schema column set is
   * status/files_indexed/files_skipped/stats/last_indexed_sha/indexer_version/
   * updated_at) — we project them out here so the IndexState shape stays
   * stable for callers.
   */
  async tryGetIndexState(repoId: string): Promise<IndexState | null> {
    try {
      const [row] = await this.db
        .select()
        .from(t.repoIndexState)
        .where(eq(t.repoIndexState.repoId, repoId));
      if (!row) return null;
      const stats = (row.stats ?? {}) as Record<string, unknown>;
      const durationMs = typeof stats.durationMs === 'number' ? stats.durationMs : 0;
      const reason = typeof stats.reason === 'string' ? stats.reason : undefined;
      // Coverage/hotness/graph facts (D1/AC-18, Q2) — projected the same
      // one-line way as durationMs/reason above. All four are optional: a row
      // written before this change simply has none of them.
      const filesExcludedByBound = typeof stats.bounded === 'number' ? stats.bounded : undefined;
      const hotnessPrs = typeof stats.hotnessPrs === 'number' ? stats.hotnessPrs : undefined;
      const hotnessWindowDays =
        typeof stats.hotnessWindowDays === 'number' ? stats.hotnessWindowDays : undefined;
      const graphFailed = typeof stats.graphFailed === 'string' ? stats.graphFailed : undefined;
      // A persisted row is the "real" index state. We only mark it `degraded`
      // when the indexer itself stamped status='degraded'|'failed' (e.g. the
      // graph fell over). 'partial' is still a working index — no degraded flag.
      const isDegraded = row.status === 'degraded' || row.status === 'failed';
      return {
        repoId,
        status: row.status as IndexStatus,
        filesIndexed: row.filesIndexed,
        filesSkipped: row.filesSkipped,
        durationMs,
        reason,
        lastIndexedSha: row.lastIndexedSha,
        indexerVersion: row.indexerVersion,
        updatedAt: row.updatedAt,
        degraded: isDegraded ? true : undefined,
        degradedReason: isDegraded
          ? ((stats.degradedReason as DegradedReason | undefined) ?? 'index_failed')
          : undefined,
        filesExcludedByBound,
        hotnessPrs,
        hotnessWindowDays,
        graphFailed,
        coverage: (row.coverage as IndexState['coverage']) ?? null,
        // Derived at read time, never written by a read (AC-16/16a): an explicit
        // reindex_state wins; otherwise a stored version below the current one
        // means a reindex is pending.
        reindexing: row.reindexState
          ? { state: row.reindexState, done: row.reindexDone ?? 0, total: row.reindexTotal ?? 0 }
          : row.indexerVersion < INDEXER_VERSION
            ? { state: 'queued' as const, done: 0, total: 0 }
            : null,
      };
    } catch {
      // Table missing / schema drift / connection blip — degrade silently. The
      // facade always has a safe synthesised fallback.
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // T2 indexer-pipeline writes.
  // -------------------------------------------------------------------------

  /** Wipe every cached symbol + reference row for a repo (full-index reset). */
  async deleteAllForRepo(repoId: string): Promise<void> {
    await this.db.delete(t.symbols).where(eq(t.symbols.repoId, repoId));
    await this.db.delete(t.references).where(eq(t.references.repoId, repoId));
    await this.db.delete(t.fileImports).where(eq(t.fileImports.repoId, repoId));
    await this.db.delete(t.fileExports).where(eq(t.fileExports.repoId, repoId));
    await this.db.delete(t.symbolEdges).where(eq(t.symbolEdges.repoId, repoId));
  }

  /**
   * Wipe symbols whose `path` is in `paths` and references whose `fromPath`
   * is in `paths`. Used by the incremental indexer before re-parsing a slice.
   * Inline-empty guard keeps the no-op refresh path zero-DB.
   */
  async deleteForFiles(repoId: string, paths: string[]): Promise<void> {
    for (const chunk of chunked(paths, DELETE_CHUNK_SIZE)) {
      await this.db
        .delete(t.symbols)
        .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, chunk)));
      await this.db
        .delete(t.references)
        .where(and(eq(t.references.repoId, repoId), inArray(t.references.fromPath, chunk)));
    }
  }

  /** Batched insert into `symbols`. Uses the same chunk size as blast. */
  async insertSymbols(rows: IndexerSymbolRow[]): Promise<void> {
    if (rows.length === 0) return;
    // Clamp the indexed `name` so a pathological multi-KB identifier can't blow
    // the btree row-size limit and crash the indexer (see clampIndexedName).
    const safe = rows.map((r) => ({ ...r, name: clampIndexedName(r.name) }));
    for (let i = 0; i < safe.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.symbols).values(safe.slice(i, i + INSERT_CHUNK_SIZE));
    }
  }

  /** Batched insert into `references`. */
  async insertReferences(rows: IndexerReferenceRow[]): Promise<void> {
    if (rows.length === 0) return;
    const safe = rows.map((r) => ({ ...r, declFile: r.declFile ?? null, toSymbol: clampIndexedName(r.toSymbol) }));
    for (let i = 0; i < safe.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.references).values(safe.slice(i, i + INSERT_CHUNK_SIZE));
    }
  }

  /**
   * Upsert one row of `repo_index_state`. PK = repoId, so this is an
   * `INSERT ... ON CONFLICT (repo_id) DO UPDATE` over the full row.
   * `updated_at` is set by the column default on insert and bumped explicitly
   * on conflict so consumers can see when the indexer last touched the row.
   */
  async upsertIndexState(state: IndexStateUpsert): Promise<void> {
    const now = new Date();
    await this.db
      .insert(t.repoIndexState)
      .values({
        repoId: state.repoId,
        lastIndexedSha: state.lastIndexedSha,
        indexerVersion: state.indexerVersion,
        status: state.status,
        filesIndexed: state.filesIndexed,
        filesSkipped: state.filesSkipped,
        stats: state.stats,
        updatedAt: now,
        coverage: state.coverage ?? null,
        tsconfigFailures: state.tsconfigFailures ?? null,
        reindexState: null,
        reindexDone: null,
        reindexTotal: null,
      })
      .onConflictDoUpdate({
        target: t.repoIndexState.repoId,
        set: {
          lastIndexedSha: state.lastIndexedSha,
          indexerVersion: state.indexerVersion,
          status: state.status,
          filesIndexed: state.filesIndexed,
          filesSkipped: state.filesSkipped,
          stats: state.stats,
          updatedAt: now,
          coverage: state.coverage ?? null,
          tsconfigFailures: state.tsconfigFailures ?? null,
          // A finished run always clears the reindex axis (AC-16a).
          reindexState: null,
          reindexDone: null,
          reindexTotal: null,
        },
      });
  }

  /**
   * Touch `updated_at` (and stats) on the existing index-state row WITHOUT
   * changing files/sha/status. Used by the incremental refresh's "sha
   * unchanged" branch (step 2).
   */
  async touchIndexState(repoId: string, stats?: Record<string, unknown>): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (stats) updates.stats = stats;
    await this.db
      .update(t.repoIndexState)
      .set(updates)
      .where(eq(t.repoIndexState.repoId, repoId));
  }

  /** Update only the `lastIndexedSha` (and bump updated_at) — used by
   * incremental when the diff intersection is empty: code didn't change in
   * any indexed extension, but we still want to remember the new sha. */
  async advanceSha(repoId: string, sha: string): Promise<void> {
    await this.db
      .update(t.repoIndexState)
      .set({ lastIndexedSha: sha, updatedAt: new Date() })
      .where(eq(t.repoIndexState.repoId, repoId));
  }

  // -------------------------------------------------------------------------
  // T3 — graph / rank / repo-map / facts writes.
  // -------------------------------------------------------------------------

  /** Replace the whole import-graph for a repo (full index / incremental). */
  async replaceEdges(repoId: string, edges: IndexerEdgeRow[]): Promise<void> {
    await this.db.delete(t.fileEdges).where(eq(t.fileEdges.repoId, repoId));
    if (edges.length === 0) return;
    const rows = edges.map((e) => ({ repoId, fromFile: e.fromFile, toFile: e.toFile }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.fileEdges).values(rows.slice(i, i + INSERT_CHUNK_SIZE));
    }
  }

  /** Replace the whole file_rank table for a repo. */
  async replaceFileRank(repoId: string, rows: IndexerFileRankRow[]): Promise<void> {
    await this.db.delete(t.fileRank).where(eq(t.fileRank.repoId, repoId));
    if (rows.length === 0) return;
    const values = rows.map((r) => ({ repoId, ...r }));
    for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.fileRank).values(values.slice(i, i + INSERT_CHUNK_SIZE));
    }
  }

  /** Replace per-file facts; only rows with at least one endpoint/cron persist. */
  async replaceFileFacts(repoId: string, rows: IndexerFileFactsRow[]): Promise<void> {
    await this.db.delete(t.fileFacts).where(eq(t.fileFacts.repoId, repoId));
    const nonEmpty = rows.filter((r) => r.endpoints.length > 0 || r.crons.length > 0);
    if (nonEmpty.length === 0) return;
    const values = nonEmpty.map((r) => ({
      repoId,
      filePath: r.filePath,
      endpoints: r.endpoints,
      crons: r.crons,
    }));
    for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.fileFacts).values(values.slice(i, i + INSERT_CHUNK_SIZE));
    }
  }

  // -------------------------------------------------------------------------
  // specs/18 — graph rows + reindex lifecycle.
  // -------------------------------------------------------------------------

  /** Replace the repo's whole import/export/symbol-edge graph (full index). */
  async replaceGraphRows(repoId: string, rows: GraphRowsInput): Promise<void> {
    await this.db.delete(t.fileImports).where(eq(t.fileImports.repoId, repoId));
    await this.db.delete(t.fileExports).where(eq(t.fileExports.repoId, repoId));
    await this.db.delete(t.symbolEdges).where(eq(t.symbolEdges.repoId, repoId));
    await this.insertGraphRows(repoId, rows);
  }

  /**
   * Replace the graph rows OWNED by `files` (incremental): imports/exports by
   * their file, symbol edges by their source path. Passing a deleted path with
   * empty `rows` simply removes everything it left behind.
   */
  async replaceGraphRowsForFiles(
    repoId: string,
    files: string[],
    rows: GraphRowsInput,
  ): Promise<void> {
    for (const chunk of chunked(files, DELETE_CHUNK_SIZE)) {
      await this.db
        .delete(t.fileImports)
        .where(and(eq(t.fileImports.repoId, repoId), inArray(t.fileImports.fromFile, chunk)));
      await this.db
        .delete(t.fileExports)
        .where(and(eq(t.fileExports.repoId, repoId), inArray(t.fileExports.file, chunk)));
      await this.db
        .delete(t.symbolEdges)
        .where(and(eq(t.symbolEdges.repoId, repoId), inArray(t.symbolEdges.fromPath, chunk)));
    }
    await this.insertGraphRows(repoId, rows);
  }

  private async insertGraphRows(repoId: string, rows: GraphRowsInput): Promise<void> {
    const imports = rows.imports.map((r) => ({ repoId, ...r, specifier: clampIndexedName(r.specifier) }));
    for (const chunk of chunked(imports, INSERT_CHUNK_SIZE)) {
      await this.db.insert(t.fileImports).values(chunk).onConflictDoNothing();
    }
    const exportsRows = rows.exports.map((r) => ({ repoId, ...r }));
    for (const chunk of chunked(exportsRows, INSERT_CHUNK_SIZE)) {
      await this.db.insert(t.fileExports).values(chunk).onConflictDoNothing();
    }
    const edges = rows.edges.map((r) => ({ repoId, ...r }));
    for (const chunk of chunked(edges, INSERT_CHUNK_SIZE)) {
      await this.db.insert(t.symbolEdges).values(chunk).onConflictDoNothing();
    }
  }

  /** Every persisted import/export/symbol row — the incremental run's context. */
  async getGraphContext(repoId: string): Promise<GraphContextRows> {
    const imports = await this.db
      .select()
      .from(t.fileImports)
      .where(eq(t.fileImports.repoId, repoId));
    const exportRows = await this.db
      .select()
      .from(t.fileExports)
      .where(eq(t.fileExports.repoId, repoId));
    const symbols = await this.db
      .select({
        path: t.symbols.path,
        name: t.symbols.name,
        kind: t.symbols.kind,
        line: t.symbols.line,
        endLine: t.symbols.endLine,
        exported: t.symbols.exported,
        signature: t.symbols.signature,
      })
      .from(t.symbols)
      .where(eq(t.symbols.repoId, repoId));
    return {
      imports: imports.map(({ repoId: _r, ...r }) => r),
      exports: exportRows.map(({ repoId: _r, ...r }) => r),
      symbols,
    };
  }

  /**
   * AC-18 expansion. Files whose bindings may change when `changed` files
   * change: direct importers (`file_imports.resolved_file`) and re-exporters
   * (`file_exports.resolved_file`); re-exporters are followed transitively so
   * importers of a barrel are picked up too. Returns the extra files only.
   */
  async getImpactedImporters(repoId: string, changed: string[]): Promise<string[]> {
    const seen = new Set(changed);
    const extra = new Set<string>();
    let frontier = [...new Set(changed)];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const chunk of chunked(frontier, DELETE_CHUNK_SIZE)) {
        const importers = await this.db
          .selectDistinct({ file: t.fileImports.fromFile })
          .from(t.fileImports)
          .where(
            and(eq(t.fileImports.repoId, repoId), inArray(t.fileImports.resolvedFile, chunk)),
          );
        const reexporters = await this.db
          .selectDistinct({ file: t.fileExports.file })
          .from(t.fileExports)
          .where(
            and(eq(t.fileExports.repoId, repoId), inArray(t.fileExports.resolvedFile, chunk)),
          );
        for (const { file } of importers) {
          if (!seen.has(file)) {
            seen.add(file);
            extra.add(file);
          }
        }
        for (const { file } of reexporters) {
          if (!seen.has(file)) {
            seen.add(file);
            extra.add(file);
            next.push(file); // a barrel: its own importers are affected too
          }
        }
      }
      frontier = next;
    }
    return [...extra];
  }

  /** Files whose imports failed to resolve for a reason a NEW file could fix. */
  async getFilesWithRecoverableImports(repoId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ file: t.fileImports.fromFile })
      .from(t.fileImports)
      .where(
        and(
          eq(t.fileImports.repoId, repoId),
          inArray(t.fileImports.unresolvedReason, ['missing', 'ambiguous', 'tsconfig']),
        ),
      );
    return rows.map((r) => r.file);
  }

  /** Subset of `paths` that already have indexed symbols (every parsed file has a `<module>` row). */
  async getIndexedPaths(repoId: string, paths: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (const chunk of chunked(paths, DELETE_CHUNK_SIZE)) {
      const rows = await this.db
        .selectDistinct({ path: t.symbols.path })
        .from(t.symbols)
        .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, chunk)));
      for (const r of rows) out.add(r.path);
    }
    return out;
  }

  /** Reindex progress (AC-16). No-op when the repo has no state row yet. */
  async setReindexProgress(
    repoId: string,
    state: 'queued' | 'running',
    done: number,
    total: number,
  ): Promise<void> {
    await this.db
      .update(t.repoIndexState)
      .set({ reindexState: state, reindexDone: done, reindexTotal: total })
      .where(eq(t.repoIndexState.repoId, repoId));
  }

  async clearReindexState(repoId: string): Promise<void> {
    await this.db
      .update(t.repoIndexState)
      .set({ reindexState: null, reindexDone: null, reindexTotal: null })
      .where(eq(t.repoIndexState.repoId, repoId));
  }

  /** Repos whose stored indexer version differs from `version` (boot sweep, AC-15). */
  async listReposWithStaleIndex(
    version: number,
  ): Promise<Array<{ repoId: string; workspaceId: string }>> {
    return this.db
      .select({ repoId: t.repoIndexState.repoId, workspaceId: t.repos.workspaceId })
      .from(t.repoIndexState)
      .innerJoin(t.repos, eq(t.repos.id, t.repoIndexState.repoId))
      .where(ne(t.repoIndexState.indexerVersion, version));
  }

  // -------------------------------------------------------------------------
  // T3 — reads (facade + repo-map).
  // -------------------------------------------------------------------------

  /** All import edges for a repo (rank graph build + critical-paths). */
  async getEdges(repoId: string): Promise<IndexerEdgeRow[]> {
    return this.db
      .select({ fromFile: t.fileEdges.fromFile, toFile: t.fileEdges.toFile })
      .from(t.fileEdges)
      .where(eq(t.fileEdges.repoId, repoId));
  }

  /** `{path, percentile}` for the given paths (smart-diff / run-executor). */
  async getFileRankFor(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    if (paths.length === 0) return [];
    return this.db
      .select({ path: t.fileRank.filePath, percentile: t.fileRank.percentile })
      .from(t.fileRank)
      .where(and(eq(t.fileRank.repoId, repoId), inArray(t.fileRank.filePath, paths)));
  }

  /**
   * Per-path PR-file churn within `[since, now]` — the raw material for
   * `file_rank.hotness` (D6: sourced from already-ingested PR history, never
   * `git log`, since the clone is shallow). Joins `pr_files` → `pull_requests`
   * on `pr_id`, scoped to this repo and to `pull_requests.opened_at >= since`.
   *
   * Rows with a NULL `opened_at` (the column is nullable — a PR imported
   * without GitHub's opened timestamp) cannot be placed in the recency window
   * and are excluded from both the per-path counts and `prsConsidered`, rather
   * than counted as "always in every window".
   *
   * One grouped query for the per-path counts (never N+1 — no per-path
   * follow-up query), plus one scalar query for `prsConsidered` (Postgres
   * doesn't support `count(DISTINCT …)` as a window function, so the two
   * aggregates can't be folded into a single `SELECT`).
   */
  async getPrChurn(repoId: string, since: Date): Promise<PrChurnResult> {
    const counts = await this.db
      .select({
        path: t.prFiles.path,
        prs: sql<number>`count(distinct ${t.prFiles.prId})`.mapWith(Number),
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(
        and(
          eq(t.pullRequests.repoId, repoId),
          isNotNull(t.pullRequests.openedAt),
          gte(t.pullRequests.openedAt, since),
        ),
      )
      .groupBy(t.prFiles.path);

    const [totalRow] = await this.db
      .select({ prs: sql<number>`count(distinct ${t.pullRequests.id})`.mapWith(Number) })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(
        and(
          eq(t.pullRequests.repoId, repoId),
          isNotNull(t.pullRequests.openedAt),
          gte(t.pullRequests.openedAt, since),
        ),
      );

    return { counts, prsConsidered: totalRow?.prs ?? 0 };
  }

  /**
   * All `file_rank` rows for a repo — `{path, pagerank, hotness, percentile}`,
   * not rank-ordered, up to `limit`. Deliberately NOT `ORDER BY rank DESC
   * LIMIT n`: the caller (`RepoIntelService.getWeightedRankedFiles`) sorts by
   * the read-time weighted score itself, and taking a rank-ordered prefix
   * first would silently exclude a high-churn/low-pagerank file from ever
   * being weighted (AC-12). Ordered by path instead, purely so `LIMIT` picks
   * a deterministic row set — Postgres makes no ordering guarantee for an
   * unordered `LIMIT` query.
   */
  async getFileRankRows(repoId: string, limit: number): Promise<FileRankFullRow[]> {
    return this.db
      .select({
        path: t.fileRank.filePath,
        pagerank: t.fileRank.pagerank,
        hotness: t.fileRank.hotness,
        percentile: t.fileRank.percentile,
      })
      .from(t.fileRank)
      .where(eq(t.fileRank.repoId, repoId))
      .orderBy(asc(t.fileRank.filePath))
      .limit(limit);
  }

  /** Top `limit` paths by rank DESC (caller filters tests/configs in JS). */
  async getRankedPaths(
    repoId: string,
    limit: number,
  ): Promise<Array<{ path: string; rank: number }>> {
    return this.db
      .select({ path: t.fileRank.filePath, rank: t.fileRank.rank })
      .from(t.fileRank)
      .where(eq(t.fileRank.repoId, repoId))
      .orderBy(desc(t.fileRank.rank))
      .limit(limit);
  }

  /** Repo-map candidates: symbols with a signature, joined to rank, ordered. */
  async getRepoMapCandidates(repoId: string): Promise<RepoMapCandidateRow[]> {
    return this.db
      .select({
        path: t.symbols.path,
        name: t.symbols.name,
        exported: t.symbols.exported,
        signature: t.symbols.signature,
        rank: t.fileRank.rank,
      })
      .from(t.symbols)
      .innerJoin(
        t.fileRank,
        and(eq(t.fileRank.repoId, t.symbols.repoId), eq(t.fileRank.filePath, t.symbols.path)),
      )
      .where(and(eq(t.symbols.repoId, repoId), isNotNull(t.symbols.signature)))
      .orderBy(
        desc(t.fileRank.rank),
        desc(t.symbols.exported),
        asc(t.symbols.line),
        asc(t.symbols.name),
      );
  }

  /** Full symbol rows (T2 columns) for the given files. */
  async getSymbolRows(repoId: string, paths: string[]): Promise<FullSymbolRow[]> {
    if (paths.length === 0) return [];
    return this.db
      .select({
        path: t.symbols.path,
        name: t.symbols.name,
        kind: t.symbols.kind,
        line: t.symbols.line,
        endLine: t.symbols.endLine,
        exported: t.symbols.exported,
        signature: t.symbols.signature,
      })
      .from(t.symbols)
      .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, paths)));
  }

  /**
   * Resolved cross-file callers of symbols declared in `declFiles`.
   *
   * Joins `symbols` on `(repoId, name = toSymbol, path IN declFiles)` and
   * excludes `fromPath = symbols.path` — a reference sitting in the SAME file
   * that declares the symbol it references is not a "cross-file caller", it's
   * a same-file usage (e.g. a helper calling itself, or another top-level
   * function in the same module). Excluding it here (rather than "any changed
   * file") keeps a reference from file B to a symbol declared in file A
   * correctly counted, even when both A and B are changed files.
   */
  async getResolvedCallers(
    repoId: string,
    declFiles: string[],
    names: string[],
  ): Promise<ResolvedCallerRow[]> {
    if (declFiles.length === 0 || names.length === 0) return [];
    return this.db
      .select({
        fromPath: t.references.fromPath,
        toSymbol: t.references.toSymbol,
        line: t.references.line,
        rank: t.fileRank.rank,
      })
      .from(t.references)
      .innerJoin(
        t.fileRank,
        and(
          eq(t.fileRank.repoId, t.references.repoId),
          eq(t.fileRank.filePath, t.references.fromPath),
        ),
      )
      .innerJoin(
        t.symbols,
        and(
          eq(t.symbols.repoId, t.references.repoId),
          eq(t.symbols.name, t.references.toSymbol),
          inArray(t.symbols.path, declFiles),
        ),
      )
      .where(
        and(
          eq(t.references.repoId, repoId),
          inArray(t.references.declFile, declFiles),
          inArray(t.references.toSymbol, names),
          ne(t.references.fromPath, t.symbols.path),
        ),
      );
  }

  /** Per-file facts (endpoints/crons) for the given files. */
  async getFileFacts(repoId: string, files: string[]): Promise<IndexerFileFactsRow[]> {
    if (files.length === 0) return [];
    const rows = await this.db
      .select({
        filePath: t.fileFacts.filePath,
        endpoints: t.fileFacts.endpoints,
        crons: t.fileFacts.crons,
      })
      .from(t.fileFacts)
      .where(and(eq(t.fileFacts.repoId, repoId), inArray(t.fileFacts.filePath, files)));
    return rows.map((r) => ({
      filePath: r.filePath,
      endpoints: (r.endpoints as string[]) ?? [],
      crons: (r.crons as string[]) ?? [],
    }));
  }

  /** Repo-map cache read by PK. */
  async getRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
  ): Promise<{ mapText: string; tokenCount: number } | null> {
    const [row] = await this.db
      .select({ mapText: t.repoMapCache.mapText, tokenCount: t.repoMapCache.tokenCount })
      .from(t.repoMapCache)
      .where(
        and(
          eq(t.repoMapCache.repoId, repoId),
          eq(t.repoMapCache.commitSha, commitSha),
          eq(t.repoMapCache.tokenBudget, tokenBudget),
        ),
      );
    return row ?? null;
  }

  /** Repo-map cache upsert by (repoId, commitSha, tokenBudget). */
  async putRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
    mapText: string,
    tokenCount: number,
  ): Promise<void> {
    await this.db
      .insert(t.repoMapCache)
      .values({ repoId, commitSha, tokenBudget, mapText, tokenCount })
      .onConflictDoUpdate({
        target: [t.repoMapCache.repoId, t.repoMapCache.commitSha, t.repoMapCache.tokenBudget],
        set: { mapText, tokenCount, createdAt: new Date() },
      });
  }

  /** Drop the whole repo-map cache for a repo (SHA moved / repo reindex). */
  async deleteRepoMapCache(repoId: string): Promise<void> {
    await this.db.delete(t.repoMapCache).where(eq(t.repoMapCache.repoId, repoId));
  }

  /**
   * Patch facts for a slice of files (incremental): drop the changed files'
   * rows, then insert the non-empty ones. Unchanged files keep their facts.
   */
  async patchFileFacts(
    repoId: string,
    files: string[],
    rows: IndexerFileFactsRow[],
  ): Promise<void> {
    if (files.length > 0) {
      await this.db
        .delete(t.fileFacts)
        .where(and(eq(t.fileFacts.repoId, repoId), inArray(t.fileFacts.filePath, files)));
    }
    const nonEmpty = rows.filter((r) => r.endpoints.length > 0 || r.crons.length > 0);
    if (nonEmpty.length === 0) return;
    const values = nonEmpty.map((r) => ({
      repoId,
      filePath: r.filePath,
      endpoints: r.endpoints,
      crons: r.crons,
    }));
    for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.fileFacts).values(values.slice(i, i + INSERT_CHUNK_SIZE));
    }
  }
}
