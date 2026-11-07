import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff } from './build.js';
import { latestReviewFindings } from './domain.js';
import type { SmartDiffRepositoryPort, SmartDiffReviewSource } from './ports.js';

export interface SmartDiffDeps {
  reviewRepo: SmartDiffReviewSource;
  smartDiffRepo: SmartDiffRepositoryPort;
}

export class SmartDiffService {
  constructor(private readonly deps: SmartDiffDeps) {}

  async forPull(workspaceId: string, prId: string): Promise<SmartDiff> {
    // Workspace check first: child tables (pr_files, reviews, findings) have no workspace filter.
    const pull = await this.deps.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, rows] = await Promise.all([
      this.deps.smartDiffRepo.listFiles(workspaceId, prId),
      this.deps.reviewRepo.reviewsForPull(prId),
    ]);
    return buildSmartDiff(files, latestReviewFindings(rows));
  }
}
