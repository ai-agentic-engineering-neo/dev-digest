/**
 * repo-intel read side — Drizzle queries over the persisted index (symbols,
 * references, file_edges, file_rank, file_facts, repo_map_cache,
 * repo_index_state). Implements the RepoIntelReader port.
 */
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type {
  FullSymbolRow,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  RepoBasics,
  RepoMapCandidateRow,
  ResolvedCallerRow,
} from '../domain/model.js';
import type { RepoIntelReader } from '../application/ports.js';
import type { DegradedReason, FileRankRow, IndexState, IndexStatus } from '../types.js';

type IndexStateRow = typeof t.repoIndexState.$inferSelect;

/**
 * Map a `repo_index_state` row to the IndexState read model. `durationMs`,
 * `reason` and `degradedReason` live inside `stats`. Only a status the indexer
 * stamped as 'degraded'|'failed' is flagged `degraded` — 'partial' is still a
 * working index.
 */
export function toIndexState(row: IndexStateRow): IndexState {
  const stats = (row.stats ?? {}) as Record<string, unknown>;
  const isDegraded = row.status === 'degraded' || row.status === 'failed';
  return {
    repoId: row.repoId,
    status: row.status as IndexStatus,
    filesIndexed: row.filesIndexed,
    filesSkipped: row.filesSkipped,
    durationMs: typeof stats.durationMs === 'number' ? stats.durationMs : 0,
    reason: typeof stats.reason === 'string' ? stats.reason : undefined,
    lastIndexedSha: row.lastIndexedSha,
    indexerVersion: row.indexerVersion,
    updatedAt: row.updatedAt,
    degraded: isDegraded ? true : undefined,
    degradedReason: isDegraded
      ? ((stats.degradedReason as DegradedReason | undefined) ?? 'index_failed')
      : undefined,
  };
}

export class RepoIntelReadRepository implements RepoIntelReader {
  constructor(protected readonly db: DbOrTx) {}

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

  /**
   * The `repo_index_state` row, if any. Tolerant of a missing table / schema
   * drift / connection blip — returns `null` so the facade synthesises a
   * degraded reply instead of throwing.
   */
  async tryGetIndexState(repoId: string): Promise<IndexState | null> {
    try {
      const [row] = await this.db
        .select()
        .from(t.repoIndexState)
        .where(eq(t.repoIndexState.repoId, repoId));
      return row ? toIndexState(row) : null;
    } catch {
      return null;
    }
  }

  /** All import edges for a repo (critical paths). */
  async getEdges(repoId: string): Promise<IndexerEdgeRow[]> {
    return this.db
      .select({ fromFile: t.fileEdges.fromFile, toFile: t.fileEdges.toFile })
      .from(t.fileEdges)
      .where(eq(t.fileEdges.repoId, repoId));
  }

  /** `{path, percentile}` for the given paths. */
  async getFileRankFor(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    if (paths.length === 0) return [];
    return this.db
      .select({ path: t.fileRank.filePath, percentile: t.fileRank.percentile })
      .from(t.fileRank)
      .where(and(eq(t.fileRank.repoId, repoId), inArray(t.fileRank.filePath, paths)));
  }

  /** Top `limit` paths by rank DESC (the caller filters tests/configs). */
  async getRankedPaths(repoId: string, limit: number): Promise<Array<{ path: string; rank: number }>> {
    return this.db
      .select({ path: t.fileRank.filePath, rank: t.fileRank.rank })
      .from(t.fileRank)
      .where(eq(t.fileRank.repoId, repoId))
      .orderBy(desc(t.fileRank.rank))
      .limit(limit);
  }

  /** Repo-map candidates: symbols with a signature, joined to rank, ordered for the renderer. */
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
      .orderBy(desc(t.fileRank.rank), desc(t.symbols.exported), asc(t.symbols.line), asc(t.symbols.name));
  }

  /** Full symbol rows for the given files. */
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

  /** Resolved cross-file callers of symbols declared in `declFiles`. */
  async getResolvedCallers(repoId: string, declFiles: string[], names: string[]): Promise<ResolvedCallerRow[]> {
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
        and(eq(t.fileRank.repoId, t.references.repoId), eq(t.fileRank.filePath, t.references.fromPath)),
      )
      .where(
        and(
          eq(t.references.repoId, repoId),
          inArray(t.references.declFile, declFiles),
          inArray(t.references.toSymbol, names),
        ),
      );
  }

  /** Per-file facts (endpoints/crons) for the given files. */
  async getFileFacts(repoId: string, files: string[]): Promise<IndexerFileFactsRow[]> {
    if (files.length === 0) return [];
    const rows = await this.db
      .select({ filePath: t.fileFacts.filePath, endpoints: t.fileFacts.endpoints, crons: t.fileFacts.crons })
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
}
