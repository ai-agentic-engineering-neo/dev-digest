import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { ReposRepository } from '../domain/ports.js';
import type { NewRepo, Repo } from '../domain/types.js';

type RepoRow = typeof t.repos.$inferSelect;

function toRepo(r: RepoRow): Repo {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    owner: r.owner,
    name: r.name,
    fullName: r.fullName,
    defaultBranch: r.defaultBranch,
    clonePath: r.clonePath,
    lastPolledAt: r.lastPolledAt,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

/** F1 — the only writer of the `repos` table. */
export class DrizzleReposRepository implements ReposRepository {
  constructor(private readonly db: Db) {}

  async findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row ? toRepo(row) : undefined;
  }

  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toRepo);
  }

  async getById(workspaceId: string, id: string): Promise<Repo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row ? toRepo(row) : undefined;
  }

  async insert(values: NewRepo): Promise<Repo> {
    const [row] = await this.db.insert(t.repos).values(values).returning();
    return toRepo(row!);
  }

  async workspaceIdFor(repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: t.repos.workspaceId })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row?.workspaceId ?? null;
  }

  async recordClone(repoId: string, clonePath: string, at: Date): Promise<void> {
    await this.db.update(t.repos).set({ clonePath, lastPolledAt: at }).where(eq(t.repos.id, repoId));
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)))
      .returning({ id: t.repos.id });
    return deleted.length > 0;
  }
}
