import { and, asc, count, eq } from 'drizzle-orm';
import { FeatureModelChoice } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { StoredBrief } from './domain/types.js';
import type { BriefFileRow, BriefPullContext, BriefRepositoryPort } from './ports.js';
import { StoredBriefSchema } from './schemas.js';

/**
 * Brief data-access. Owns `pr_brief`; reads `pull_requests`, `repos`, `pr_files`, `settings`.
 * `pr_brief` / `pr_files` have no workspace_id: callers must go through `getPullContext`
 * (workspace-filtered) before using a prId.
 */
export class BriefRepository implements BriefRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPullContext(workspaceId: string, prId: string): Promise<BriefPullContext | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        fullName: t.repos.fullName,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(
        and(
          eq(t.pullRequests.id, prId),
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.repos.workspaceId, workspaceId),
        ),
      );
    return row;
  }

  async listChangedFiles(prId: string): Promise<BriefFileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
  }

  async countChangedFiles(prId: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return row?.n ?? 0;
  }

  async get(prId: string): Promise<StoredBrief | undefined> {
    const [row] = await this.db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return undefined;
    const parsed = StoredBriefSchema.safeParse(row.json);
    return parsed.success ? parsed.data : undefined;
  }

  async save(prId: string, brief: StoredBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }

  async featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    const value: unknown = row?.value;
    const choices = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
    const parsed = FeatureModelChoice.safeParse(choices?.risk_brief);
    return parsed.success ? parsed.data : undefined;
  }
}
