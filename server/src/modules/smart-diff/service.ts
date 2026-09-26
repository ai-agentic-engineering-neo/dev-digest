/**
 * SmartDiffService (ring ②). No web-framework or ORM imports: all data comes
 * from `container.reviewRepo` (onion-architecture §4). No own `repository.ts` —
 * the reads it needs already live on `ReviewRepository`.
 */
import type { SmartDiffResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import {
  buildSmartDiff,
  latestReviewPerAgent,
  type SmartDiffSourceFile,
  type SmartDiffSourceReview,
} from './helpers.js';

export class SmartDiffService {
  constructor(private container: Container) {}

  async get(workspaceId: string, prId: string, logger?: PinoLike): Promise<SmartDiffResponse> {
    const start = Date.now();
    const repo = this.container.reviewRepo;

    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [fileRows, reviewRows] = await Promise.all([repo.getPrFiles(prId), repo.reviewsForPull(prId)]);

    const files: SmartDiffSourceFile[] = fileRows.map((row) => ({
      path: row.path,
      additions: row.additions,
      deletions: row.deletions,
    }));

    const reviews: SmartDiffSourceReview[] = reviewRows.map(({ review, findings }) => ({
      id: review.id,
      agentId: review.agentId,
      createdAt: review.createdAt,
      findings: findings.map((f) => ({
        file: f.file,
        startLine: f.startLine,
        dismissedAt: f.dismissedAt,
      })),
    }));

    const result = buildSmartDiff(files, reviews);

    const byRole: Record<string, number> = { core: 0, tests: 0, wiring: 0, docs: 0, boilerplate: 0 };
    let findingsCount = 0;
    for (const group of result.groups) {
      byRole[group.role] = group.files.length;
      for (const file of group.files) findingsCount += file.finding_lines.length;
    }

    logger?.info(
      {
        prId,
        files: files.length,
        byRole,
        findings: findingsCount,
        reviewsKept: latestReviewPerAgent(reviews).length,
        totalLines: result.split_suggestion.total_lines,
        tooBig: result.split_suggestion.too_big,
        durationMs: Date.now() - start,
      },
      'smart-diff: built',
    );

    return result;
  }
}
