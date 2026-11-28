import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionStore, ScanInfo, ScanLog, StoredConvention, VerifiedCandidate } from './ports.js';
import type { ConventionStatus } from '@devdigest/shared';

type ConventionRow = typeof t.conventions.$inferSelect;

function toStored(row: ConventionRow): StoredConvention {
  return {
    id: row.id,
    repoId: row.repoId,
    category: row.category,
    rule: row.rule,
    evidencePath: row.evidencePath ?? '',
    evidenceSnippet: row.evidenceSnippet ?? '',
    evidenceStartLine: row.evidenceStartLine,
    evidenceEndLine: row.evidenceEndLine,
    confidence: row.confidence ?? 0,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** M2 conventions persistence (the `conventions` table). */
export class ConventionsRepository implements ConventionStore {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<StoredConvention[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), t.conventions.createdAt);
    return rows.map(toStored);
  }

  async getById(workspaceId: string, id: string): Promise<StoredConvention | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .limit(1);
    return row && toStored(row);
  }

  async replaceUndecided(workspaceId: string, repoId: string, fresh: VerifiedCandidate[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            inArray(t.conventions.status, ['pending', 'rejected']),
          ),
        );
      if (fresh.length === 0) return;
      await tx.insert(t.conventions).values(
        fresh.map((c) => ({
          workspaceId,
          repoId,
          category: c.category,
          rule: c.rule,
          evidencePath: c.evidencePath,
          evidenceSnippet: c.evidenceSnippet,
          evidenceStartLine: c.evidenceStartLine,
          evidenceEndLine: c.evidenceEndLine,
          confidence: c.confidence,
          status: 'pending' as const,
          accepted: false,
        })),
      );
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string },
  ): Promise<StoredConvention | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status, accepted: patch.status === 'accepted' } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row && toStored(row);
  }
}

/** Process-local record of the last scan per repo. Lost on restart; the list then falls back to the newest row's date. */
export class InMemoryScanLog implements ScanLog {
  private scans = new Map<string, ScanInfo>();
  get(repoId: string): ScanInfo | undefined {
    return this.scans.get(repoId);
  }
  set(repoId: string, info: ScanInfo): void {
    this.scans.set(repoId, info);
  }
}
