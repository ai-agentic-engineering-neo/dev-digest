import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OverrideDto, ProjectContextRepositoryPort, UsageCount } from './ports.js';

/**
 * project-context data access: the skill link table and the usage counts.
 * The agent link table is written by `AgentsRepository.setContext` because the
 * agent version bump and snapshot must share its transaction.
 */
export class ProjectContextRepository implements ProjectContextRepositoryPort {
  constructor(private readonly db: Db) {}

  async overrides(workspaceId: string, repoId: string, paths?: string[]): Promise<OverrideDto[]> {
    if (paths && paths.length === 0) return [];
    const o = t.contextDocOverrides;
    const rows = await this.db
      .select()
      .from(o)
      .where(
        and(
          eq(o.workspaceId, workspaceId),
          eq(o.repoId, repoId),
          paths ? inArray(o.path, paths) : undefined,
        ),
      );
    return rows.map(toOverrideDto);
  }

  async upsertOverride(
    workspaceId: string,
    repoId: string,
    input: { path: string; text: string; sha: string },
  ): Promise<OverrideDto> {
    const o = t.contextDocOverrides;
    const [row] = await this.db
      .insert(o)
      .values({ workspaceId, repoId, path: input.path, text: input.text, sha: input.sha })
      .onConflictDoUpdate({
        target: [o.repoId, o.path],
        set: { text: input.text, sha: input.sha, updatedAt: sql`now()` },
        setWhere: eq(o.workspaceId, workspaceId),
      })
      .returning();
    if (!row) throw new Error('override upsert returned no row');
    return toOverrideDto(row);
  }

  async deleteOverride(workspaceId: string, repoId: string, path: string): Promise<boolean> {
    const o = t.contextDocOverrides;
    const rows = await this.db
      .delete(o)
      .where(and(eq(o.workspaceId, workspaceId), eq(o.repoId, repoId), eq(o.path, path)))
      .returning({ path: o.path });
    return rows.length > 0;
  }

  async skillPaths(workspaceId: string, skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(
        and(
          eq(t.skillContextDocs.workspaceId, workspaceId),
          eq(t.skillContextDocs.skillId, skillId),
          eq(t.skillContextDocs.repoId, repoId),
        ),
      )
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  async setSkillPaths(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextDocs)
        .where(
          and(
            eq(t.skillContextDocs.workspaceId, workspaceId),
            eq(t.skillContextDocs.skillId, skillId),
            eq(t.skillContextDocs.repoId, repoId),
          ),
        );
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, i) => ({ workspaceId, skillId, repoId, path, order: i })));
      }
    });
  }

  async usageCounts(workspaceId: string, repoId: string): Promise<UsageCount[]> {
    const [agentRows, skillRows, directUsers, skillUsers] = await Promise.all([
      this.db
        .select({ path: t.agentContextDocs.path, n: count() })
        .from(t.agentContextDocs)
        .where(
          and(
            eq(t.agentContextDocs.workspaceId, workspaceId),
            eq(t.agentContextDocs.repoId, repoId),
          ),
        )
        .groupBy(t.agentContextDocs.path),
      this.db
        .select({ path: t.skillContextDocs.path, n: count() })
        .from(t.skillContextDocs)
        .where(
          and(
            eq(t.skillContextDocs.workspaceId, workspaceId),
            eq(t.skillContextDocs.repoId, repoId),
          ),
        )
        .groupBy(t.skillContextDocs.path),
      // enabled agents that attach the path themselves
      this.db
        .select({ path: t.agentContextDocs.path, agentId: t.agentContextDocs.agentId })
        .from(t.agentContextDocs)
        .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
        .where(
          and(
            eq(t.agentContextDocs.workspaceId, workspaceId),
            eq(t.agentContextDocs.repoId, repoId),
            eq(t.agents.enabled, true),
          ),
        ),
      // enabled agents that inherit the path through an enabled skill they link
      this.db
        .select({ path: t.skillContextDocs.path, agentId: t.agentSkills.agentId })
        .from(t.skillContextDocs)
        .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skillContextDocs.skillId))
        .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
        .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
        .where(
          and(
            eq(t.skillContextDocs.workspaceId, workspaceId),
            eq(t.skillContextDocs.repoId, repoId),
            eq(t.agents.enabled, true),
            eq(t.skills.enabled, true),
          ),
        ),
    ]);
    const empty = (path: string): UsageCount => ({ path, agents: 0, skills: 0, agentsUsing: 0 });
    const byPath = new Map<string, UsageCount>();
    for (const r of agentRows) byPath.set(r.path, { ...empty(r.path), agents: r.n });
    for (const r of skillRows) {
      const cur = byPath.get(r.path) ?? empty(r.path);
      cur.skills = r.n;
      byPath.set(r.path, cur);
    }
    const usersByPath = new Map<string, Set<string>>();
    for (const r of [...directUsers, ...skillUsers]) {
      const set = usersByPath.get(r.path) ?? new Set<string>();
      set.add(r.agentId);
      usersByPath.set(r.path, set);
    }
    for (const [path, set] of usersByPath) {
      const cur = byPath.get(path) ?? empty(path);
      cur.agentsUsing = set.size;
      byPath.set(path, cur);
    }
    return [...byPath.values()];
  }

  async skillPathsFor(
    workspaceId: string,
    repoId: string,
    skillIds: string[],
  ): Promise<Record<string, string[]>> {
    if (skillIds.length === 0) return {};
    const rows = await this.db
      .select({ skillId: t.skillContextDocs.skillId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(
        and(
          eq(t.skillContextDocs.workspaceId, workspaceId),
          eq(t.skillContextDocs.repoId, repoId),
          inArray(t.skillContextDocs.skillId, skillIds),
        ),
      )
      .orderBy(asc(t.skillContextDocs.skillId), asc(t.skillContextDocs.order));
    const out: Record<string, string[]> = {};
    for (const r of rows) (out[r.skillId] ??= []).push(r.path);
    return out;
  }
}

function toOverrideDto(row: typeof t.contextDocOverrides.$inferSelect): OverrideDto {
  return { path: row.path, text: row.text, sha: row.sha, updatedAt: row.updatedAt.toISOString() };
}
