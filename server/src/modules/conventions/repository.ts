import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { GroundedCandidate } from './helpers.js';

export type ConventionRow = typeof t.conventions.$inferSelect;

/** Conventions data-access (workspace-scoped). Owns the `conventions` table. */
export class ConventionsRepository {
  constructor(private db: Db) {}

  listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), t.conventions.rule);
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { rule?: string; accepted?: boolean },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }

  async setAcceptedForRepo(workspaceId: string, repoId: string, accepted: boolean): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({ accepted })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  /** Re-scan: drop the not-yet-accepted candidates of a repo and insert the new ones. */
  async replacePending(
    workspaceId: string,
    repoId: string,
    candidates: GroundedCandidate[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.accepted, false),
          ),
        );
      if (candidates.length === 0) return;
      await tx.insert(t.conventions).values(
        candidates.map((c) => ({
          workspaceId,
          repoId,
          rule: c.rule,
          evidencePath: c.evidencePath,
          evidenceSnippet: c.evidenceSnippet,
          confidence: c.confidence,
          accepted: false,
        })),
      );
    });
  }
}
