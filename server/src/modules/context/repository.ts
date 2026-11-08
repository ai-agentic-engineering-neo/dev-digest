import { and, asc, count, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ContextRepoRef, ContextRepositoryPort } from './ports.js';

/**
 * Storage for the Project Context Folder. `agent_context_docs` has no workspace_id; the service
 * checks both parents with `repoInWorkspace` + `agentInWorkspace` first, and the per-repo counts
 * join `agents.workspace_id` themselves.
 */
export class ContextRepository implements ContextRepositoryPort {
  constructor(private readonly db: Db) {}

  async repoInWorkspace(workspaceId: string, repoId: string): Promise<ContextRepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  async agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
      .limit(1);
    return !!row;
  }

  async listAttachments(agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  async replaceAttachments(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, position) => ({ agentId, repoId, path, position })));
      }
    });
  }

  async attachedAgentCounts(workspaceId: string, repoId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path, n: count() })
      .from(t.agentContextDocs)
      .innerJoin(
        t.agents,
        and(eq(t.agents.id, t.agentContextDocs.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(eq(t.agentContextDocs.repoId, repoId))
      .groupBy(t.agentContextDocs.path);
    return new Map(rows.map((r) => [r.path, Number(r.n)]));
  }
}
