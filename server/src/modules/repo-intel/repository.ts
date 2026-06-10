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
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { DegradedReason, IndexState, IndexStatus } from './types.js';

/** Chunk size for batched inserts — same value blast already uses. */
const INSERT_CHUNK_SIZE = 500;

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
  contentHash: string;
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
}

/** Minimal repo shape the facade needs to call CodeIndex on a clone. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
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

export class RepoIntelRepository {
  constructor(private db: Db) {}

  async getRepoBasics(repoId: string): Promise<RepoBasics | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
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
      };
    } catch {
      // Table missing / schema drift / connection blip — degrade silently. The
      // facade always has a safe synthesised fallback.
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // T2 indexer-pipeline writes (plan §9).
  // -------------------------------------------------------------------------

  /** Wipe every cached symbol + reference row for a repo (full-index reset). */
  async deleteAllForRepo(repoId: string): Promise<void> {
    await this.db.delete(t.symbols).where(eq(t.symbols.repoId, repoId));
    await this.db.delete(t.references).where(eq(t.references.repoId, repoId));
  }

  /**
   * Wipe symbols whose `path` is in `paths` and references whose `fromPath`
   * is in `paths`. Used by the incremental indexer before re-parsing a slice.
   * Inline-empty guard keeps the no-op refresh path zero-DB.
   */
  async deleteForFiles(repoId: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.db
      .delete(t.symbols)
      .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, paths)));
    await this.db
      .delete(t.references)
      .where(
        and(eq(t.references.repoId, repoId), inArray(t.references.fromPath, paths)),
      );
  }

  /** Batched insert into `symbols`. Uses the same chunk size as blast. */
  async insertSymbols(rows: IndexerSymbolRow[]): Promise<void> {
    if (rows.length === 0) return;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.symbols).values(rows.slice(i, i + INSERT_CHUNK_SIZE));
    }
  }

  /** Batched insert into `references`. */
  async insertReferences(rows: IndexerReferenceRow[]): Promise<void> {
    if (rows.length === 0) return;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      await this.db.insert(t.references).values(rows.slice(i, i + INSERT_CHUNK_SIZE));
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
        },
      });
  }

  /**
   * Touch `updated_at` (and stats) on the existing index-state row WITHOUT
   * changing files/sha/status. Used by the incremental refresh's "sha
   * unchanged" branch (plan §9.3 step 2).
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
}
