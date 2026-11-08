import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { DevdigestDocRow } from '../../../db/rows.js';
import type { DevdigestDocRecord, DevdigestDocsRepositoryPort } from '../ports.js';

function toRecord(row: DevdigestDocRow): DevdigestDocRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    path: row.path,
    content: row.content,
    copiedFrom: row.copiedFrom,
    updatedAt: row.updatedAt,
  };
}

/** Storage for DevDigest-owned docs (SPEC-03). `devdigest_docs` has workspace_id: every statement filters it. */
export class DevdigestDocsRepository implements DevdigestDocsRepositoryPort {
  constructor(private readonly db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<DevdigestDocRecord[]> {
    const rows = await this.db
      .select()
      .from(t.devdigestDocs)
      .where(and(eq(t.devdigestDocs.workspaceId, workspaceId), eq(t.devdigestDocs.repoId, repoId)))
      .orderBy(sql`${t.devdigestDocs.path} collate "C"`);
    return rows.map(toRecord);
  }

  async getById(workspaceId: string, id: string): Promise<DevdigestDocRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.devdigestDocs)
      .where(and(eq(t.devdigestDocs.id, id), eq(t.devdigestDocs.workspaceId, workspaceId)))
      .limit(1);
    return row ? toRecord(row) : undefined;
  }

  async getByPaths(workspaceId: string, repoId: string, paths: readonly string[]): Promise<DevdigestDocRecord[]> {
    if (paths.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.devdigestDocs)
      .where(
        and(
          eq(t.devdigestDocs.workspaceId, workspaceId),
          eq(t.devdigestDocs.repoId, repoId),
          inArray(t.devdigestDocs.path, [...paths]),
        ),
      );
    return rows.map(toRecord);
  }

  async countByRepo(workspaceId: string, repoId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.devdigestDocs)
      .where(and(eq(t.devdigestDocs.workspaceId, workspaceId), eq(t.devdigestDocs.repoId, repoId)));
    return row?.n ?? 0;
  }

  async insert(input: {
    workspaceId: string;
    repoId: string;
    path: string;
    content: string;
    copiedFrom: string | null;
  }): Promise<DevdigestDocRecord | undefined> {
    const [row] = await this.db
      .insert(t.devdigestDocs)
      .values(input)
      .onConflictDoNothing({ target: [t.devdigestDocs.repoId, t.devdigestDocs.path] })
      .returning();
    return row ? toRecord(row) : undefined;
  }

  async updateContent(workspaceId: string, id: string, content: string): Promise<DevdigestDocRecord | undefined> {
    const [row] = await this.db
      .update(t.devdigestDocs)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(t.devdigestDocs.id, id), eq(t.devdigestDocs.workspaceId, workspaceId)))
      .returning();
    return row ? toRecord(row) : undefined;
  }

  async deleteAndDetach(
    workspaceId: string,
    id: string,
  ): Promise<{ repoId: string; path: string; detached: number } | undefined> {
    return this.db.transaction(async (tx) => {
      const [doc] = await tx
        .select({ repoId: t.devdigestDocs.repoId, path: t.devdigestDocs.path })
        .from(t.devdigestDocs)
        .where(and(eq(t.devdigestDocs.id, id), eq(t.devdigestDocs.workspaceId, workspaceId)))
        .limit(1);
      if (!doc) return undefined;
      const detached = await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.repoId, doc.repoId), eq(t.agentContextDocs.path, doc.path)))
        .returning({ agentId: t.agentContextDocs.agentId });
      await tx
        .delete(t.devdigestDocs)
        .where(and(eq(t.devdigestDocs.id, id), eq(t.devdigestDocs.workspaceId, workspaceId)));
      return { repoId: doc.repoId, path: doc.path, detached: detached.length };
    });
  }

  async attachedAgents(workspaceId: string, repoId: string, path: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentContextDocs)
      .innerJoin(
        t.agents,
        and(eq(t.agents.id, t.agentContextDocs.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(and(eq(t.agentContextDocs.repoId, repoId), eq(t.agentContextDocs.path, path)))
      .orderBy(asc(t.agents.name));
  }
}
