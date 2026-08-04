import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns `convention_scans` and `conventions`.
 * Workspace-scoped throughout: every read/write keyed by `workspaceId`.
 */

export type ConventionScanRow = typeof t.conventionScans.$inferSelect;
export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionStatus = ConventionRow['status'];

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  sampleFileCount: number;
  sourceSha: string;
  model: string;
}

export interface InsertCandidate {
  workspaceId: string;
  repoId: string;
  scanId: string;
  category: string;
  rule: string;
  evidencePath: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async insertScan(values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({
        workspaceId: values.workspaceId,
        repoId: values.repoId,
        sampleFileCount: values.sampleFileCount,
        sourceSha: values.sourceSha,
        model: values.model,
      })
      .returning();
    return row!;
  }

  /** Only verified candidates ever reach here — all start `status: 'pending'`. */
  async insertCandidates(values: InsertCandidate[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        values.map((v) => ({
          workspaceId: v.workspaceId,
          repoId: v.repoId,
          scanId: v.scanId,
          category: v.category,
          rule: v.rule,
          evidencePath: v.evidencePath,
          evidenceStartLine: v.evidenceStartLine,
          evidenceEndLine: v.evidenceEndLine,
          evidenceSnippet: v.evidenceSnippet,
          confidence: v.confidence,
        })),
      )
      .returning();
  }

  /** Most recent scan for a repo, or undefined when it has never been scanned. */
  async getLatestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  async listByScan(scanId: string): Promise<ConventionRow[]> {
    return this.db.select().from(t.conventions).where(eq(t.conventions.scanId, scanId));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async getByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
