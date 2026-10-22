import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns `convention_scans` and `conventions`.
 * Workspace-scoped throughout.
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

  /** Insert a scan and its (already verified, `pending`) candidates in one transaction. */
  async insertScan(
    scan: InsertScan,
    candidates: InsertCandidate[],
  ): Promise<{ scan: ConventionScanRow; candidates: ConventionRow[] }> {
    return this.db.transaction(async (tx) => {
      const [scanRow] = await tx.insert(t.conventionScans).values(scan).returning();
      const rows = candidates.length
        ? await tx
            .insert(t.conventions)
            .values(
              candidates.map((c) => ({
                ...c,
                workspaceId: scan.workspaceId,
                repoId: scan.repoId,
                scanId: scanRow!.id,
              })),
            )
            .returning()
        : [];
      return { scan: scanRow!, candidates: rows };
    });
  }

  /** Most recent scan for a repo, or undefined when it has never been scanned. */
  async getLatestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /** Candidates of a scan, highest confidence first. */
  async listByScan(workspaceId: string, scanId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.scanId, scanId)))
      .orderBy(desc(t.conventions.confidence), asc(t.conventions.createdAt));
  }

  async getByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
  }

  async setStatus(
    workspaceId: string,
    repoId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      )
      .returning();
    return row;
  }
}
