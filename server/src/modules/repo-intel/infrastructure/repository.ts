/**
 * repo-intel write side — the indexer's persistence (symbols, references,
 * graph, rank, facts, repo-map cache, repo_index_state). Extends the read
 * repository so one instance bound to a transaction can also read what it
 * just wrote (repo-map candidates). Implements the IndexWriter and
 * IndexStateWriter ports.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { clampIndexedName } from '../../../db/schema/context.js';
import type {
  IndexStateUpsert,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  IndexerFileRankRow,
  IndexerReferenceRow,
  IndexerSymbolRow,
} from '../domain/model.js';
import type { IndexStateWriter, IndexWriter } from '../application/ports.js';
import { RepoIntelReadRepository } from './read-repository.js';

/** Chunk size for batched inserts. */
const INSERT_CHUNK_SIZE = 500;

export class RepoIntelRepository extends RepoIntelReadRepository implements IndexWriter, IndexStateWriter {
  /**
   * Run `work` on a repository bound to ONE transaction, so readers never see
   * a half-written index. On a transaction-bound repository this opens a
   * SAVEPOINT, letting an optional step fail and roll back alone. Keep outside
   * I/O (git, depcruise) out of `work`.
   */
  transaction<T>(work: (repo: RepoIntelRepository) => Promise<T>): Promise<T> {
    return (this.db as Db).transaction((tx) => work(new RepoIntelRepository(tx)));
  }

  savepoint<T>(work: (writer: IndexWriter) => Promise<T>): Promise<T> {
    return this.transaction(work);
  }

  /** Wipe every symbol + reference row of a repo (full-index reset). */
  async deleteAllForRepo(repoId: string): Promise<void> {
    await this.db.delete(t.symbols).where(eq(t.symbols.repoId, repoId));
    await this.db.delete(t.references).where(eq(t.references.repoId, repoId));
  }

