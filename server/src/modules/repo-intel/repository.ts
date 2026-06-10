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
import type { IndexState, IndexStatus } from './types.js';

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
   * Probe the `repo_index_state` table tolerantly. The T2 migration introduces
   * it; until then this MUST return `null` rather than throw, so the facade
   * can synthesise a degraded IndexState.
   *
   * We use raw SQL (not a Drizzle table) so we don't have to declare the
   * not-yet-existing schema. The `try` swallows the "undefined_table" error.
   */
  async tryGetIndexState(repoId: string): Promise<IndexState | null> {
    try {
      const rows = (await this.db.execute(sql`
        SELECT
          status,
          files_indexed,
          files_skipped,
          duration_ms,
          reason,
          last_indexed_sha,
          indexer_version,
          updated_at,
          degraded,
          degraded_reason
        FROM repo_index_state
        WHERE repo_id = ${repoId}
        LIMIT 1
      `)) as unknown as Array<{
        status: string;
        files_indexed: number | string;
        files_skipped: number | string;
        duration_ms: number | string;
        reason: string | null;
        last_indexed_sha: string | null;
        indexer_version: number | string;
        updated_at: Date | string;
        degraded: boolean | null;
        degraded_reason: string | null;
      }>;
      const row = rows[0];
      if (!row) return null;
      return {
        repoId,
        status: row.status as IndexStatus,
        filesIndexed: Number(row.files_indexed),
        filesSkipped: Number(row.files_skipped),
        durationMs: Number(row.duration_ms),
        reason: row.reason ?? undefined,
        lastIndexedSha: row.last_indexed_sha ?? '',
        indexerVersion: Number(row.indexer_version),
        updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
        degraded: row.degraded ?? undefined,
        degradedReason:
          (row.degraded_reason as IndexState['degradedReason']) ?? undefined,
      };
    } catch (err) {
      // 42P01 = undefined_table. Anything else (missing column on the T2 dev
      // branch, etc.) we also treat as "not available yet" — the facade always
      // has a safe degraded fallback.
      const code = (err as { code?: string } | null)?.code;
      if (code === '42P01' || code === undefined) return null;
      return null;
    }
  }
}
