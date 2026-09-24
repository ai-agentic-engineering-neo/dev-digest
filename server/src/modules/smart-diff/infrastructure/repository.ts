/**
 * smart-diff data access (infrastructure; implements SmartDiffSource). Reads
 * pr_files and the newest review's findings directly — each module owns the
 * reads it needs (server/INSIGHTS.md).
 */
import { and, desc, eq } from 'drizzle-orm';
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

  /** start_line of ALL findings (dismissed too) on the newest review row (desc(createdAt), limit 1); [] with no review. */
  async latestReviewFindings(prId: string): Promise<SmartDiffFindingInput[]> {
    const [latest] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(eq(t.reviews.prId, prId))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!latest) return [];
    return this.db
      .select({ file: t.findings.file, start_line: t.findings.startLine })
      .from(t.findings)
      .where(eq(t.findings.reviewId, latest.id));
  }
}