  /** Wipe the symbols declared in / references made from `paths` (incremental slice). */
  async deleteForFiles(repoId: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.db.delete(t.symbols).where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, paths)));
    await this.db
      .delete(t.references)
      .where(and(eq(t.references.repoId, repoId), inArray(t.references.fromPath, paths)));
  }

  async insertSymbols(rows: IndexerSymbolRow[]): Promise<void> {
    // Clamp the indexed `name` so a pathological multi-KB identifier can't blow
    // the btree row-size limit and crash the indexer (see clampIndexedName).
    const safe = rows.map((r) => ({ ...r, name: clampIndexedName(r.name) }));
    for (const chunk of chunked(safe)) await this.db.insert(t.symbols).values(chunk);
  }

  async insertReferences(rows: IndexerReferenceRow[]): Promise<void> {
    const safe = rows.map((r) => ({ ...r, toSymbol: clampIndexedName(r.toSymbol) }));
    for (const chunk of chunked(safe)) await this.db.insert(t.references).values(chunk);
  }

  /**
   * Upsert the `repo_index_state` row (PK = repoId). `updated_at` is bumped on
   * conflict so consumers can see when the indexer last touched it.
   */
  async upsertIndexState(state: IndexStateUpsert): Promise<void> {
    const now = new Date();
    const values = {
      lastIndexedSha: state.lastIndexedSha,
      indexerVersion: state.indexerVersion,
      status: state.status,
      filesIndexed: state.filesIndexed,
      filesSkipped: state.filesSkipped,
      stats: state.stats,
      updatedAt: now,
    };
    await this.db
      .insert(t.repoIndexState)
      .values({ repoId: state.repoId, ...values })
      .onConflictDoUpdate({ target: t.repoIndexState.repoId, set: values });
  }

  /** Bump `updated_at` (and optionally stats) without touching files/sha/status. */
  async touchIndexState(repoId: string, stats?: Record<string, unknown>): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (stats) updates.stats = stats;
    await this.db.update(t.repoIndexState).set(updates).where(eq(t.repoIndexState.repoId, repoId));
  }

  /** Remember a new `lastIndexedSha` when no indexed file changed. */
  async advanceSha(repoId: string, sha: string): Promise<void> {
    await this.db
      .update(t.repoIndexState)
      .set({ lastIndexedSha: sha, updatedAt: new Date() })
      .where(eq(t.repoIndexState.repoId, repoId));
  }

  /** Replace the whole import graph of a repo. */
  async replaceEdges(repoId: string, edges: IndexerEdgeRow[]): Promise<void> {
    await this.db.delete(t.fileEdges).where(eq(t.fileEdges.repoId, repoId));
    const rows = edges.map((e) => ({ repoId, fromFile: e.fromFile, toFile: e.toFile }));
    for (const chunk of chunked(rows)) await this.db.insert(t.fileEdges).values(chunk);
  }

  /** Replace the whole file_rank of a repo. */
  async replaceFileRank(repoId: string, rows: IndexerFileRankRow[]): Promise<void> {
    await this.db.delete(t.fileRank).where(eq(t.fileRank.repoId, repoId));
    const values = rows.map((r) => ({ repoId, ...r }));
    for (const chunk of chunked(values)) await this.db.insert(t.fileRank).values(chunk);
  }

  /** Replace all per-file facts; only rows with at least one endpoint/cron persist. */
  async replaceFileFacts(repoId: string, rows: IndexerFileFactsRow[]): Promise<void> {
    await this.db.delete(t.fileFacts).where(eq(t.fileFacts.repoId, repoId));
    await this.insertFacts(repoId, rows);
  }

  /** Patch facts for a slice of files (incremental); unchanged files keep theirs. */
  async patchFileFacts(repoId: string, files: string[], rows: IndexerFileFactsRow[]): Promise<void> {
    if (files.length > 0) {
      await this.db
        .delete(t.fileFacts)
        .where(and(eq(t.fileFacts.repoId, repoId), inArray(t.fileFacts.filePath, files)));
    }
    await this.insertFacts(repoId, rows);
  }

  /**
   * Resolve `references.decl_file` through the import graph (step 5). A
   * reference `(from_path → to_symbol)` resolves to file `F` iff `from_path`
   * imports `F` AND `F` exports a symbol named `to_symbol` — and ONLY when that
   * candidate is unique; 0 or >1 candidates leave `decl_file = NULL` (the
   * honest "unresolved" signal, never a nearest-name guess).
   *
   * `reset: true` (incremental) first clears every decl_file so a changed
   * decl-file can't leave a stale resolution behind. `"references"` is quoted
   * (reserved word); the query is fully parameterised on repoId.
   */
  async resolveReferences(repoId: string, opts: { reset: boolean }): Promise<void> {
    if (opts.reset) {
      await this.db.execute(sql`UPDATE "references" SET decl_file = NULL WHERE repo_id = ${repoId}`);
    }
    await this.db.execute(sql`
      WITH cand AS (
        SELECT r.id AS ref_id, e.to_file AS decl
        FROM "references" r
        JOIN file_edges e ON e.repo_id = r.repo_id AND e.from_file = r.from_path
        JOIN symbols s ON s.repo_id = r.repo_id AND s.path = e.to_file
                      AND s.name = r.to_symbol AND s.exported = true
        WHERE r.repo_id = ${repoId}
        GROUP BY r.id, e.to_file
      ),
      uniq AS (
        SELECT ref_id FROM cand GROUP BY ref_id HAVING count(*) = 1
      )
      UPDATE "references" r
      SET decl_file = c.decl
      FROM cand c
      JOIN uniq u ON u.ref_id = c.ref_id
      WHERE r.id = c.ref_id
    `);
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

  /** Drop the whole repo-map cache of a repo (SHA moved / reindex). */
  async deleteRepoMapCache(repoId: string): Promise<void> {
    await this.db.delete(t.repoMapCache).where(eq(t.repoMapCache.repoId, repoId));
  }

  private async insertFacts(repoId: string, rows: IndexerFileFactsRow[]): Promise<void> {
    const values = rows
      .filter((r) => r.endpoints.length > 0 || r.crons.length > 0)
      .map((r) => ({ repoId, filePath: r.filePath, endpoints: r.endpoints, crons: r.crons }));
    for (const chunk of chunked(values)) await this.db.insert(t.fileFacts).values(chunk);
  }
}

/** Split `rows` into insert batches (empty input → no batch, no query). */
function* chunked<T>(rows: T[]): Generator<T[]> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) yield rows.slice(i, i + INSERT_CHUNK_SIZE);
}
