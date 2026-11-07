import type { ReviewWithFindings, SmartDiffFileInput } from './domain.js';

export interface SmartDiffRepositoryPort {
  /** pr_files of the PR, DB order; [] when the PR is not in this workspace. */
  listFiles(workspaceId: string, prId: string): Promise<SmartDiffFileInput[]>;
}

/** Satisfied structurally by container.reviewRepo (ReviewRepository.getPull / reviewsForPull). */
export interface SmartDiffReviewSource {
  getPull(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
  reviewsForPull(prId: string): Promise<ReviewWithFindings[]>;
}
