import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
import type { ConventionStatus } from '@devdigest/shared';

export type { ConventionRow };

export interface InsertPendingConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
  category: string | null;
  evidenceStartLine: number;
  evidenceEndLine: number;
}

export interface PatchConvention {
  status?: ConventionStatus;
  rule?: string;
}

/**
 * Conventions data-access. Owns `conventions` only — never `skills`.
 * Every query is workspace-scoped (tenancy guard).
 */
export class ConventionsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt));
  }

  async getById(
    workspaceId: string,
    repoId: string,
    id: string,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      );
    return row;
  }

  async getByIds(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionRow[]> {
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

  /**
   * Re-scan: drop pending rows for this repo, then insert the new pending set.
   * Accepted/rejected rows are untouched.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    inserts: InsertPendingConvention[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (inserts.length === 0) return;
      await tx.insert(t.conventions).values(
        inserts.map((row) => ({
          workspaceId: row.workspaceId,
          repoId: row.repoId,
          rule: row.rule,
          evidencePath: row.evidencePath,
          evidenceSnippet: row.evidenceSnippet,
          confidence: row.confidence,
          accepted: false,
          status: 'pending' as const,
          category: row.category,
          evidenceStartLine: row.evidenceStartLine,
          evidenceEndLine: row.evidenceEndLine,
        })),
      );
    });
  }

  async update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: PatchConvention,
  ): Promise<ConventionRow | undefined> {
    const existing = await this.getById(workspaceId, repoId, id);
    if (!existing) return undefined;
    const status = patch.status ?? existing.status;
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        accepted: status === 'accepted',
      })
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
