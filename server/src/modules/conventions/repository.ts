import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type {
  ConventionPatch,
  ConventionRecord,
  ConventionStore,
  NewConvention,
  RepoBasics,
  ScanRecord,
} from './ports.js';

type ConventionRow = typeof t.conventions.$inferSelect;
type ScanRow = typeof t.conventionScans.$inferSelect;

const toRecord = (r: ConventionRow): ConventionRecord => ({
  id: r.id,
  workspaceId: r.workspaceId,
  repoId: r.repoId!,
  category: r.category as ConventionCategory,
  rule: r.rule,
  evidencePath: r.evidencePath ?? '',
  evidenceLine: r.evidenceLine ?? null,
  evidenceSnippet: r.evidenceSnippet ?? '',
  confidence: r.confidence ?? 0,
  status: r.status as ConventionStatus,
});

const toScan = (r: ScanRow): ScanRecord => ({
  id: r.id,
  repoId: r.repoId,
  status: r.status,
  filesSampled: r.filesSampled,
  error: r.error,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
});

/** L02 — Drizzle adapter for `conventions` + `convention_scans`. Workspace-scoped. */
export class ConventionsRepository implements ConventionStore {
  constructor(private readonly db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ScanRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row && toScan(row);
  }

  async createScan(workspaceId: string, repoId: string): Promise<ScanRecord> {
    const [row] = await this.db.insert(t.conventionScans).values({ workspaceId, repoId }).returning();
    return toScan(row!);
  }

  async failScan(scanId: string, error: string): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(eq(t.conventionScans.id, scanId));
  }

  async completeScan(
    workspaceId: string,
    repoId: string,
    scanId: string,
    filesSampled: number,
    items: NewConvention[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
      if (items.length > 0) {
        await tx.insert(t.conventions).values(items.map((i) => ({ ...i, workspaceId, repoId })));
      }
      await tx
        .update(t.conventionScans)
        .set({ status: 'done', filesSampled, finishedAt: new Date() })
        .where(eq(t.conventionScans.id, scanId));
    });
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionRecord[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), t.conventions.rule);
    return rows.map(toRecord);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionRecord | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row && toRecord(row);
  }

  async resolvePending(
    workspaceId: string,
    repoId: string,
    status: 'accepted' | 'rejected',
  ): Promise<number> {
    const rows = await this.db
      .update(t.conventions)
      .set({ status, updatedAt: sql`now()` })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }
}
