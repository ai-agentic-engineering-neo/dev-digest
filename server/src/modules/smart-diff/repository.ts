/** smart-diff persistence (ring 3a). Reads files and the latest review per agent. */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SmartDiffInputs, SmartDiffRepositoryPort } from './ports.js';

export class SmartDiffRepository implements SmartDiffRepositoryPort {
  constructor(private readonly db: Db) {}

  async getInputs(workspaceId: string, prId: string): Promise<SmartDiffInputs | undefined> {
    const [pr] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pr) return undefined;

    const files = await this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));

    // DISTINCT ON treats NULL agent ids as one group.
    const latest = await this.db
      .selectDistinctOn([t.reviews.agentId], { id: t.reviews.id })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(t.reviews.agentId, desc(t.reviews.createdAt));
    const ids = latest.map((r) => r.id);

    const rows = ids.length
      ? await this.db
          .select({
            id: t.findings.id,
            file: t.findings.file,
            startLine: t.findings.startLine,
            dismissedAt: t.findings.dismissedAt,
          })
          .from(t.findings)
          .where(inArray(t.findings.reviewId, ids))
      : [];

    return {
      files,
      findings: rows.map((r) => ({
        id: r.id,
        file: r.file,
        startLine: r.startLine,
        dismissed: r.dismissedAt != null,
      })),
      hasReview: ids.length > 0,
    };
  }
}
