import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

/**
 * Intent data-access. Owns `pr_intent`. Every read/write is workspace-scoped.
 * `getPrFilePatches` has no workspace column of its own (`pr_files` hangs off
 * the PR), so callers must prove the workspace through `getPull` first.
 */

export type PrIntentRow = typeof t.prIntent.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;

export interface PrFilePatch {
  path: string;
  patch: string | null;
}

/** Everything but `updatedAt`, which the upsert always stamps itself. */
export type PrIntentUpsert = Omit<typeof t.prIntent.$inferInsert, 'updatedAt'>;

export class IntentRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped PR lookup. */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** Workspace-scoped repo lookup. */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Changed files of a PR with their patches. Call only after `getPull` proved the workspace. */
  async getPrFilePatches(prId: string): Promise<PrFilePatch[]> {
    return this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async get(workspaceId: string, prId: string): Promise<PrIntentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.prIntent)
      .where(and(eq(t.prIntent.workspaceId, workspaceId), eq(t.prIntent.prId, prId)));
    return row;
  }

  /**
   * One statement (insert-or-update on the `pr_id` PK), so no transaction is
   * needed. `workspace_id` is written on insert and deliberately NOT in `set`:
   * the `where` guard makes a conflicting row of another workspace a no-op.
   */
  async upsert(values: PrIntentUpsert): Promise<void> {
    await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: values.intent,
          inScope: values.inScope,
          outOfScope: values.outOfScope,
          confidence: values.confidence,
          sources: values.sources,
          missingContext: values.missingContext,
          headSha: values.headSha ?? null,
          provider: values.provider ?? null,
          model: values.model ?? null,
          tokensIn: values.tokensIn ?? null,
          tokensOut: values.tokensOut ?? null,
          updatedAt: sql`now()`,
        },
        setWhere: eq(t.prIntent.workspaceId, values.workspaceId),
      });
  }
}
