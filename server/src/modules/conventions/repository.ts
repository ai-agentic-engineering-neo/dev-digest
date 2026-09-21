import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
import type {
  ConventionPatch,
  ConventionRecord,
  ConventionsStore,
  NewConvention,
  RepoInfo,
} from './types.js';

export type { ConventionRow };

/**
 * Conventions data-access. Owns the `conventions` table (plus one read of the
 * `repos` row it needs to locate the clone).
 *
 * Workspace-scoped throughout; `repo_id` is nullable in the schema (a
 * workspace-wide convention is legal) but every query here is repo-scoped,
 * because the extractor only ever produces repo-scoped rows.
 */
export class ConventionsRepository implements ConventionsStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRecord[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /**
   * Replace this repo's PENDING candidates with a fresh scan's results.
   *
   * Accepted and rejected rows survive untouched: a re-scan re-proposes, it
   * does not re-litigate decisions the user already made. Delete + insert run
   * in one transaction so a failed insert cannot leave the board empty.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    candidates: NewConvention[],
  ): Promise<ConventionRecord[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (candidates.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(
          candidates.map((c) => ({
            workspaceId,
            repoId,
            category: c.category,
            rule: c.rule,
            rationale: c.rationale,
            evidencePath: c.evidencePath,
            evidenceLine: c.evidenceLine,
            evidenceSnippet: c.evidenceSnippet,
            evidenceFiles: c.evidenceFiles,
            occurrences: c.occurrences,
            confidence: c.confidence,
            status: 'pending' as const,
          })),
        )
        .returning();
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionRecord | undefined> {
    const set = {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.rationale !== undefined ? { rationale: patch.rationale } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    };
    if (Object.keys(set).length === 0) return this.getById(workspaceId, id);
    const [row] = await this.db
      .update(t.conventions)
      .set(set)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
