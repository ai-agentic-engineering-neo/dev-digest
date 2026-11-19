/**
 * Read-only SQL for the project graph (plan 19 P4-A). Separate from
 * `repository.ts` (indexer-owned). Nothing here writes.
 */
import { and, asc, count, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface GraphIndexStateRow {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  lastIndexedSha: string;
  indexerVersion: number;
  coverage: unknown;
  reindexState: 'queued' | 'running' | null;
  reindexDone: number | null;
  reindexTotal: number | null;
}

export interface GraphFileRow {
  path: string;
  rank: number;
  hotness: number;
}

export interface GraphSymbolRow {
  name: string;
  kind: string;
  line: number | null;
  endLine: number | null;
  exported: boolean;
}

export interface GraphSymbolEdgeRow {
  fromPath: string;
  fromName: string;
  toPath: string;
  toName: string;
  kind: string;
  confidence: 'exact' | 'inferred';
}

export interface GraphUnresolvedRow {
  file: string;
  specifier: string;
  importedName: string;
  line: number;
  reason: string;
}

/** Unresolved reasons that are NOT counted as unresolved (AC-5). */
const NOT_UNRESOLVED = ['external', 'builtin'] as const;

export class GraphReadRepository {
  constructor(private readonly db: Db) {}

  async getIndexState(repoId: string): Promise<GraphIndexStateRow | null> {
    const [row] = await this.db
      .select({
        status: t.repoIndexState.status,
        lastIndexedSha: t.repoIndexState.lastIndexedSha,
        indexerVersion: t.repoIndexState.indexerVersion,
        coverage: t.repoIndexState.coverage,
        reindexState: t.repoIndexState.reindexState,
        reindexDone: t.repoIndexState.reindexDone,
        reindexTotal: t.repoIndexState.reindexTotal,
      })
      .from(t.repoIndexState)
      .where(eq(t.repoIndexState.repoId, repoId));
    return row ?? null;
  }

  /** True while an index job for this repo is queued or running. */
  async hasActiveIndexJob(repoId: string, kinds: readonly string[]): Promise<boolean> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.jobs)
      .where(
        and(
          inArray(t.jobs.kind, [...kinds]),
          inArray(t.jobs.status, ['queued', 'running']),
          sql`${t.jobs.payload}->>'repoId' = ${repoId}`,
        ),
      );
    return (row?.n ?? 0) > 0;
  }

  /** Every indexed file (parsed or edge endpoint) with its rank/hotness. */
  async listFiles(repoId: string): Promise<GraphFileRow[]> {
    const rows = await this.db.execute<{ path: string; rank: number | null; hotness: number | null }>(sql`
      SELECT p.path AS path, r.rank AS rank, r.hotness AS hotness
      FROM (
        SELECT path FROM symbols WHERE repo_id = ${repoId}
        UNION SELECT file_path FROM file_rank WHERE repo_id = ${repoId}
        UNION SELECT from_file FROM file_edges WHERE repo_id = ${repoId}
        UNION SELECT to_file FROM file_edges WHERE repo_id = ${repoId}
      ) p
      LEFT JOIN file_rank r ON r.repo_id = ${repoId} AND r.file_path = p.path
    `);
    return [...rows].map((r) => ({
      path: r.path,
      rank: Number(r.rank ?? 0),
      hotness: Number(r.hotness ?? 0),
    }));
  }

  async listFileEdges(repoId: string): Promise<Array<{ from: string; to: string }>> {
    const rows = await this.db
      .select({ from: t.fileEdges.fromFile, to: t.fileEdges.toFile })
      .from(t.fileEdges)
      .where(eq(t.fileEdges.repoId, repoId));
    return rows;
  }

  async countSymbols(repoId: string, file: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.symbols)
      .where(and(eq(t.symbols.repoId, repoId), eq(t.symbols.path, file)));
    return row?.n ?? 0;
  }

  async listSymbols(
    repoId: string,
    file: string,
    offset: number,
    limit: number,
  ): Promise<GraphSymbolRow[]> {
    return this.db
      .select({
        name: t.symbols.name,
        kind: t.symbols.kind,
        line: t.symbols.line,
        endLine: t.symbols.endLine,
        exported: t.symbols.exported,
      })
      .from(t.symbols)
      .where(and(eq(t.symbols.repoId, repoId), eq(t.symbols.path, file)))
      .orderBy(asc(t.symbols.line), asc(t.symbols.name))
      .offset(offset)
      .limit(limit);
  }

  /**
   * Symbol edges touching `names` of `file` (in either direction), at most
   * `limit` rows. Callers pass `max + 1` to detect truncation.
   */
  async listSymbolEdges(
    repoId: string,
    file: string,
    names: readonly string[],
    limit: number,
  ): Promise<GraphSymbolEdgeRow[]> {
    if (names.length === 0) return [];
    return this.db
      .select({
        fromPath: t.symbolEdges.fromPath,
        fromName: t.symbolEdges.fromName,
        toPath: t.symbolEdges.toPath,
        toName: t.symbolEdges.toName,
        kind: t.symbolEdges.kind,
        confidence: t.symbolEdges.confidence,
      })
      .from(t.symbolEdges)
      .where(
        and(
          eq(t.symbolEdges.repoId, repoId),
          or(
            and(eq(t.symbolEdges.fromPath, file), inArray(t.symbolEdges.fromName, [...names])),
            and(eq(t.symbolEdges.toPath, file), inArray(t.symbolEdges.toName, [...names])),
          ),
        ),
      )
      .orderBy(
        asc(t.symbolEdges.fromPath),
        asc(t.symbolEdges.fromName),
        asc(t.symbolEdges.toPath),
        asc(t.symbolEdges.toName),
        asc(t.symbolEdges.line),
      )
      .limit(limit);
  }

  /** Per-symbol in/out symbol-edge counts for the given names of one file. */
  async symbolDegrees(
    repoId: string,
    file: string,
    names: readonly string[],
  ): Promise<Map<string, { inCount: number; outCount: number }>> {
    const out = new Map<string, { inCount: number; outCount: number }>();
    if (names.length === 0) return out;
    const list = [...names];
    const [ins, outs] = await Promise.all([
      this.db
        .select({ name: t.symbolEdges.toName, n: count() })
        .from(t.symbolEdges)
        .where(
          and(
            eq(t.symbolEdges.repoId, repoId),
            eq(t.symbolEdges.toPath, file),
            inArray(t.symbolEdges.toName, list),
          ),
        )
        .groupBy(t.symbolEdges.toName),
      this.db
        .select({ name: t.symbolEdges.fromName, n: count() })
        .from(t.symbolEdges)
        .where(
          and(
            eq(t.symbolEdges.repoId, repoId),
            eq(t.symbolEdges.fromPath, file),
            inArray(t.symbolEdges.fromName, list),
          ),
        )
        .groupBy(t.symbolEdges.fromName),
    ]);
    for (const n of list) out.set(n, { inCount: 0, outCount: 0 });
    for (const r of ins) out.get(r.name)!.inCount = r.n;
    for (const r of outs) out.get(r.name)!.outCount = r.n;
    return out;
  }

  private unresolvedWhere(repoId: string) {
    return and(
      eq(t.fileImports.repoId, repoId),
      sql`${t.fileImports.unresolvedReason} IS NOT NULL`,
      notInArray(t.fileImports.unresolvedReason, [...NOT_UNRESOLVED]),
    );
  }

  async countUnresolved(repoId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.fileImports)
      .where(this.unresolvedWhere(repoId));
    return row?.n ?? 0;
  }

  async listUnresolved(repoId: string, offset: number, limit: number): Promise<GraphUnresolvedRow[]> {
    const rows = await this.db
      .select({
        file: t.fileImports.fromFile,
        specifier: t.fileImports.specifier,
        importedName: t.fileImports.importedName,
        line: t.fileImports.line,
        reason: t.fileImports.unresolvedReason,
      })
      .from(t.fileImports)
      .where(this.unresolvedWhere(repoId))
      .orderBy(asc(t.fileImports.fromFile), asc(t.fileImports.idx))
      .offset(offset)
      .limit(limit);
    return rows.map((r) => ({ ...r, reason: r.reason ?? 'missing' }));
  }
}
