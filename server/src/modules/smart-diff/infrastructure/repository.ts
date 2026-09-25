/**
 * smart-diff data access (infrastructure; implements SmartDiffSource). Reads
 * pr_files and the current reviews' findings (each agent's newest) directly — each module owns the
 * reads it needs (server/INSIGHTS.md).
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { SmartDiffFileInput, SmartDiffFindingInput } from '../domain/smart-diff.js';
import type { SmartDiffSource } from '../application/ports.js';

export class SmartDiffRepository implements SmartDiffSource {
  constructor(private readonly db: Db) {}

  async pullExists(workspaceId: string, prId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row !== undefined;
  }

  async listFiles(prId: string): Promise<SmartDiffFileInput[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * start_line of ALL findings (dismissed too) on the newest `kind='review'`
   * row of EACH agent (DISTINCT ON agent, desc(createdAt)) — a re-run replaces
   * that agent's earlier findings; [] with no review.
   */
  async latestReviewFindings(prId: string): Promise<SmartDiffFindingInput[]> {
    const current = await this.db
      .selectDistinctOn([t.reviews.agentId], { id: t.reviews.id })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(t.reviews.agentId, desc(t.reviews.createdAt));
    if (current.length === 0) return [];
    return this.db
      .select({ file: t.findings.file, start_line: t.findings.startLine })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, current.map((r) => r.id)));
  }
}
